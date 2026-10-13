import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { users, organizations } from '../db/schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { authGuard } from '../middleware/authGuard.js';

import { env } from '../env.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100).optional(),
  email: z.string().email('Please enter a valid email address').optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'New password must be at least 6 characters').optional(),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters').max(200).optional(),
});

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/auth/login (Brute-force protected: 10 requests / minute)
  fastify.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parseResult = loginSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

    const { email, password } = parseResult.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user || !user.isActive) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    if (user.organizationId) {
      const [org] = await db
        .select({ id: organizations.id, isActive: organizations.isActive })
        .from(organizations)
        .where(eq(organizations.id, user.organizationId))
        .limit(1);

      if (!org || !org.isActive) {
        return reply.status(403).send({
          error: 'ORGANIZATION_DEACTIVATED',
          message: 'Your organization account is suspended or deactivated. Please contact support.',
        });
      }
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    // Hardware lock: recruiter authentication strictly bound to machine fingerprint
    if (user.role === 'recruiter') {
      const deviceIdHeader = request.headers['x-device-id'];
      const rawDeviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;

      if (!rawDeviceId || typeof rawDeviceId !== 'string' || rawDeviceId.trim().length === 0) {
        return reply.status(400).send({
          error: 'DEVICE_ID_REQUIRED',
          code: 'DEVICE_ID_REQUIRED',
          message: 'Hardware machine identity is required for recruiter authentication. Please enable device fingerprinting.',
        });
      }

      const cleanDeviceId = rawDeviceId.trim();
      const now = new Date();

      if (!user.deviceId) {
        // First-time recruiter login: bind to this physical machine
        const switchAllowedAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await db
          .update(users)
          .set({
            deviceId: cleanDeviceId,
            deviceLastLockedAt: now,
            deviceSwitchAllowedAfter: switchAllowedAfter,
            deviceMonthlySwitchCount: 0,
            updatedAt: now,
          })
          .where(eq(users.id, user.id));
        user.deviceId = cleanDeviceId;
        user.deviceLastLockedAt = now;
        user.deviceSwitchAllowedAfter = switchAllowedAfter;
      } else if (user.deviceId !== cleanDeviceId) {
        // Recruiter is bound to a different machine: REJECT LOGIN!
        const isCooldownExpired = !user.deviceSwitchAllowedAfter || now >= new Date(user.deviceSwitchAllowedAfter);
        const effectiveSwitchCount = isCooldownExpired ? 0 : (user.deviceMonthlySwitchCount || 0);
        const approvalTier = effectiveSwitchCount === 0 ? 'org_admin' : 'super_admin';
        const adminName = approvalTier === 'org_admin' ? 'Organization Admin' : 'Super Admin';

        return reply.status(403).send({
          error: 'DEVICE_LOCKED',
          code: 'DEVICE_LOCKED',
          message: `This recruiter ID is locked to another machine. Login from this device is not permitted. Please ask your ${adminName} to unlock or approve a machine transfer.`,
          lockedDeviceId: user.deviceId,
          incomingDeviceId: cleanDeviceId,
          approvalTier,
          monthlySwitchCount: effectiveSwitchCount,
          deviceSwitchAllowedAfter: user.deviceSwitchAllowedAfter,
        });
      }
    }

    // Fetch organization info if user belongs to an org
    let orgInfo: { id: string; name: string; slug: string; totalBilledAmount: string; securityDepositLimit: string } | null = null;
    if (user.organizationId) {
      const [org] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          totalBilledAmount: organizations.totalBilledAmount,
          securityDepositLimit: organizations.securityDepositLimit,
        })
        .from(organizations)
        .where(eq(organizations.id, user.organizationId))
        .limit(1);
      orgInfo = org || null;
    }

    // Sign JWT
    const token = fastify.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
        deviceId: user.deviceId,
        deviceLastLockedAt: user.deviceLastLockedAt,
        deviceSwitchAllowedAfter: user.deviceSwitchAllowedAfter,
      },
      organization: orgInfo,
    });
  });

  // POST /api/auth/self-switch-device (Recruiter only)
  fastify.post('/self-switch-device', { preHandler: [authGuard] }, async (request, reply) => {
    const user = request.user!;
    if (user.role !== 'recruiter') {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Only recruiters can switch device locks' });
    }

    const deviceIdHeader = request.headers['x-device-id'];
    const newDeviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;

    if (!newDeviceId || typeof newDeviceId !== 'string' || newDeviceId.trim().length === 0) {
      return reply.status(400).send({ error: 'DEVICE_ID_REQUIRED', message: 'Missing x-device-id header' });
    }

    const now = new Date();
    if (env.NODE_ENV === 'production' && user.deviceSwitchAllowedAfter && now < new Date(user.deviceSwitchAllowedAfter)) {
      return reply.status(403).send({
        error: 'COOLDOWN_ACTIVE',
        message: '30-day device transfer cooldown has not elapsed',
        switchAllowedAfter: user.deviceSwitchAllowedAfter,
      });
    }

    const switchAllowedAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db
      .update(users)
      .set({
        deviceId: newDeviceId.trim(),
        deviceLastLockedAt: now,
        deviceSwitchAllowedAfter: switchAllowedAfter,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    return reply.send({
      success: true,
      message: 'Seat successfully migrated to this machine.',
      deviceId: newDeviceId.trim(),
      deviceSwitchAllowedAfter: switchAllowedAfter,
    });
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [authGuard] }, async (request, reply) => {
    const user = request.user!;
    let orgInfo: any = null;
    if (user.organizationId) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, user.organizationId))
        .limit(1);
      if (org) {
        let teamCount = 0;
        if (user.role === 'org_admin') {
          const teamList = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.organizationId, user.organizationId), eq(users.role, 'recruiter')));
          teamCount = teamList.length;
        }

        if (user.role === 'super_admin') {
          orgInfo = { ...org, teamCount };
        } else {
          const { profitMultiplier: _m, ...cleanOrg } = org;
          orgInfo = { ...cleanOrg, teamCount };
        }
      }
    }

    return reply.send({
      user,
      organization: orgInfo,
    });
  });

  // PUT /api/auth/profile (Self-service profile & credential updates for recruiters and admins)
  fastify.put('/profile', { preHandler: [authGuard] }, async (request, reply) => {
    const user = request.user!;
    const parseResult = updateProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((i) => i.message).join(', ');
      return reply.status(400).send({
        error: 'INVALID_PAYLOAD',
        message: errorMsg || 'Invalid profile payload',
        details: parseResult.error.issues,
      });
    }

    const { fullName, email, currentPassword, newPassword, organizationName } = parseResult.data;

    // Fetch fresh user record
    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!currentUser) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'User account not found.' });
    }

    // Check email uniqueness if email is changed
    let updatedEmail = currentUser.email;
    if (email && email.toLowerCase().trim() !== currentUser.email.toLowerCase().trim()) {
      const cleanEmail = email.toLowerCase().trim();
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, cleanEmail), ne(users.id, currentUser.id)))
        .limit(1);

      if (existingUser) {
        return reply.status(409).send({
          error: 'EMAIL_EXISTS',
          message: `The email "${cleanEmail}" is already registered to another account. Please use a different address.`,
        });
      }
      updatedEmail = cleanEmail;
    }

    // Password change verification
    let newPasswordHash: string | undefined;
    if (newPassword) {
      if (!currentPassword) {
        return reply.status(400).send({
          error: 'CURRENT_PASSWORD_REQUIRED',
          message: 'Please enter your current password to set a new password.',
        });
      }

      const isCurrentMatch = await bcrypt.compare(currentPassword, currentUser.passwordHash);
      if (!isCurrentMatch) {
        return reply.status(400).send({
          error: 'INCORRECT_CURRENT_PASSWORD',
          message: 'The current password you entered is incorrect.',
        });
      }

      newPasswordHash = await bcrypt.hash(newPassword, 10);
    }

    const updatedFullName = fullName ? fullName.trim() : currentUser.fullName;
    const now = new Date();

    // Update user row
    await db
      .update(users)
      .set({
        fullName: updatedFullName,
        email: updatedEmail,
        ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}),
        updatedAt: now,
      })
      .where(eq(users.id, currentUser.id));

    // If org_admin and organizationName provided, update organization
    let updatedOrg: any = null;
    if (user.role === 'org_admin' && user.organizationId && organizationName && organizationName.trim()) {
      await db
        .update(organizations)
        .set({
          name: organizationName.trim(),
          updatedAt: now,
        })
        .where(eq(organizations.id, user.organizationId));
    }

    if (user.organizationId) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, user.organizationId))
        .limit(1);
      if (org) {
        let teamCount = 0;
        if (user.role === 'org_admin') {
          const teamList = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.organizationId, user.organizationId), eq(users.role, 'recruiter')));
          teamCount = teamList.length;
        }

        if (user.role === 'super_admin') {
          updatedOrg = { ...org, teamCount };
        } else {
          const { profitMultiplier: _m, ...cleanOrg } = org;
          updatedOrg = { ...cleanOrg, teamCount };
        }
      }
    }

    // Generate fresh JWT token with updated credentials
    const newToken = fastify.jwt.sign(
      {
        id: currentUser.id,
        email: updatedEmail,
        role: currentUser.role,
        organizationId: currentUser.organizationId,
      },
      { expiresIn: '7d' }
    );

    const updatedUser = {
      id: currentUser.id,
      organizationId: currentUser.organizationId,
      role: currentUser.role,
      email: updatedEmail,
      fullName: updatedFullName,
      deviceId: currentUser.deviceId,
      deviceLastLockedAt: currentUser.deviceLastLockedAt,
      deviceSwitchAllowedAfter: currentUser.deviceSwitchAllowedAfter,
      deviceMonthlySwitchCount: currentUser.deviceMonthlySwitchCount,
      createdAt: currentUser.createdAt,
    };

    return reply.send({
      success: true,
      message: 'Profile updated successfully!',
      user: updatedUser,
      organization: updatedOrg,
      token: newToken,
    });
  });
};
