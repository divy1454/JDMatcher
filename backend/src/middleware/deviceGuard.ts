import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { env } from '../env.js';

export async function deviceGuard(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user;
  if (!user) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  // Device lock applies strictly to Recruiters
  if (user.role !== 'recruiter') {
    return;
  }

  const deviceIdHeader = request.headers['x-device-id'];
  const deviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;

  if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
    return reply.status(400).send({
      error: 'DEVICE_ID_REQUIRED',
      message: 'Recruiter operations require an x-device-id header representing machine hardware identity',
    });
  }

  const cleanDeviceId = deviceId.trim();

  // If user has no device locked yet: First-time auto-bind
  if (!user.deviceId) {
    const now = new Date();
    const switchAllowedAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days cooldown

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
    user.deviceSwitchAllowedAfter = switchAllowedAfter;
    return;
  }

  // Device matches existing lock
  if (user.deviceId === cleanDeviceId) {
    return;
  }

  // Device mismatch: Device resetting must be authorized by Super Admin only
  return reply.status(403).send({
    error: 'DEVICE_MISMATCH',
    code: 'DEVICE_LOCKED',
    message: 'Recruiter seat is locked to a different physical computer. Device resetting must be performed by Super Admin only.',
    lockedDeviceId: user.deviceId,
    incomingDeviceId: cleanDeviceId,
  });
}
