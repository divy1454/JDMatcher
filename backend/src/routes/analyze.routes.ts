import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { candidates, matchedJds } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authGuard } from '../middleware/authGuard.js';
import { deviceGuard } from '../middleware/deviceGuard.js';
import { depositGuard } from '../middleware/depositGuard.js';
import { PromptService } from '../services/promptService.js';
import { GeminiService } from '../services/geminiService.js';
import { BillingService } from '../services/billingService.js';
import { telemetryService } from '../services/telemetryService.js';

const evaluateSchema = z.object({
  candidateId: z.string().uuid(),
  jdText: z.string().min(20, 'Job description must be at least 20 characters'),
  jobTitle: z.string().optional(),
  jobUrl: z.string().optional(),
  companyOrClient: z.string().optional(),
});

const saveAppliedSchema = z.object({
  candidateId: z.string().uuid(),
  jobTitle: z.string().min(1),
  companyOrClient: z.string().optional(),
  jobUrl: z.string().optional(),
  rawJdText: z.string().min(1),
  verdict: z.enum(['APPLY', 'SKIP']),
  matchScore: z.number().int().min(0).max(100),
  matchReasoning: z.string().min(1),
});

export const analyzeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/analyze/eval
  fastify.post(
    '/eval',
    { preHandler: [authGuard, deviceGuard, depositGuard] },
    async (request, reply) => {
      const parseResult = evaluateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const { candidateId, jdText } = parseResult.data;
      const user = request.user!;

      // Candidate must belong to recruiter's organization and (for recruiters) be created by them
      const candidateConditions = [
        eq(candidates.id, candidateId),
        eq(candidates.organizationId, user.organizationId!),
      ];
      if (user.role === 'recruiter') {
        candidateConditions.push(eq(candidates.createdByRecruiterId, user.id));
      }

      const [candidate] = await db
        .select()
        .from(candidates)
        .where(and(...candidateConditions))
        .limit(1);

      if (!candidate || !candidate.isActive) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Candidate not found or access denied' });
      }

      // Step 1 & 2: Waterfall Prompt Resolution
      const promptTemplate = await PromptService.resolveTemplate(user.organizationId!);
      const promptVariables = PromptService.buildVariables(candidate, jdText);
      const hydratedPrompt = PromptService.hydratePrompt(promptTemplate, promptVariables);

      // Step 3: Inference via Gemini
      const evalResponse = await GeminiService.evaluate(hydratedPrompt);

      // Step 4: Token Accounting & Offline Billing ledger
      // Always record every evaluation so that evaluation count is 100% accurate
      const billing = await BillingService.recordEvaluationConsumption(
        user.organizationId!,
        user.id,
        evalResponse.usage
      );

      // Step 5: Broadcast Live Telemetry to Super Admin SSE
      telemetryService.broadcastEvaluation({
        rawCostUsd: billing.rawCostUsd,
        billedCostUsd: billing.billedCostUsd,
        profitMarginUsd: Number((billing.billedCostUsd - billing.rawCostUsd).toFixed(6)),
        latencyMs: evalResponse.usage.latencyMs,
        totalTokens: evalResponse.usage.inputTokens + evalResponse.usage.outputTokens,
      });

      // Constraint 5: Recruiters must NEVER see token costs or quota gauges!
      return reply.send({
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

  // POST /api/analyze/save-applied (Recruiter action: persists raw JD to DB)
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

      // Candidate must belong to recruiter's organization and (for recruiters) be created by them
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

      const [newMatchedJd] = await db
        .insert(matchedJds)
        .values({
          organizationId: user.organizationId!,
          recruiterId: user.id,
          candidateId: data.candidateId,
          jobTitle: data.jobTitle,
          companyOrClient: data.companyOrClient || null,
          jobUrl: data.jobUrl || null,
          rawJdText: data.rawJdText,
          verdict: data.verdict,
          matchScore: data.matchScore,
          matchReasoning: data.matchReasoning,
        })
        .returning();

      return reply.send({
        success: true,
        matchedJd: newMatchedJd,
      });
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

      // Pagination support
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(Math.max(parseInt(query.limit || '50', 10) || 50, 1), 200);
      const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

      const conditions = [eq(matchedJds.organizationId, user.organizationId!)];
      // Recruiter isolation: Recruiters can only access matched JDs they personally evaluated
      if (user.role === 'recruiter') {
        conditions.push(eq(matchedJds.recruiterId, user.id));
      }

      const list = await db
        .select({
          id: matchedJds.id,
          candidateId: matchedJds.candidateId,
          candidateName: candidates.fullName,
          recruiterId: matchedJds.recruiterId,
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
        .where(and(...conditions))
        .orderBy(desc(matchedJds.appliedAt))
        .limit(limit)
        .offset(offset);

      return reply.send(list);
    }
  );
};
