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

const unresolvedFieldSchema = z.object({
  id: z.string().max(255),
  elementIndex: z.number().int().min(0).max(500),
  name: z.string().max(255),
  label: z.string().max(1000),
  type: z.string().max(50),
  options: z.array(z.string().max(500)).max(100).optional(),
  placeholder: z.string().max(1000).optional(),
  isRequired: z.boolean().optional(),
  currentValue: z.string().max(5000).optional(),
});

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

      const profilePayload = {
        id: candidate.id,
        fullName: candidate.fullName,
        primaryTitle: candidate.primaryTitle,
        personal: {
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
        },
        education: rawStructured.education || [],
        workHistory: rawStructured.workHistory || [],
        social: rawStructured.social || {},
        equalOpportunity: rawStructured.equalOpportunity || {},
        screening: {
          authorizedToWorkInUS: rawStructured.screening?.authorizedToWorkInUS ?? true,
          requireSponsorship: rawStructured.screening?.requireSponsorship ?? (candidate.visaStatus !== 'US Citizen' && candidate.visaStatus !== 'Green Card'),
          currentSponsorshipType: rawStructured.screening?.currentSponsorshipType || candidate.visaStatus,
          securityClearanceLevel: rawStructured.screening?.securityClearanceLevel || candidate.securityClearance,
          willingToRelocate: rawStructured.screening?.willingToRelocate ?? true,
          noticePeriodWeeks: rawStructured.screening?.noticePeriodWeeks || '2',
          desiredSalaryUsd: rawStructured.screening?.desiredSalaryUsd,
          ...(rawStructured.screening || {}),
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

        // Self-Learning Loop: Cache high-confidence responses into savedResponses
        const currentSavedResponses: Array<Record<string, any>> = Array.isArray(candidate.savedResponses)
          ? [...candidate.savedResponses]
          : [];

        const normalizedExisting = new Set(
          currentSavedResponses.map((r: any) =>
            (r.questionPattern || r.question || '').toLowerCase().replace(/[^a-z0-9]/g, '')
          )
        );

        let newResponsesAdded = false;

        for (const resolved of aiResponse.result.resolvedFields) {
          const inputField = unresolvedFields.find(
            (f) => f.id === resolved.fieldId || f.elementIndex === resolved.elementIndex
          );

          if (!inputField || !resolved.value) continue;

          // Exclude long essays or cover letters (> 500 chars) as they are typically job-specific
          if (resolved.value.length > 500) continue;

          // Check for high confidence (>= 0.85 or string 'HIGH')
          const isHighConfidence =
            typeof resolved.confidence === 'number'
              ? resolved.confidence >= 0.85
              : String(resolved.confidence).toUpperCase() === 'HIGH';

          if (!isHighConfidence) continue;

          const questionText = inputField.label || inputField.name;
          const normalizedQ = questionText.toLowerCase().replace(/[^a-z0-9]/g, '');

          if (normalizedQ.length > 3 && !normalizedExisting.has(normalizedQ)) {
            normalizedExisting.add(normalizedQ);
            currentSavedResponses.push({
              questionPattern: questionText,
              question: questionText,
              answer: resolved.value,
              matchType: 'semantic',
              category: 'screening',
              updatedAt: new Date().toISOString(),
            });
            newResponsesAdded = true;
          }
        }

        if (newResponsesAdded) {
          await db
            .update(candidates)
            .set({
              savedResponses: currentSavedResponses,
              updatedAt: new Date(),
            })
            .where(eq(candidates.id, candidate.id));
        }

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
};
