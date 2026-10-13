import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { candidates, matchedJds, users, resumeAnalyses, organizations, tokenConsumptionLedger } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authGuard } from '../middleware/authGuard.js';
import { deviceGuard } from '../middleware/deviceGuard.js';
import { depositGuard } from '../middleware/depositGuard.js';
import { PromptService } from '../services/promptService.js';
import { GeminiService } from '../services/geminiService.js';
import { BillingService } from '../services/billingService.js';
import { telemetryService } from '../services/telemetryService.js';

const evaluateSchema = z.object({
  candidateId: z.string().uuid(),
  jdText: z.string().min(20, 'Job description must be at least 20 characters').max(20000, 'Job description exceeds 20,000 character limit'),
  jobTitle: z.string().max(255).optional(),
  jobUrl: z.string().max(2000).optional(),
  companyOrClient: z.string().max(255).optional(),
});

const analyzeResumeSchema = z.object({
  candidateId: z.string().uuid().optional(),
  rawResumeText: z.string().min(50, 'Resume text must be at least 50 characters').max(40000, 'Resume text exceeds 40,000 character limit').optional(),
  candidateName: z.string().max(255).optional(),
  candidateTitle: z.string().max(255).optional(),
}).refine((data) => !!(data.candidateId || data.rawResumeText), {
  message: 'Either candidateId or rawResumeText must be provided',
});

const saveAppliedSchema = z.object({
  matchedJdId: z.string().uuid().optional(),
  candidateId: z.string().uuid(),
  jobTitle: z.string().min(1).max(255),
  companyOrClient: z.string().max(255).optional(),
  jobUrl: z.string().max(2000).optional(),
  rawJdText: z.string().max(20000).optional().default(''),
  verdict: z.enum(['APPLY', 'SKIP', 'PENDING']),
  matchScore: z.number().int().min(0).max(100),
  matchReasoning: z.string().min(1).max(5000),
});

export const analyzeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/analyze/eval (Rate limited: 30 requests / minute)
  fastify.post(
    '/eval',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
      preHandler: [authGuard, deviceGuard, depositGuard],
    },
    async (request, reply) => {
      const parseResult = evaluateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const { candidateId, jdText } = parseResult.data;
      const user = request.user!;

      // Candidate must belong to recruiter's organization and (for recruiters) be assigned to them
      const candidateConditions = [
        eq(candidates.id, candidateId),
        eq(candidates.organizationId, user.organizationId!),
      ];
      if (user.role === 'recruiter') {
        candidateConditions.push(eq(candidates.createdByRecruiterId, user.id));
      }

      // Step 1: Fetch Candidate and Resolve Prompt Template concurrently in parallel
      const [[candidate], promptTemplate] = await Promise.all([
        db
          .select()
          .from(candidates)
          .where(and(...candidateConditions))
          .limit(1),
        PromptService.resolveTemplate(user.organizationId!),
      ]);

      if (!candidate || !candidate.isActive) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Candidate not found or access denied' });
      }

      // Step 2: Hydrate Prompt Variables
      const promptVariables = PromptService.buildVariables(candidate, jdText);
      const hydratedPrompt = PromptService.hydratePrompt(promptTemplate, promptVariables);

      // Step 3: Inference via Gemini 3.5 Flash-Lite strictly
      let evalResponse;
      try {
        evalResponse = await GeminiService.evaluate(hydratedPrompt);
      } catch (aiErr: any) {
        request.log.error(aiErr, 'AI Evaluation failed');
        return reply.status(502).send({
          error: 'AI_EVALUATION_FAILED',
          message: aiErr.message || 'AI evaluation failed. Please check AI key or service availability.',
        });
      }

      // Step 4 & 5: Offline Billing ledger & Telemetry Broadcast
      // Dispatched non-blocking so the recruiter gets evaluation results instantly
      BillingService.recordEvaluationConsumption(
        user.organizationId!,
        user.id,
        evalResponse.usage
      )
        .then((billing) => {
          telemetryService.broadcastEvaluation({
            rawCostUsd: billing.rawCostUsd,
            billedCostUsd: billing.billedCostUsd,
            profitMarginUsd: Number((billing.billedCostUsd - billing.rawCostUsd).toFixed(6)),
            latencyMs: evalResponse.usage.latencyMs,
            totalTokens: evalResponse.usage.inputTokens + evalResponse.usage.outputTokens,
          });
        })
        .catch((billingErr) => {
          request.log.error(billingErr, 'Background billing ledger recording failed');
        });

      // Auto-record initial evaluation in matched_jds with verdict 'PENDING'
      // If recruiter doesn't take action from extension, it will appear in recruiter portal to choose
      let initialCompany = evalResponse.result.companyName || '';
      let initialJobTitle = evalResponse.result.jobTitle || '';
      if (!initialCompany && jdText) {
        const compMatch = jdText.match(/(?:company|client|employer|organization|at|with)\s*[:\-–]?\s*([A-Z][A-Za-z0-9&.\s]{2,35})/);
        if (compMatch && compMatch[1]) initialCompany = compMatch[1].trim();
      }
      if (!initialJobTitle && jdText) {
        const titleMatch = jdText.match(/(?:job\s*title|role|position)\s*[:\-–]?\s*([^\n\r,\.]{3,50})/i);
        if (titleMatch && titleMatch[1]) {
          initialJobTitle = titleMatch[1].trim();
        } else {
          const firstLine = jdText.trim().split('\n')[0].replace(/[#*_-]/g, '').trim().slice(0, 60);
          if (firstLine && firstLine.length > 4 && !firstLine.toLowerCase().includes('job description')) {
            initialJobTitle = firstLine;
          }
        }
      }

      let pendingMatchedJdId: string | undefined;
      try {
        const [pendingMatchedJd] = await db
          .insert(matchedJds)
          .values({
            organizationId: user.organizationId!,
            recruiterId: user.id,
            candidateId: candidate.id,
            jobTitle: initialJobTitle || 'Software Opportunity',
            companyOrClient: initialCompany || null,
            jobUrl: parseResult.data.jobUrl || null,
            rawJdText: jdText,
            verdict: 'PENDING',
            matchScore: evalResponse.result.matchScore,
            matchReasoning: evalResponse.result.verdictJustification || evalResponse.result.reasoning || '',
          })
          .returning({ id: matchedJds.id });
        pendingMatchedJdId = pendingMatchedJd?.id;
      } catch (insertErr) {
        request.log.warn(insertErr, 'Failed to insert pending matched_jd record');
      }

      // Constraint 5: Recruiters must NEVER see token costs or quota gauges!
      return reply.send({
        matchedJdId: pendingMatchedJdId,
        candidateId: candidate.id,
        candidateName: candidate.fullName,
        candidateTitle: candidate.primaryTitle,
        verdict: evalResponse.result.verdict,
        verdictJustification: evalResponse.result.verdictJustification,
        jobTitle: evalResponse.result.jobTitle,
        companyName: evalResponse.result.companyName,
        eligibilityCheck: evalResponse.result.eligibilityCheck,
        isEligible: evalResponse.result.isEligible,
        matchAssessment: evalResponse.result.matchAssessment,
        candidateFitCheck: evalResponse.result.candidateFitCheck,
        naturalFitHighlights: evalResponse.result.naturalFitHighlights,
        applicationQuestions: evalResponse.result.applicationQuestions,
        otherNotes: evalResponse.result.otherNotes || '',
        matchScore: evalResponse.result.matchScore,
        visaMatch: evalResponse.result.visaMatch,
        clearanceMatch: evalResponse.result.clearanceMatch,
        workPrefMatch: evalResponse.result.workPrefMatch,
        keyStrengths: evalResponse.result.keyStrengths,
        missingCriticalSkills: evalResponse.result.missingCriticalSkills,
        reasoning: evalResponse.result.reasoning,
        strategicNotes: evalResponse.result.strategicNotes || '',
        evaluatedAt: new Date().toISOString(),
      });
    }
  );

  // POST /api/analyze/save-applied (Recruiter action: persists applied or skipped status)
  fastify.post(
    '/save-applied',
    { preHandler: [authGuard, deviceGuard] },
    async (request, reply) => {
      const parseResult = saveAppliedSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const user = request.user!;
      const data = parseResult.data;

      // Candidate must belong to recruiter's organization and (for recruiters) be assigned to them
      const candidateConditions = [
        eq(candidates.id, data.candidateId),
        eq(candidates.organizationId, user.organizationId!),
      ];
      if (user.role === 'recruiter') {
        candidateConditions.push(eq(candidates.createdByRecruiterId, user.id));
      }

      const [candidate] = await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(and(...candidateConditions))
        .limit(1);

      if (!candidate) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Candidate not found or access denied' });
      }

      let finalCompany = data.companyOrClient;
      if ((!finalCompany || finalCompany === 'Confidential / Client' || finalCompany === 'Client') && data.rawJdText) {
        const compMatch = data.rawJdText.match(/(?:company|client|employer|organization|at|with)\s*[:\-–]?\s*([A-Z][A-Za-z0-9&.\s]{2,35})/);
        if (compMatch && compMatch[1]) finalCompany = compMatch[1].trim();
      }

      let finalJobTitle = data.jobTitle;
      if ((!finalJobTitle || finalJobTitle === 'Opportunity' || finalJobTitle === 'Software Opportunity' || finalJobTitle === 'Job Application') && data.rawJdText) {
        const titleMatch = data.rawJdText.match(/(?:job\s*title|role|position)\s*[:\-–]?\s*([^\n\r,\.]{3,50})/i);
        if (titleMatch && titleMatch[1]) {
          finalJobTitle = titleMatch[1].trim();
        } else {
          const firstLine = data.rawJdText.trim().split('\n')[0].replace(/[#*_-]/g, '').trim().slice(0, 60);
          if (firstLine && firstLine.length > 4 && !firstLine.toLowerCase().includes('job description')) {
            finalJobTitle = firstLine;
          }
        }
      }

      // Requirement 4: If Not applied / SKIP, zero out raw JD text completely!
      const rawTextToSave = data.verdict === 'SKIP' ? '' : (data.rawJdText || '');

      let savedMatchedJd;

      // If matchedJdId is provided, update existing record with strict tenant and recruiter isolation
      if (data.matchedJdId) {
        const updateConditions = [
          eq(matchedJds.id, data.matchedJdId),
          eq(matchedJds.organizationId, user.organizationId!),
        ];
        if (user.role === 'recruiter') {
          updateConditions.push(eq(matchedJds.recruiterId, user.id));
        }

        const [updated] = await db
          .update(matchedJds)
          .set({
            jobTitle: finalJobTitle || data.jobTitle,
            companyOrClient: finalCompany || null,
            jobUrl: data.jobUrl || null,
            rawJdText: rawTextToSave,
            verdict: data.verdict,
            matchScore: data.matchScore,
            matchReasoning: data.matchReasoning,
          })
          .where(and(...updateConditions))
          .returning();
        savedMatchedJd = updated;
      }

      if (!savedMatchedJd) {
        const [inserted] = await db
          .insert(matchedJds)
          .values({
            organizationId: user.organizationId!,
            recruiterId: user.id,
            candidateId: data.candidateId,
            jobTitle: finalJobTitle || data.jobTitle,
            companyOrClient: finalCompany || null,
            jobUrl: data.jobUrl || null,
            rawJdText: rawTextToSave,
            verdict: data.verdict,
            matchScore: data.matchScore,
            matchReasoning: data.matchReasoning,
          })
          .returning();
        savedMatchedJd = inserted;
      }

      return reply.send({
        success: true,
        matchedJd: savedMatchedJd,
      });
    }
  );

  // PATCH /api/analyze/matched-jds/:id/verdict (Recruiter action: choose or switch verdict)
  fastify.patch(
    '/matched-jds/:id/verdict',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const bodySchema = z.object({
        verdict: z.enum(['APPLY', 'SKIP']),
      });
      const parse = bodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parse.error.issues });
      }

      const conditions = [
        eq(matchedJds.id, id),
        eq(matchedJds.organizationId, user.organizationId!),
      ];
      if (user.role === 'recruiter') {
        conditions.push(eq(matchedJds.recruiterId, user.id));
      }

      const [existing] = await db
        .select({
          id: matchedJds.id,
          candidateId: matchedJds.candidateId,
          recruiterId: matchedJds.recruiterId,
        })
        .from(matchedJds)
        .where(and(...conditions))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Matched JD not found or access denied' });
      }

      // Requirement 4: If switching to Not Applied (SKIP), clear raw JD text completely
      const updateData: { verdict: 'APPLY' | 'SKIP'; rawJdText?: string } = {
        verdict: parse.data.verdict,
      };
      if (parse.data.verdict === 'SKIP') {
        updateData.rawJdText = '';
      }

      const [updated] = await db
        .update(matchedJds)
        .set(updateData)
        .where(and(...conditions))
        .returning();

      return reply.send({ success: true, matchedJd: updated });
    }
  );

  // GET /api/analyze/matched-jds (Org Admin & Recruiters: View matched JDs for this agency)
  fastify.get(
    '/matched-jds',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const user = request.user!;
      if (user.role === 'super_admin') {
        // Zero-Knowledge: Super Admin has ZERO visibility into JD text or candidate matches!
        return reply.status(403).send({
          error: 'ZERO_KNOWLEDGE_VIOLATION',
          message: 'Super Admins are strictly prohibited from viewing organization job descriptions and evaluations',
        });
      }

      // Query and filter support (candidateId, recruiterId, verdict, limit, offset)
      const query = request.query as {
        limit?: string;
        offset?: string;
        candidateId?: string;
        recruiterId?: string;
        verdict?: string;
      };

      const conditions = [eq(matchedJds.organizationId, user.organizationId!)];

      // Recruiter isolation: Recruiters can strictly only see matched JDs for candidates created by or assigned to them
      if (user.role === 'recruiter') {
        conditions.push(eq(candidates.createdByRecruiterId, user.id));
      } else if (query.recruiterId) {
        conditions.push(eq(matchedJds.recruiterId, query.recruiterId));
      }

      if (query.candidateId) {
        conditions.push(eq(matchedJds.candidateId, query.candidateId));
      }

      if (query.verdict && (query.verdict === 'APPLY' || query.verdict === 'SKIP' || query.verdict === 'PENDING')) {
        conditions.push(eq(matchedJds.verdict, query.verdict as any));
      }

      const baseQuery = db
        .select({
          id: matchedJds.id,
          candidateId: matchedJds.candidateId,
          candidateName: candidates.fullName,
          recruiterId: matchedJds.recruiterId,
          recruiterName: users.fullName,
          jobTitle: matchedJds.jobTitle,
          companyOrClient: matchedJds.companyOrClient,
          jobUrl: matchedJds.jobUrl,
          rawJdText: matchedJds.rawJdText,
          verdict: matchedJds.verdict,
          matchScore: matchedJds.matchScore,
          matchReasoning: matchedJds.matchReasoning,
          appliedAt: matchedJds.appliedAt,
        })
        .from(matchedJds)
        .leftJoin(candidates, eq(matchedJds.candidateId, candidates.id))
        .leftJoin(users, eq(matchedJds.recruiterId, users.id))
        .where(and(...conditions))
        .orderBy(desc(matchedJds.appliedAt));

      const hasExplicitLimit = query.limit !== undefined && query.limit !== 'all' && query.limit !== '0' && query.limit !== 'none';
      const hasExplicitOffset = query.offset !== undefined && parseInt(query.offset, 10) > 0;

      let list;
      if (hasExplicitLimit || hasExplicitOffset) {
        let dynamicQuery = baseQuery.$dynamic();
        if (hasExplicitLimit) {
          const limitNum = Math.max(parseInt(query.limit!, 10) || 100, 1);
          dynamicQuery = dynamicQuery.limit(limitNum);
        }
        if (hasExplicitOffset) {
          const offsetNum = Math.max(parseInt(query.offset!, 10) || 0, 0);
          dynamicQuery = dynamicQuery.offset(offsetNum);
        }
        list = await dynamicQuery;
      } else {
        list = await baseQuery;
      }

      return reply.send(list);
    }
  );

  // POST /api/analyze/resume (Recruiter: Deep Resume Analysis & Sponsorship Research)
  fastify.post(
    '/resume',
    { preHandler: [authGuard, deviceGuard, depositGuard] },
    async (request, reply) => {
      const user = request.user!;

      // Requirement: Exclusively available to Recruiters
      if (user.role !== 'recruiter') {
        return reply.status(403).send({
          error: 'ACCESS_DENIED',
          message: 'The Resume Analyser is exclusively available to Recruiters.',
        });
      }

      const parseResult = analyzeResumeSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const { candidateId, rawResumeText, candidateName, candidateTitle } = parseResult.data;

      let finalResumeText = rawResumeText || '';
      let finalCandidateName = candidateName || 'Candidate';
      let finalCandidateTitle = candidateTitle || '';
      let finalCandidateId = candidateId || null;

      if (candidateId) {
        const [candidate] = await db
          .select()
          .from(candidates)
          .where(
            and(
              eq(candidates.id, candidateId),
              eq(candidates.organizationId, user.organizationId!),
              eq(candidates.createdByRecruiterId, user.id)
            )
          )
          .limit(1);

        if (!candidate || !candidate.isActive) {
          return reply.status(404).send({ error: 'NOT_FOUND', message: 'Candidate not found or access denied' });
        }

        finalResumeText = candidate.rawResumeText;
        finalCandidateName = candidate.fullName;
        finalCandidateTitle = candidate.primaryTitle;
        finalCandidateId = candidate.id;
      }

      if (!finalResumeText || finalResumeText.trim().length < 50) {
        return reply.status(400).send({
          error: 'INVALID_RESUME',
          message: 'Resume text is too short. Please provide a complete resume (at least 50 characters).',
        });
      }

      // Execute AI Analysis via Gemini 3.5 Flash-Lite
      let analysisResponse;
      try {
        analysisResponse = await GeminiService.analyzeResume(finalResumeText, finalCandidateName);
      } catch (aiErr: any) {
        request.log.error(aiErr, 'AI Resume Analysis failed');
        return reply.status(502).send({
          error: 'AI_ANALYSIS_FAILED',
          message: aiErr.message || 'AI resume analysis failed. Please check AI key or service availability.',
        });
      }

      // Record offline billing & telemetry (with stealth 3x token multiplier for resume analysis)
      BillingService.recordEvaluationConsumption(
        user.organizationId!,
        user.id,
        analysisResponse.usage,
        'resume_analysis'
      )
        .then((billing) => {
          telemetryService.broadcastEvaluation({
            rawCostUsd: billing.rawCostUsd,
            billedCostUsd: billing.billedCostUsd,
            profitMarginUsd: Number((billing.billedCostUsd - billing.rawCostUsd).toFixed(6)),
            latencyMs: analysisResponse.usage.latencyMs,
            totalTokens: (analysisResponse.usage.inputTokens + analysisResponse.usage.outputTokens) * 3,
          });
        })
        .catch((billingErr) => {
          request.log.error(billingErr, 'Background billing ledger recording failed for resume analysis');
        });

      // Persist in resume_analyses table
      let savedAnalysis;
      try {
        const [inserted] = await db
          .insert(resumeAnalyses)
          .values({
            organizationId: user.organizationId!,
            recruiterId: user.id,
            candidateId: finalCandidateId,
            candidateName: finalCandidateName,
            candidateTitle: finalCandidateTitle,
            rawResumeText: finalResumeText,
            totalYearsExperience: analysisResponse.result.candidateSnapshot?.totalYearsExperience || null,
            coreSpecialization: analysisResponse.result.candidateSnapshot?.coreSpecialization || null,
            targetSeniority: analysisResponse.result.candidateSnapshot?.targetSeniority || null,
            seniorityRationale: analysisResponse.result.candidateSnapshot?.seniorityRationale || null,
            industriesAndDomains: analysisResponse.result.industriesAndDomains || {},
            roleTiers: analysisResponse.result.roleTiers || [],
            honestNotes: analysisResponse.result.honestNotes || {},
            primaryFitCompanies: analysisResponse.result.primaryFitCompanies || [],
            secondaryFitCompanies: analysisResponse.result.secondaryFitCompanies || [],
            workflowNotes: analysisResponse.result.workflowNotes || {},
            fullMarkdown: analysisResponse.result.fullMarkdown || null,
          })
          .returning();
        savedAnalysis = inserted;
      } catch (insertErr) {
        request.log.error(insertErr, 'Failed to save resume analysis record');
      }

      return reply.send({
        id: savedAnalysis?.id,
        candidateId: finalCandidateId,
        candidateName: finalCandidateName,
        candidateTitle: finalCandidateTitle,
        ...analysisResponse.result,
        createdAt: savedAnalysis?.createdAt || new Date().toISOString(),
      });
    }
  );

  // GET /api/analyze/resume-history (Recruiter: List past resume analyses)
  fastify.get(
    '/resume-history',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== 'recruiter') {
        return reply.status(403).send({
          error: 'ACCESS_DENIED',
          message: 'Resume analysis history is exclusively available to Recruiters.',
        });
      }

      const list = await db
        .select({
          id: resumeAnalyses.id,
          candidateId: resumeAnalyses.candidateId,
          candidateName: resumeAnalyses.candidateName,
          candidateTitle: resumeAnalyses.candidateTitle,
          totalYearsExperience: resumeAnalyses.totalYearsExperience,
          coreSpecialization: resumeAnalyses.coreSpecialization,
          targetSeniority: resumeAnalyses.targetSeniority,
          createdAt: resumeAnalyses.createdAt,
        })
        .from(resumeAnalyses)
        .where(
          and(
            eq(resumeAnalyses.organizationId, user.organizationId!),
            eq(resumeAnalyses.recruiterId, user.id)
          )
        )
        .orderBy(desc(resumeAnalyses.createdAt))
        .limit(50);

      return reply.send(list);
    }
  );

  // GET /api/analyze/resume/:id (Recruiter: Get single resume analysis)
  fastify.get(
    '/resume/:id',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== 'recruiter') {
        return reply.status(403).send({
          error: 'ACCESS_DENIED',
          message: 'Resume analysis details are exclusively available to Recruiters.',
        });
      }

      const { id } = request.params as { id: string };

      const [item] = await db
        .select()
        .from(resumeAnalyses)
        .where(
          and(
            eq(resumeAnalyses.id, id),
            eq(resumeAnalyses.organizationId, user.organizationId!),
            eq(resumeAnalyses.recruiterId, user.id)
          )
        )
        .limit(1);

      if (!item) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Analysis not found' });
      }

      return reply.send({
        id: item.id,
        candidateId: item.candidateId,
        candidateName: item.candidateName,
        candidateTitle: item.candidateTitle,
        rawResumeText: item.rawResumeText,
        candidateSnapshot: {
          totalYearsExperience: item.totalYearsExperience || '',
          coreSpecialization: item.coreSpecialization || '',
          targetSeniority: item.targetSeniority || '',
          seniorityRationale: item.seniorityRationale || '',
        },
        industriesAndDomains: item.industriesAndDomains,
        roleTiers: item.roleTiers,
        honestNotes: item.honestNotes,
        primaryFitCompanies: item.primaryFitCompanies,
        secondaryFitCompanies: item.secondaryFitCompanies,
        workflowNotes: item.workflowNotes,
        fullMarkdown: item.fullMarkdown,
        createdAt: item.createdAt,
      });
    }
  );

  // DELETE /api/analyze/resume/:id (Recruiter: Delete saved resume analysis)
  fastify.delete(
    '/resume/:id',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== 'recruiter') {
        return reply.status(403).send({
          error: 'ACCESS_DENIED',
          message: 'Resume analysis deletion is exclusively available to Recruiters.',
        });
      }

      const { id } = request.params as { id: string };

      const [deleted] = await db
        .delete(resumeAnalyses)
        .where(
          and(
            eq(resumeAnalyses.id, id),
            eq(resumeAnalyses.organizationId, user.organizationId!),
            eq(resumeAnalyses.recruiterId, user.id)
          )
        )
        .returning({ id: resumeAnalyses.id });

      if (!deleted) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Analysis not found' });
      }

      return reply.send({ success: true, message: 'Analysis deleted successfully' });
    }
  );

  // GET /api/analyze/resume-stats (Org Admin & Super Admin: View resume analysis stats & counts)
  fastify.get(
    '/resume-stats',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== 'org_admin' && user.role !== 'super_admin') {
        return reply.status(403).send({
          error: 'ACCESS_DENIED',
          message: 'Resume analysis statistics are available to Org Admins and Super Admins.',
        });
      }

      if (user.role === 'org_admin') {
        const orgId = user.organizationId!;

        // 1. Total count of resume analyses from resumeAnalyses table
        const [totalCountRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(resumeAnalyses)
          .where(eq(resumeAnalyses.organizationId, orgId));

        // 2. Ledger aggregates for resume_analysis
        const [ledgerRow] = await db
          .select({
            totalTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.totalTokens}), 0)::int`,
            billedCostUsd: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
          })
          .from(tokenConsumptionLedger)
          .where(
            and(
              eq(tokenConsumptionLedger.organizationId, orgId),
              eq(tokenConsumptionLedger.actionType, 'resume_analysis')
            )
          );

        // 3. Per-recruiter breakdown in this agency
        const recruiterBreakdown = await db
          .select({
            recruiterId: users.id,
            recruiterName: users.fullName,
            recruiterEmail: users.email,
            analysisCount: sql<number>`count(${resumeAnalyses.id})::int`,
          })
          .from(users)
          .leftJoin(
            resumeAnalyses,
            and(
              eq(users.id, resumeAnalyses.recruiterId),
              eq(resumeAnalyses.organizationId, orgId)
            )
          )
          .where(
            and(
              eq(users.organizationId, orgId),
              eq(users.role, 'recruiter')
            )
          )
          .groupBy(users.id, users.fullName, users.email)
          .orderBy(desc(sql`count(${resumeAnalyses.id})`));

        return reply.send({
          role: 'org_admin',
          totalAnalyses: totalCountRow?.count || 0,
          totalTokens: ledgerRow?.totalTokens || 0,
          billedCostUsd: Number((ledgerRow?.billedCostUsd || 0).toFixed(4)),
          recruiterBreakdown,
        });
      }

      // Super Admin: platform-wide stats across all agencies
      const [superTotalCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(resumeAnalyses);

      const [superLedgerRow] = await db
        .select({
          totalTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.totalTokens}), 0)::int`,
          billedCostUsd: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
          rawCostUsd: sql<number>`coalesce(sum(${tokenConsumptionLedger.rawCostUsd}), 0)::float`,
        })
        .from(tokenConsumptionLedger)
        .where(eq(tokenConsumptionLedger.actionType, 'resume_analysis'));

      const orgBreakdown = await db
        .select({
          organizationId: organizations.id,
          organizationName: organizations.name,
          organizationSlug: organizations.slug,
          analysisCount: sql<number>`(SELECT count(*) FROM resume_analyses WHERE resume_analyses.organization_id = organizations.id)::int`,
          billedCostUsd: sql<number>`coalesce((SELECT sum(billed_cost_usd) FROM token_consumption_ledger WHERE token_consumption_ledger.organization_id = organizations.id AND token_consumption_ledger.action_type = 'resume_analysis'), 0)::float`,
          rawCostUsd: sql<number>`coalesce((SELECT sum(raw_cost_usd) FROM token_consumption_ledger WHERE token_consumption_ledger.organization_id = organizations.id AND token_consumption_ledger.action_type = 'resume_analysis'), 0)::float`,
          tokensConsumed: sql<number>`coalesce((SELECT sum(total_tokens) FROM token_consumption_ledger WHERE token_consumption_ledger.organization_id = organizations.id AND token_consumption_ledger.action_type = 'resume_analysis'), 0)::int`,
        })
        .from(organizations)
        .orderBy(desc(sql`(SELECT count(*) FROM resume_analyses WHERE resume_analyses.organization_id = organizations.id)`));

      const billed = Number((superLedgerRow?.billedCostUsd || 0).toFixed(4));
      const raw = Number((superLedgerRow?.rawCostUsd || 0).toFixed(4));

      return reply.send({
        role: 'super_admin',
        totalAnalyses: superTotalCountRow?.count || 0,
        totalTokens: superLedgerRow?.totalTokens || 0,
        billedCostUsd: billed,
        rawCostUsd: raw,
        profitMarginUsd: Number((billed - raw).toFixed(4)),
        orgBreakdown: orgBreakdown.map((o) => ({
          ...o,
          billedCostUsd: Number(Number(o.billedCostUsd).toFixed(4)),
          rawCostUsd: Number(Number(o.rawCostUsd).toFixed(4)),
          profitMarginUsd: Number((Number(o.billedCostUsd) - Number(o.rawCostUsd)).toFixed(4)),
        })),
      });
    }
  );
};
