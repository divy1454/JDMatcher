import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { candidates, users } from '../db/schema.js';
import { eq, and, desc, sql, or, isNull } from 'drizzle-orm';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { GeminiService } from '../services/geminiService.js';

const candidateSchema = z.object({
  fullName: z.string().min(2).max(255),
  primaryTitle: z.string().min(2).max(255),
  rawResumeText: z.string().min(20, 'Raw resume must be at least 20 characters').max(40000, 'Raw resume exceeds 40,000 character limit'),
  createdByRecruiterId: z.string().uuid().nullable().optional(),
  visaStatus: z.enum([
    'US Citizen', 'Green Card', 'H-1B', 'OPT', 'CPT', 'TN', 'E-3', 'H4-EAD', 'L2-EAD', 'Other'
  ]).optional(),
  workPreference: z.enum(['Remote', 'Hybrid', 'On-Site']).optional(),
  securityClearance: z.enum([
    'None', 'Public Trust', 'Secret', 'Top Secret', 'Top Secret/SCI', 'Polygraph'
  ]).optional(),
  yearsOfExperience: z.number().int().min(0).max(60).optional(),
  keySkills: z.array(z.string().max(100)).max(100).optional(),
  structuredProfile: z.record(z.any()).optional(),
  savedResponses: z.array(z.record(z.any())).max(100).optional(),
  resumeFileBase64: z.string().max(4500000, 'Resume file base64 exceeds 4.5MB limit').optional(),
  resumeFileName: z.string().max(255).optional(),
  resumeMimeType: z.string().max(100).optional(),
});

const candidateUpdateSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  primaryTitle: z.string().min(2).max(255).optional(),
  rawResumeText: z.string().min(20).max(40000, 'Raw resume exceeds 40,000 character limit').optional(),
  createdByRecruiterId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  visaStatus: z.enum([
    'US Citizen', 'Green Card', 'H-1B', 'OPT', 'CPT', 'TN', 'E-3', 'H4-EAD', 'L2-EAD', 'Other'
  ]).optional(),
  workPreference: z.enum(['Remote', 'Hybrid', 'On-Site']).optional(),
  securityClearance: z.enum([
    'None', 'Public Trust', 'Secret', 'Top Secret', 'Top Secret/SCI', 'Polygraph'
  ]).optional(),
  yearsOfExperience: z.number().int().min(0).max(60).optional(),
  keySkills: z.array(z.string().max(100)).max(100).optional(),
  structuredProfile: z.record(z.any()).optional(),
  savedResponses: z.array(z.record(z.any())).max(100).optional(),
  resumeFileBase64: z.string().max(4500000, 'Resume file base64 exceeds 4.5MB limit').optional(),
  resumeFileName: z.string().max(255).optional(),
  resumeMimeType: z.string().max(100).optional(),
});

export const candidatesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/candidates (Org Admin & Recruiter: list agency candidates)
  fastify.get(
    '/',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const user = request.user!;

      // Zero-Knowledge Isolation: Super Admin is strictly prevented from inspecting candidate resumes
      if (user.role === 'super_admin') {
        return reply.status(403).send({
          error: 'ZERO_KNOWLEDGE_VIOLATION',
          message: 'Super Admins are strictly prohibited from viewing candidate resumes and talent profiles',
        });
      }

      // Pagination support
      const query = request.query as { limit?: string; offset?: string };

      const conditions = [
        eq(candidates.organizationId, user.organizationId!),
        eq(candidates.isActive, true),
      ];

      // Recruiter view: Recruiters can see candidates they created, assigned to them, or agency bench candidates
      if (user.role === 'recruiter') {
        conditions.push(or(eq(candidates.createdByRecruiterId, user.id), isNull(candidates.createdByRecruiterId))!);
      }

      const baseQuery = db
        .select({
          id: candidates.id,
          fullName: candidates.fullName,
          primaryTitle: candidates.primaryTitle,
          createdByRecruiterId: candidates.createdByRecruiterId,
          recruiterName: users.fullName,
          recruiterEmail: users.email,
          isActive: candidates.isActive,
          createdAt: candidates.createdAt,
          visaStatus: candidates.visaStatus,
          workPreference: candidates.workPreference,
          resumeFileName: candidates.resumeFileName,
          hasResumeFile: sql<boolean>`${candidates.resumeFileBase64} is not null`,
          hasStructuredProfile: sql<boolean>`${candidates.structuredProfile} is not null and ${candidates.structuredProfile} != '{}'::jsonb`,
          // Return character count instead of leaking full resume text
          resumeLength: sql<number>`coalesce(length(${candidates.rawResumeText}), 0)`,
        })
        .from(candidates)
        .leftJoin(users, eq(candidates.createdByRecruiterId, users.id))
        .where(and(...conditions))
        .orderBy(desc(candidates.createdAt));

      const hasExplicitLimit = query.limit !== undefined && query.limit !== 'all' && query.limit !== '0' && query.limit !== 'none';
      const hasExplicitOffset = query.offset !== undefined && parseInt(query.offset, 10) > 0;

      let list;
      if (hasExplicitLimit || hasExplicitOffset) {
        let dynamicQuery = baseQuery.$dynamic();
        if (hasExplicitLimit) {
          const limitNum = Math.max(parseInt(query.limit!, 10) || 50, 1);
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

  // GET /api/candidates/:id (Org Admin & Recruiter: get full candidate with raw resume)
  fastify.get(
    '/:id',
    { preHandler: [authGuard] },
    async (request, reply) => {
      const user = request.user!;
      if (user.role === 'super_admin') {
        return reply.status(403).send({
          error: 'ZERO_KNOWLEDGE_VIOLATION',
          message: 'Super Admins are strictly prohibited from viewing candidate resumes',
        });
      }

      const { id } = request.params as { id: string };

      const conditions = [
        eq(candidates.id, id),
        eq(candidates.organizationId, user.organizationId!),
      ];

      // Recruiter isolation: Recruiters can ONLY access candidates they created or assigned to them
      if (user.role === 'recruiter') {
        conditions.push(eq(candidates.createdByRecruiterId, user.id));
      }

      const [candidate] = await db
        .select()
        .from(candidates)
        .where(and(...conditions))
        .limit(1);

      if (!candidate) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Candidate not found or access denied' });
      }

      return reply.send(candidate);
    }
  );

  // POST /api/candidates (Org Admin & Recruiter: add candidate)
  fastify.post(
    '/',
    { preHandler: [authGuard, requireRole(['org_admin', 'recruiter'])] },
    async (request, reply) => {
      const user = request.user!;
      const parseResult = candidateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const data = parseResult.data;

      // Recruiter is forced to own their candidates. Org Admin can assign to a recruiter or null.
      const assignedRecruiterId = user.role === 'recruiter' 
        ? user.id 
        : (data.createdByRecruiterId || null);

      const [newCandidate] = await db
        .insert(candidates)
        .values({
          organizationId: user.organizationId!,
          createdByRecruiterId: assignedRecruiterId,
          fullName: data.fullName,
          primaryTitle: data.primaryTitle,
          rawResumeText: data.rawResumeText,
          ...(data.visaStatus && { visaStatus: data.visaStatus }),
          ...(data.workPreference && { workPreference: data.workPreference }),
          ...(data.securityClearance && { securityClearance: data.securityClearance }),
          ...(data.yearsOfExperience !== undefined && { yearsOfExperience: data.yearsOfExperience }),
          ...(data.keySkills && { keySkills: data.keySkills }),
          ...(data.structuredProfile && { structuredProfile: data.structuredProfile }),
          ...(data.savedResponses && { savedResponses: data.savedResponses }),
          ...(data.resumeFileBase64 && { resumeFileBase64: data.resumeFileBase64 }),
          ...(data.resumeFileName && { resumeFileName: data.resumeFileName }),
          ...(data.resumeMimeType && { resumeMimeType: data.resumeMimeType }),
        })
        .returning();

      return reply.status(201).send(newCandidate);
    }
  );

  // PATCH /api/candidates/:id (Org Admin & Recruiter: update candidate)
  fastify.patch(
    '/:id',
    { preHandler: [authGuard, requireRole(['org_admin', 'recruiter'])] },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const parseResult = candidateUpdateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const conditions = [
        eq(candidates.id, id),
        eq(candidates.organizationId, user.organizationId!),
      ];
      if (user.role === 'recruiter') {
        conditions.push(eq(candidates.createdByRecruiterId, user.id));
      }

      // Recruiters cannot change candidate ownership
      const updateData = { ...parseResult.data };
      if (user.role === 'recruiter') {
        delete updateData.createdByRecruiterId;
      }

      const [updated] = await db
        .update(candidates)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(and(...conditions))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Candidate not found or access denied' });
      }

      return reply.send(updated);
    }
  );

  // DELETE /api/candidates/:id (Org Admin only)
  fastify.delete(
    '/:id',
    { preHandler: [authGuard, requireRole(['org_admin'])] },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const [deleted] = await db
        .delete(candidates)
        .where(and(eq(candidates.id, id), eq(candidates.organizationId, user.organizationId!)))
        .returning({ id: candidates.id });

      if (!deleted) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Candidate not found' });
      }

      return reply.send({ success: true, message: 'Candidate deleted successfully' });
    }
  );

  // POST /api/candidates/extract-profile (AI-extract 7-part profile from raw resume text)
  fastify.post(
    '/extract-profile',
    { preHandler: [authGuard, requireRole(['org_admin', 'recruiter'])] },
    async (request, reply) => {
      const user = request.user!;
      const body = request.body as {
        rawResumeText: string;
        fullName?: string;
        primaryTitle?: string;
        visaStatus?: string;
        yearsOfExperience?: number;
        keySkills?: string[];
      };

      if (!body.rawResumeText || body.rawResumeText.trim().length < 20) {
        return reply.status(400).send({
          error: 'INVALID_PAYLOAD',
          message: 'Raw resume text must be at least 20 characters',
        });
      }

      try {
        const result = await GeminiService.extractSpeedyApplyProfile(body.rawResumeText, {
          fullName: body.fullName,
          primaryTitle: body.primaryTitle,
          visaStatus: body.visaStatus,
          yearsOfExperience: body.yearsOfExperience,
          keySkills: body.keySkills,
        });

        return reply.send({
          success: true,
          profile: result.profile,
          usage: result.usage,
        });
      } catch (err: any) {
        request.log.error(err, 'Failed to extract candidate profile via AI');
        return reply.status(500).send({
          error: 'AI_EXTRACTION_FAILED',
          message: err.message || 'Failed to extract candidate profile',
        });
      }
    }
  );
};
