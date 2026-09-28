import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { organizations } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function depositGuard(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user;
  if (!user || !user.organizationId) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  // Fetch organization billing limits
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      securityDepositLimit: organizations.securityDepositLimit,
      totalBilledAmount: organizations.totalBilledAmount,
      isActive: organizations.isActive,
    })
    .from(organizations)
    .where(eq(organizations.id, user.organizationId))
    .limit(1);

  if (!org || !org.isActive) {
    return reply.status(403).send({ error: 'ORG_INACTIVE', message: 'Organization account is disabled or missing' });
  }

  const depositLimit = parseFloat(org.securityDepositLimit);
  const billedAmount = parseFloat(org.totalBilledAmount);

  // HARD STOP: If total_billed_amount >= security_deposit_limit, return HTTP 402
  if (billedAmount >= depositLimit) {
    return reply.status(402).send({
      error: 'PAYMENT_REQUIRED',
      code: 'DEPOSIT_LIMIT_EXCEEDED',
      message: 'Organization security deposit limit reached. Contact Super Admin to settle and reset your balance.',
      totalBilledAmount: billedAmount,
      securityDepositLimit: depositLimit,
    });
  }
}
