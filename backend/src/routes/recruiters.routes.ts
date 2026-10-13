import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { users, organizations, deviceUnlockRequests } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authGuard, requireRole } from '../middleware/authGuard.js';

const createRecruiterSchema = z.object({
  fullName: z.string().min(2, 'Full Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid work email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  organizationId: z.string().uuid().optional(),
});

const requestUnlockSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  requestedDeviceId: z.string().optional(),
  reason: z.string().optional(),
});

export const recruitersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/recruiters (Super Admin or Org Admin)
  fastify.get(
    '/',
    { preHandler: [authGuard, requireRole(['super_admin', 'org_admin'])] },
    async (request, reply) => {
      const user = request.user!;

      if (user.role === 'super_admin') {
        const query = request.query as { limit?: string; offset?: string };
        const hasLimit = query.limit && query.limit !== 'all';
        const hasOffset = query.offset && parseInt(query.offset, 10) > 0;

        let baseQuery = db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            organizationId: users.organizationId,
            organizationName: organizations.name,
            deviceId: users.deviceId,
            deviceLastLockedAt: users.deviceLastLockedAt,
            deviceSwitchAllowedAfter: users.deviceSwitchAllowedAfter,
            deviceMonthlySwitchCount: users.deviceMonthlySwitchCount,
            isActive: users.isActive,
            createdAt: users.createdAt,
          })
          .from(users)
          .leftJoin(organizations, eq(users.organizationId, organizations.id))
          .where(eq(users.role, 'recruiter'))
          .orderBy(desc(users.createdAt));

        if (hasLimit || hasOffset) {
          let dynamicQuery = baseQuery.$dynamic();
          if (hasLimit) {
            dynamicQuery = dynamicQuery.limit(Math.max(parseInt(query.limit!, 10) || 50, 1));
          }
          if (hasOffset) {
            dynamicQuery = dynamicQuery.offset(Math.max(parseInt(query.offset!, 10) || 0, 0));
          }
          const allRecruiters = await dynamicQuery;
          return reply.send(allRecruiters);
        }

        const allRecruiters = await baseQuery;
        return reply.send(allRecruiters);
      }

      // Org Admin sees only their recruiters
      const query = request.query as { limit?: string; offset?: string };
      const hasLimit = query.limit && query.limit !== 'all';
      const hasOffset = query.offset && parseInt(query.offset, 10) > 0;

      let baseQuery = db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          deviceId: users.deviceId,
          deviceLastLockedAt: users.deviceLastLockedAt,
          deviceSwitchAllowedAfter: users.deviceSwitchAllowedAfter,
          deviceMonthlySwitchCount: users.deviceMonthlySwitchCount,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(and(eq(users.organizationId, user.organizationId!), eq(users.role, 'recruiter')))
        .orderBy(desc(users.createdAt));

      if (hasLimit || hasOffset) {
        let dynamicQuery = baseQuery.$dynamic();
        if (hasLimit) {
          dynamicQuery = dynamicQuery.limit(Math.max(parseInt(query.limit!, 10) || 50, 1));
        }
        if (hasOffset) {
          dynamicQuery = dynamicQuery.offset(Math.max(parseInt(query.offset!, 10) || 0, 0));
        }
        const team = await dynamicQuery;
        return reply.send(team);
      }

      const team = await baseQuery;
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
      // Strict tenant isolation: Org Admin is strictly restricted to their own organizationId
      const targetOrgId = user.role === 'super_admin' ? (organizationId || user.organizationId) : user.organizationId;

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
          deviceMonthlySwitchCount: 0,
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

  // POST /api/recruiters/request-unlock (Recruiter submits machine unlock request)
  fastify.post('/request-unlock', async (request, reply) => {
    const parseResult = requestUnlockSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'INVALID_PAYLOAD',
        message: parseResult.error.issues[0]?.message || 'Invalid request payload',
      });
    }

    const { email, password, requestedDeviceId, reason } = parseResult.data;
    const headerDeviceId = request.headers['x-device-id'];
    const rawHeaderDeviceId = Array.isArray(headerDeviceId) ? headerDeviceId[0] : headerDeviceId;
    const targetDeviceId = (requestedDeviceId || rawHeaderDeviceId || '').trim();

    const [recruiter] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!recruiter || recruiter.role !== 'recruiter' || !recruiter.isActive) {
      return reply.status(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid recruiter credentials.',
      });
    }

    const isMatch = await bcrypt.compare(password, recruiter.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid recruiter credentials.',
      });
    }

    if (!recruiter.organizationId) {
      return reply.status(400).send({
        error: 'NO_ORGANIZATION',
        message: 'Recruiter does not belong to an active organization.',
      });
    }

    // Determine approval tier based on 30-day transfer history
    const now = new Date();
    const isCooldownExpired = !recruiter.deviceSwitchAllowedAfter || now >= new Date(recruiter.deviceSwitchAllowedAfter);
    const effectiveSwitchCount = isCooldownExpired ? 0 : (recruiter.deviceMonthlySwitchCount || 0);

    // Rule: Recruiter can change machine once a month with Org Admin approval.
    // If more than this (effectiveSwitchCount >= 1), machine change approval must be asked from Super Admin.
    const approvalTier: 'org_admin' | 'super_admin' = effectiveSwitchCount === 0 ? 'org_admin' : 'super_admin';

    // Check if an unresolved request already exists
    const [existingRequest] = await db
      .select()
      .from(deviceUnlockRequests)
      .where(
        and(
          eq(deviceUnlockRequests.recruiterId, recruiter.id),
          eq(deviceUnlockRequests.status, 'pending')
        )
      )
      .limit(1);

    if (existingRequest) {
      return reply.status(409).send({
        error: 'REQUEST_ALREADY_PENDING',
        message: `You already have a pending machine unlock request awaiting ${
          existingRequest.approvalTier === 'org_admin' ? 'Organization Admin' : 'Super Admin'
        } approval.`,
        requestId: existingRequest.id,
        approvalTier: existingRequest.approvalTier,
      });
    }

    const [newRequest] = await db
      .insert(deviceUnlockRequests)
      .values({
        organizationId: recruiter.organizationId,
        recruiterId: recruiter.id,
        requestedDeviceId: targetDeviceId || 'unknown',
        currentDeviceId: recruiter.deviceId || null,
        reason: reason || 'Machine transfer requested by recruiter',
        approvalTier,
        status: 'pending',
      })
      .returning();

    return reply.status(201).send({
      success: true,
      message:
        approvalTier === 'org_admin'
          ? 'Machine unlock request submitted to your Organization Admin for approval.'
          : 'Monthly machine change limit exceeded. Request has been escalated to Super Admin for approval.',
      approvalTier,
      requestId: newRequest.id,
    });
  });

  // GET /api/recruiters/unlock-requests (Org Admin or Super Admin views requests)
  fastify.get(
    '/unlock-requests',
    { preHandler: [authGuard, requireRole(['org_admin', 'super_admin'])] },
    async (request, reply) => {
      const user = request.user!;

      const conditions = [];
      if (user.role === 'org_admin') {
        conditions.push(eq(deviceUnlockRequests.organizationId, user.organizationId!));
      }

      const requests = await db
        .select({
          id: deviceUnlockRequests.id,
          organizationId: deviceUnlockRequests.organizationId,
          organizationName: organizations.name,
          recruiterId: deviceUnlockRequests.recruiterId,
          recruiterName: users.fullName,
          recruiterEmail: users.email,
          requestedDeviceId: deviceUnlockRequests.requestedDeviceId,
          currentDeviceId: deviceUnlockRequests.currentDeviceId,
          reason: deviceUnlockRequests.reason,
          approvalTier: deviceUnlockRequests.approvalTier,
          status: deviceUnlockRequests.status,
          reviewedByUserId: deviceUnlockRequests.reviewedByUserId,
          reviewedAt: deviceUnlockRequests.reviewedAt,
          rejectionReason: deviceUnlockRequests.rejectionReason,
          createdAt: deviceUnlockRequests.createdAt,
        })
        .from(deviceUnlockRequests)
        .leftJoin(organizations, eq(deviceUnlockRequests.organizationId, organizations.id))
        .leftJoin(users, eq(deviceUnlockRequests.recruiterId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(deviceUnlockRequests.createdAt));

      return reply.send(requests);
    }
  );

  // POST /api/recruiters/unlock-requests/:id/approve (Org Admin or Super Admin approves)
  fastify.post(
    '/unlock-requests/:id/approve',
    { preHandler: [authGuard, requireRole(['org_admin', 'super_admin'])] },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const [targetReq] = await db
        .select()
        .from(deviceUnlockRequests)
        .where(eq(deviceUnlockRequests.id, id))
        .limit(1);

      if (!targetReq) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Unlock request not found.' });
      }

      if (targetReq.status !== 'pending') {
        return reply.status(400).send({
          error: 'ALREADY_PROCESSED',
          message: `This unlock request has already been ${targetReq.status}.`,
        });
      }

      // Org Admin cannot approve requests escalated to Super Admin
      if (user.role === 'org_admin') {
        if (targetReq.organizationId !== user.organizationId) {
          return reply.status(403).send({ error: 'FORBIDDEN', message: 'Unauthorized organization.' });
        }
        if (targetReq.approvalTier === 'super_admin') {
          return reply.status(403).send({
            error: 'SUPER_ADMIN_REQUIRED',
            message: 'This recruiter has exceeded the monthly machine change limit. Approval must be granted by Super Admin.',
          });
        }
      }

      const [targetRecruiter] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetReq.recruiterId))
        .limit(1);

      if (!targetRecruiter) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Recruiter not found.' });
      }

      const now = new Date();
      const switchAllowedAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const isCooldownExpired = !targetRecruiter.deviceSwitchAllowedAfter || now >= new Date(targetRecruiter.deviceSwitchAllowedAfter);
      const newMonthlyCount = (isCooldownExpired ? 0 : (targetRecruiter.deviceMonthlySwitchCount || 0)) + 1;

      // Update recruiter's hardware lock
      // If requestedDeviceId is known and valid, bind directly; else clear deviceId so next login binds
      const newDeviceId = targetReq.requestedDeviceId && targetReq.requestedDeviceId !== 'unknown'
        ? targetReq.requestedDeviceId
        : null;

      await db
        .update(users)
        .set({
          deviceId: newDeviceId,
          deviceLastLockedAt: now,
          deviceSwitchAllowedAfter: switchAllowedAfter,
          deviceMonthlySwitchCount: newMonthlyCount,
          updatedAt: now,
        })
        .where(eq(users.id, targetRecruiter.id));

      // Mark request approved
      await db
        .update(deviceUnlockRequests)
        .set({
          status: 'approved',
          reviewedByUserId: user.id,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(deviceUnlockRequests.id, id));

      return reply.send({
        success: true,
        message: `Machine unlock approved for ${targetRecruiter.fullName}. The recruiter can now log in on their new computer.`,
      });
    }
  );

  // POST /api/recruiters/unlock-requests/:id/reject (Org Admin or Super Admin rejects)
  fastify.post(
    '/unlock-requests/:id/reject',
    { preHandler: [authGuard, requireRole(['org_admin', 'super_admin'])] },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = (request.body as { reason?: string }) || {};

      const [targetReq] = await db
        .select()
        .from(deviceUnlockRequests)
        .where(eq(deviceUnlockRequests.id, id))
        .limit(1);

      if (!targetReq) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Unlock request not found.' });
      }

      if (user.role === 'org_admin' && targetReq.organizationId !== user.organizationId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Unauthorized organization.' });
      }

      const now = new Date();
      await db
        .update(deviceUnlockRequests)
        .set({
          status: 'rejected',
          rejectionReason: body.reason || 'Rejected by administrator',
          reviewedByUserId: user.id,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(deviceUnlockRequests.id, id));

      return reply.send({
        success: true,
        message: 'Machine unlock request rejected.',
      });
    }
  );

  // POST /api/recruiters/:id/reset-device (Org Admin or Super Admin resets machine)
  fastify.post(
    '/:id/reset-device',
    { preHandler: [authGuard, requireRole(['super_admin', 'org_admin'])] },
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
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Recruiter not found.' });
      }

      const now = new Date();

      if (user.role === 'org_admin') {
        if (targetRecruiter.organizationId !== user.organizationId) {
          return reply.status(403).send({ error: 'FORBIDDEN', message: 'Unauthorized organization.' });
        }

        // Rule: Org Admin can only approve 1 machine change per month.
        // If recruiter already changed within 30 days, Super Admin approval is required.
        const isCooldownExpired = !targetRecruiter.deviceSwitchAllowedAfter || now >= new Date(targetRecruiter.deviceSwitchAllowedAfter);
        const effectiveCount = isCooldownExpired ? 0 : (targetRecruiter.deviceMonthlySwitchCount || 0);

        if (effectiveCount >= 1) {
          return reply.status(403).send({
            error: 'MONTHLY_LIMIT_EXCEEDED',
            message: `This recruiter has already changed machines within the past 30 days (cooldown active until ${targetRecruiter.deviceSwitchAllowedAfter ? new Date(targetRecruiter.deviceSwitchAllowedAfter).toLocaleDateString() : '30 days'}). Additional machine changes must be authorized by Super Admin.`,
            approvalTier: 'super_admin',
          });
        }

        const switchAllowedAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await db
          .update(users)
          .set({
            deviceId: null,
            deviceLastLockedAt: now,
            deviceSwitchAllowedAfter: switchAllowedAfter,
            deviceMonthlySwitchCount: 1,
            updatedAt: now,
          })
          .where(eq(users.id, id));

        return reply.send({
          success: true,
          message: `Hardware lock reset for ${targetRecruiter.fullName}. Next login will auto-bind to the new computer. Note: 30-day transfer cooldown is now active.`,
        });
      }

      // Super Admin: master reset with full override authority
      await db
        .update(users)
        .set({
          deviceId: null,
          deviceLastLockedAt: null,
          deviceSwitchAllowedAfter: null,
          deviceMonthlySwitchCount: 0,
          updatedAt: now,
        })
        .where(eq(users.id, id));

      return reply.send({
        success: true,
        message: `Hardware lock cleared by Super Admin for recruiter ${targetRecruiter.fullName}. Machine transfer limit reset.`,
      });
    }
  );
};
