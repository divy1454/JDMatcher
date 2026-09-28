import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { users, organizations } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authGuard } from '../middleware/authGuard.js';

import { env } from '../env.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
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

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    // Hardware lock: if recruiter logging in from Chrome Extension with x-device-id
    if (user.role === 'recruiter') {
      const deviceIdHeader = request.headers['x-device-id'];
      const rawDeviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;
      if (rawDeviceId && typeof rawDeviceId === 'string' && rawDeviceId.trim().length > 0) {
        const cleanDeviceId = rawDeviceId.trim();
        const now = new Date();
        const isSwitchAllowed = !user.deviceSwitchAllowedAfter || now >= new Date(user.deviceSwitchAllowedAfter);

        if (!user.deviceId || user.deviceId === cleanDeviceId) {
          if (!user.deviceId) {
            const switchAllowedAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            await db
              .update(users)
              .set({
                deviceId: cleanDeviceId,
                deviceLastLockedAt: now,
                deviceSwitchAllowedAfter: switchAllowedAfter,
                updatedAt: now,
              })
              .where(eq(users.id, user.id));
            user.deviceId = cleanDeviceId;
            user.deviceLastLockedAt = now;
            user.deviceSwitchAllowedAfter = switchAllowedAfter;
          }
        } else if (env.NODE_ENV !== 'production' || isSwitchAllowed) {
          // In testing mode or when cooldown has elapsed, auto-bind to the active machine
          const switchAllowedAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          await db
            .update(users)
            .set({
              deviceId: cleanDeviceId,
              deviceLastLockedAt: now,
              deviceSwitchAllowedAfter: switchAllowedAfter,
              updatedAt: now,
            })
            .where(eq(users.id, user.id));
          user.deviceId = cleanDeviceId;
          user.deviceLastLockedAt = now;
          user.deviceSwitchAllowedAfter = switchAllowedAfter;
        }
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
    let orgInfo = null;
    if (user.organizationId) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, user.organizationId))
        .limit(1);
      if (org) {
        if (user.role === 'super_admin') {
          orgInfo = org;
        } else {
          const { profitMultiplier: _m, ...cleanOrg } = org;
          orgInfo = cleanOrg;
        }
      }
    }

    return reply.send({
      user,
      organization: orgInfo,
    });
  });
};
