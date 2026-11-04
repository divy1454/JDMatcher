import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { candidates } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { authGuard } from '../middleware/authGuard.js';
import { deviceGuard } from '../middleware/deviceGuard.js';
import { depositGuard } from '../middleware/depositGuard.js';
import { GeminiService } from '../services/geminiService.js';
import { BillingService } from '../services/billingService.js';
import { telemetryService } from '../services/telemetryService.js';
import { cityStateFromResume } from '../services/resumeLocation.js';

const unresolvedFieldSchema = z.object({
  id: z.string().max(255),
  elementIndex: z.number().int().min(0).max(2000),
  name: z.string().max(255),
  label: z.string().max(1000),
  question: z.string().max(1000).optional(),
  type: z.string().max(50),
  options: z.array(z.string().max(500)).max(400).optional(),
  placeholder: z.string().max(1000).optional(),
  isRequired: z.boolean().optional(),
  currentValue: z.string().max(5000).optional(),
  maxLength: z.number().int().min(1).max(100000).optional(),
});

const autofillConfirmSchema = z.object({
  candidateId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        question: z.string().min(3).max(500),
        answer: z.string().min(1).max(1000),
        fieldType: z.string().max(50).optional(),
      })
    )
    .min(1)
    .max(60),
});

const MAX_SAVED_RESPONSES = 300;

/** Question text compared without case or punctuation. */
const normalizeQuestion = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Visa statuses that never need employer sponsorship. */
const NO_SPONSORSHIP_STATUSES = new Set(['US Citizen', 'Green Card']);

const autofillResolveSchema = z.object({
  candidateId: z.string().uuid(),
  jobTitle: z.string().max(255).optional(),
  companyName: z.string().max(255).optional(),
  jobDescription: z.string().max(20000).optional(),
  unresolvedFields: z.array(unresolvedFieldSchema).min(1, 'At least one unresolved field is required').max(40, 'Maximum 40 fields per batch'),
});

export const autofillRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/v1/extension/candidate-profile/:id
  fastify.get(
    '/candidate-profile/:id',
    { preHandler: [authGuard, depositGuard] },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      if (user.role === 'super_admin') {
        return reply.status(403).send({
          error: 'ZERO_KNOWLEDGE_VIOLATION',
          message: 'Super Admins are strictly prohibited from inspecting candidate profiles',
        });
      }

      const conditions = [
        eq(candidates.id, id),
        eq(candidates.organizationId, user.organizationId!),
        eq(candidates.isActive, true),
      ];

      if (user.role === 'recruiter') {
        conditions.push(eq(candidates.createdByRecruiterId, user.id));
      }

      const [candidate] = await db
        .select()
        .from(candidates)
        .where(and(...conditions))
        .limit(1);

      if (!candidate) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Candidate not found or access denied',
        });
      }

      // Auto-populate empty structuredProfile via one-time AI extraction & persist in DB
      let rawStructured = (candidate.structuredProfile as Record<string, any>) || {};
      if (!rawStructured || Object.keys(rawStructured).length === 0) {
        try {
          const extractResult = await GeminiService.extractSpeedyApplyProfile(candidate.rawResumeText, {
            fullName: candidate.fullName,
            primaryTitle: candidate.primaryTitle,
            visaStatus: candidate.visaStatus,
            yearsOfExperience: candidate.yearsOfExperience,
            keySkills: candidate.keySkills || [],
          });
          rawStructured = extractResult.profile;

          // Persist in DB for 0ms future fetches
          await db
            .update(candidates)
            .set({
              structuredProfile: rawStructured,
              updatedAt: new Date(),
            })
            .where(eq(candidates.id, candidate.id));

          // Record token consumption in billing ledger
          BillingService.recordEvaluationConsumption(
            user.organizationId!,
            user.id,
            extractResult.usage,
            'autofill_resolve'
          ).catch((billingErr) => {
            request.log.error(billingErr, 'Failed to record profile extraction consumption');
          });
        } catch (extractErr) {
          request.log.error(extractErr, 'Failed to backfill candidate structured profile');
        }
      }

      // Fallback resume file generation from rawResumeText if resumeFileBase64 is null
      let resumeFileBase64 = candidate.resumeFileBase64;
      let resumeFileName = candidate.resumeFileName;
      let resumeMimeType = candidate.resumeMimeType;

      if (!resumeFileBase64 && candidate.rawResumeText) {
        resumeFileName = `${candidate.fullName.replace(/\s+/g, '_')}_Resume.txt`;
        resumeFileBase64 = Buffer.from(candidate.rawResumeText, 'utf-8').toString('base64');
        resumeMimeType = 'text/plain';

        await db
          .update(candidates)
          .set({
            resumeFileBase64,
            resumeFileName,
            resumeMimeType,
            updatedAt: new Date(),
          })
          .where(eq(candidates.id, candidate.id));
      }

      const nameParts = candidate.fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Screening answers the profile doesn't have get a default, and the extension flags them for review
      // Drop empty values so they don't wipe out the defaults below
      const rawScreening: Record<string, any> = Object.fromEntries(
        Object.entries((rawStructured.screening as Record<string, any>) || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
      );
      const assumed: string[] = [];
      if (rawScreening.authorizedToWorkInUS === undefined || rawScreening.authorizedToWorkInUS === null) assumed.push('authorizedToWorkInUS');
      if (rawScreening.willingToRelocate === undefined || rawScreening.willingToRelocate === null) assumed.push('willingToRelocate');
      if (rawScreening.noticePeriodWeeks === undefined || rawScreening.noticePeriodWeeks === null || rawScreening.noticePeriodWeeks === '') {
        assumed.push('noticePeriodWeeks');
      }
      const totalYearsExperience = candidate.yearsOfExperience && candidate.yearsOfExperience > 0 ? candidate.yearsOfExperience : undefined;
      const social: Record<string, any> = rawStructured.social || {};

      // Many forms require a location; when the profile has none, use the city and state at the top of the resume
      const personalFromProfile: Record<string, any> = {
        firstName,
        lastName,
        fullName: candidate.fullName,
        email: rawStructured.personal?.email || '',
        phone: rawStructured.personal?.phone || '',
        phoneCountryCode: rawStructured.personal?.phoneCountryCode || '+1',
        address: rawStructured.personal?.address || '',
        city: rawStructured.personal?.city || '',
        state: rawStructured.personal?.state || '',
        zipCode: rawStructured.personal?.zipCode || '',
        country: rawStructured.personal?.country || 'United States',
        citizenshipStatus: rawStructured.personal?.citizenshipStatus || candidate.visaStatus,
        veteranStatus: rawStructured.personal?.veteranStatus,
        disabilityStatus: rawStructured.personal?.disabilityStatus,
        gender: rawStructured.personal?.gender,
        raceEthnicity: rawStructured.personal?.raceEthnicity,
        ...(rawStructured.personal || {}),
      };
      if (!personalFromProfile.city || !personalFromProfile.state) {
        const fromResume = cityStateFromResume(candidate.rawResumeText || '');
        if (fromResume) {
          if (!personalFromProfile.city) personalFromProfile.city = fromResume.city;
          if (!personalFromProfile.state) personalFromProfile.state = fromResume.state;
        }
      }

      const profilePayload = {
        id: candidate.id,
        fullName: candidate.fullName,
        primaryTitle: candidate.primaryTitle,
        totalYearsExperience,
        personal: personalFromProfile,
        education: rawStructured.education || [],
        workHistory: rawStructured.workHistory || [],
        social: { ...social, otherWebsiteUrl: social.otherWebsiteUrl || social.otherUrl },
        equalOpportunity: rawStructured.equalOpportunity || {},
        screening: {
          authorizedToWorkInUS: true,
          requireSponsorship: !NO_SPONSORSHIP_STATUSES.has(candidate.visaStatus),
          currentSponsorshipType: candidate.visaStatus,
          securityClearanceLevel: candidate.securityClearance,
          willingToRelocate: true,
          noticePeriodWeeks: '2',
          ...rawScreening,
          // The portal saves "desiredSalary"; older profiles use "desiredSalaryUsd"
          desiredSalaryUsd: rawScreening.desiredSalaryUsd ?? rawScreening.desiredSalary,
          assumed,
        },
        applicationQuestions: rawStructured.applicationQuestions || {},
        savedResponses: candidate.savedResponses || [],
        resumeFileBase64: resumeFileBase64 || undefined,
        resumeFileName: resumeFileName || undefined,
        resumeMimeType: resumeMimeType || undefined,
        rawResumeText: candidate.rawResumeText,
      };

      return reply.send({
        success: true,
        candidate: profilePayload,
      });
    }
  );

  // POST /api/v1/extension/autofill-resolve
  fastify.post(
    '/autofill-resolve',
    { preHandler: [authGuard, deviceGuard, depositGuard] },
    async (request, reply) => {
      const user = request.user!;
      const parseResult = autofillResolveSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'INVALID_PAYLOAD',
          details: parseResult.error.issues,
        });
      }

      const { candidateId, jobTitle, companyName, jobDescription, unresolvedFields } = parseResult.data;

      // Verify candidate access
      const conditions = [
        eq(candidates.id, candidateId),
        eq(candidates.organizationId, user.organizationId!),
        eq(candidates.isActive, true),
      ];

      if (user.role === 'recruiter') {
        conditions.push(eq(candidates.createdByRecruiterId, user.id));
      }

      const [candidate] = await db
        .select()
        .from(candidates)
        .where(and(...conditions))
        .limit(1);

      if (!candidate) {
        return reply.status(404).send({
          error: 'CANDIDATE_NOT_FOUND',
          message: 'Candidate profile not found or access denied',
        });
      }

      try {
        const aiResponse = await GeminiService.autofillResolve(
          (candidate.structuredProfile as Record<string, any>) || { fullName: candidate.fullName, primaryTitle: candidate.primaryTitle },
          candidate.rawResumeText,
          unresolvedFields,
          { jobTitle, companyName, jobDescription }
        );

        // AI answers are NOT saved here any more. They used to be saved straight into savedResponses and
        // reused on later jobs without anyone checking them. The extension now sends the answers the
        // recruiter actually submitted to /autofill-confirm instead.
        const currentSavedResponses: Array<Record<string, any>> = Array.isArray(candidate.savedResponses)
          ? candidate.savedResponses
          : [];

        // Record consumption and billing at 1x standard evaluation rate
        const billingResult = await BillingService.recordEvaluationConsumption(
          user.organizationId!,
          user.id,
          aiResponse.usage,
          'autofill_resolve'
        );

        // Telemetry broadcasting
        telemetryService.broadcastEvaluation({
          rawCostUsd: billingResult.rawCostUsd,
          billedCostUsd: billingResult.billedCostUsd,
          profitMarginUsd: Number((billingResult.billedCostUsd - billingResult.rawCostUsd).toFixed(6)),
          latencyMs: aiResponse.usage.latencyMs,
          totalTokens: aiResponse.usage.inputTokens + aiResponse.usage.outputTokens,
        });

        return reply.send({
          success: true,
          resolvedFields: aiResponse.result.resolvedFields,
          savedResponses: currentSavedResponses,
          billing: {
            billedCostUsd: billingResult.billedCostUsd,
          },
        });
      } catch (err: any) {
        request.log.error(err, 'Failed to resolve auto-fill fields via AI');
        return reply.status(500).send({
          error: 'AI_RESOLUTION_FAILED',
          message: err.message || 'Failed to resolve application fields',
        });
      }
    }
  );

  // POST /api/v1/extension/autofill-confirm
  // Saves the screening answers the recruiter actually submitted, so the next application can reuse them.
  fastify.post(
    '/autofill-confirm',
    { preHandler: [authGuard, deviceGuard] },
    async (request, reply) => {
      const user = request.user!;
      const parseResult = autofillConfirmSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }
      if (user.role === 'super_admin') {
        return reply.status(403).send({
          error: 'ZERO_KNOWLEDGE_VIOLATION',
          message: 'Super Admins are strictly prohibited from writing candidate profiles',
        });
      }

      const { candidateId, answers } = parseResult.data;
      const conditions = [
        eq(candidates.id, candidateId),
        eq(candidates.organizationId, user.organizationId!),
        eq(candidates.isActive, true),
      ];
      if (user.role === 'recruiter') {
        conditions.push(eq(candidates.createdByRecruiterId, user.id));
      }
      const [candidate] = await db.select().from(candidates).where(and(...conditions)).limit(1);
      if (!candidate) {
        return reply.status(404).send({ error: 'CANDIDATE_NOT_FOUND', message: 'Candidate profile not found or access denied' });
      }

      const saved: Array<Record<string, any>> = Array.isArray(candidate.savedResponses) ? [...candidate.savedResponses] : [];
      const now = new Date().toISOString();
      let changed = 0;
      for (const a of answers) {
        const key = normalizeQuestion(a.question);
        if (key.length < 4) continue;
        const idx = saved.findIndex((r: any) => normalizeQuestion(r.questionPattern || r.question || '') === key);
        const entry = {
          ...(idx >= 0 ? saved[idx] : {}),
          questionPattern: a.question,
          question: a.question,
          answer: a.answer,
          matchType: 'semantic',
          category: 'screening',
          source: 'confirmed',
          updatedAt: now,
        };
        if (idx >= 0) {
          // Never overwrite an answer the recruiter typed into the portal by hand
          if (saved[idx].source === 'manual' && saved[idx].answer !== a.answer) continue;
          saved[idx] = entry;
        } else {
          saved.push(entry);
        }
        changed++;
      }

      if (changed > 0) {
        // Keep the newest answers if the list grows too long
        const trimmed = saved
          .map((r, i) => ({ r, i }))
          .sort((x, y) => String(y.r.updatedAt || '').localeCompare(String(x.r.updatedAt || '')) || x.i - y.i)
          .slice(0, MAX_SAVED_RESPONSES)
          .sort((x, y) => x.i - y.i)
          .map((x) => x.r);
        await db.update(candidates).set({ savedResponses: trimmed, updatedAt: new Date() }).where(eq(candidates.id, candidate.id));
      }

      return reply.send({ success: true, saved: changed });
    }
  );
};
