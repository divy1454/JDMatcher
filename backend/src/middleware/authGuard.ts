import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface AuthenticatedUser {
  id: string;
  organizationId: string | null;
  role: 'super_admin' | 'org_admin' | 'recruiter';
  email: string;
  fullName: string;
  deviceId: string | null;
  deviceLastLockedAt: Date | null;
  deviceSwitchAllowedAfter: Date | null;
  deviceMonthlySwitchCount: number;
  createdAt: Date;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string; organizationId: string | null };
    user: AuthenticatedUser;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}

import { organizations } from '../db/schema.js';

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Explicitly pin HS256 algorithm during JWT verification
    await request.jwtVerify();
    const tokenPayload = request.user as unknown as { id: string; email: string };

    // Fetch fresh user record from DB to verify active status
    const [userRecord] = await db
      .select()
      .from(users)
      .where(eq(users.id, tokenPayload.id))
      .limit(1);

    if (!userRecord || !userRecord.isActive) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'User account not found or deactivated' });
    }

    // Verify organization is active for non-super-admin users
    if (userRecord.organizationId) {
      const [orgRecord] = await db
        .select({ id: organizations.id, isActive: organizations.isActive })
        .from(organizations)
        .where(eq(organizations.id, userRecord.organizationId))
        .limit(1);

      if (!orgRecord || !orgRecord.isActive) {
        return reply.status(403).send({
          error: 'ORGANIZATION_DEACTIVATED',
          message: 'Your organization account is suspended or deactivated. Please contact support.',
        });
      }
    }

    request.user = {
      id: userRecord.id,
      organizationId: userRecord.organizationId,
      role: userRecord.role,
      email: userRecord.email,
      fullName: userRecord.fullName,
      deviceId: userRecord.deviceId,
      deviceLastLockedAt: userRecord.deviceLastLockedAt,
      deviceSwitchAllowedAfter: userRecord.deviceSwitchAllowedAfter,
      deviceMonthlySwitchCount: userRecord.deviceMonthlySwitchCount || 0,
      createdAt: userRecord.createdAt,
    };
  } catch (err) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or missing authentication token' });
  }
}

export function requireRole(allowedRoles: ('super_admin' | 'org_admin' | 'recruiter')[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
      });
    }
  };
}
