import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { users, organizations } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authGuard, requireRole } from '../middleware/authGuard.js';

const createRecruiterSchema = z.object({
  fullName: z.string().min(2, 'Full Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid work email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  organizationId: z.string().uuid().optional(),
});

export const recruitersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/recruiters (Super Admin or Org Admin)
  fastify.get(
    '/',
    { preHandler: [authGuard, requireRole(['super_admin', 'org_admin'])] },
    async (request, reply) => {
      const user = request.user!;

      if (user.role === 'super_admin') {
        // Pagination support
        const query = request.query as { limit?: string; offset?: string };
        const limit = Math.min(Math.max(parseInt(query.limit || '50', 10) || 50, 1), 200);
        const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

        // Super Admin sees all recruiters + hardware locks, joined with org name
        const allRecruiters = await db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            organizationId: users.organizationId,
            organizationName: organizations.name,
            deviceId: users.deviceId,
            deviceLastLockedAt: users.deviceLastLockedAt,
            deviceSwitchAllowedAfter: users.deviceSwitchAllowedAfter,
            isActive: users.isActive,
            createdAt: users.createdAt,
          })
          .from(users)
          .leftJoin(organizations, eq(users.organizationId, organizations.id))
          .where(eq(users.role, 'recruiter'))
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset(offset);

        return reply.send(allRecruiters);
      }

      // Org Admin sees only their recruiters
      // Pagination support
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(Math.max(parseInt(query.limit || '50', 10) || 50, 1), 200);
      const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

      const team = await db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          deviceId: users.deviceId,
          deviceLastLockedAt: users.deviceLastLockedAt,
          deviceSwitchAllowedAfter: users.deviceSwitchAllowedAfter,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(and(eq(users.organizationId, user.organizationId!), eq(users.role, 'recruiter')))
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send(team);
    }
  );

  // POST /api/recruiters (Org Admin or Super Admin: provisions recruiter account)
  fastify.post(
    '/',
    { preHandler: [authGuard, requireRole(['org_admin', 'super_admin'])] },
    async (request, reply) => {
      const user = request.user!;
      const parseResult = createRecruiterSchema.safeParse(request.body);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.issues
          .map((i) => `${i.path.join('.') || 'field'}: ${i.message}`)
          .join(', ');
        return reply.status(400).send({
          error: 'INVALID_PAYLOAD',
          message: errorMsg || 'Invalid recruiter payload',
          details: parseResult.error.issues,
        });
      }

      const { fullName, email, password, organizationId } = parseResult.data;
      const targetOrgId = user.organizationId || organizationId;

      if (!targetOrgId) {
        return reply.status(400).send({
          error: 'NO_ORGANIZATION',
          message: 'An organization ID is required to provision a recruiter seat.',
        });
      }

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()))
        .limit(1);

      if (existing) {
        return reply.status(409).send({
          error: 'EMAIL_EXISTS',
          message: `A user with email "${email}" already exists. Please choose a different work email.`,
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const [newRecruiter] = await db
        .insert(users)
        .values({
          organizationId: targetOrgId,
          role: 'recruiter',
          email: email.toLowerCase().trim(),
          passwordHash,
          fullName,
        })
        .returning({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
        });

      return reply.status(201).send(newRecruiter);
    }
  );

  // POST /api/recruiters/:id/reset-device (Super Admin only: force unlocks a machine)
  fastify.post(
    '/:id/reset-device',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      // Query target recruiter
      const [targetRecruiter] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!targetRecruiter || targetRecruiter.role !== 'recruiter') {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Recruiter not found' });
      }

      await db
        .update(users)
        .set({
          deviceId: null,
          deviceLastLockedAt: null,
          deviceSwitchAllowedAfter: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      return reply.send({
        success: true,
        message: `Hardware lock cleared for recruiter ${targetRecruiter.fullName}. Next login will auto-bind to the new computer.`,
      });
    }
  );
};
