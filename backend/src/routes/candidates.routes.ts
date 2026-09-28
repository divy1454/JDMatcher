import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { candidates, users } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authGuard, requireRole } from '../middleware/authGuard.js';

const candidateSchema = z.object({
  fullName: z.string().min(2),
  primaryTitle: z.string().min(2),
  rawResumeText: z.string().min(20, 'Raw resume must be at least 20 characters'),
  createdByRecruiterId: z.string().uuid().nullable().optional(),
});

const candidateUpdateSchema = z.object({
  fullName: z.string().min(2).optional(),
  primaryTitle: z.string().min(2).optional(),
  rawResumeText: z.string().min(20).optional(),
  createdByRecruiterId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
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
      const limit = Math.min(Math.max(parseInt(query.limit || '50', 10) || 50, 1), 200);
      const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

      const conditions = [eq(candidates.organizationId, user.organizationId!)];
      // Recruiter isolation: Recruiters can only access candidates they added
      if (user.role === 'recruiter') {
        conditions.push(eq(candidates.createdByRecruiterId, user.id));
      }

      const list = await db
        .select({
          id: candidates.id,
          fullName: candidates.fullName,
          primaryTitle: candidates.primaryTitle,
          createdByRecruiterId: candidates.createdByRecruiterId,
          recruiterName: users.fullName,
          recruiterEmail: users.email,
          isActive: candidates.isActive,
          createdAt: candidates.createdAt,
          // Return character count instead of leaking full resume text
          resumeLength: sql<number>`length(${candidates.rawResumeText})`,
        })
        .from(candidates)
        .leftJoin(users, eq(candidates.createdByRecruiterId, users.id))
        .where(and(...conditions))
        .orderBy(desc(candidates.createdAt))
        .limit(limit)
        .offset(offset);

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
};
