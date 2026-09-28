import { FastifyRequest, FastifyReply } from 'fastify';

export async function tenantGuard(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user;
  if (!user) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  // Super Admin bypasses organizationId boundary for administration,
  // but note that Super Admin has ZERO access to JDs and resumes via route guards!
  if (user.role === 'super_admin') {
    return;
  }

  if (!user.organizationId) {
    return reply.status(403).send({ error: 'FORBIDDEN', message: 'User is not assigned to any organization' });
  }

  // Verify that any explicit organizationId parameter matches the user's organization
  const params = request.params as Record<string, string> | undefined;
  if (params && params.organizationId && params.organizationId !== user.organizationId) {
    return reply.status(403).send({
      error: 'TENANT_VIOLATION',
      message: 'Access to data outside your organization is strictly prohibited',
    });
  }

  const query = request.query as Record<string, string> | undefined;
  if (query && query.organizationId && query.organizationId !== user.organizationId) {
    return reply.status(403).send({
      error: 'TENANT_VIOLATION',
      message: 'Access to data outside your organization is strictly prohibited',
    });
  }

  // Also check request body for organizationId (POST/PATCH/PUT payloads)
  const body = request.body as Record<string, any> | undefined;
  if (body && body.organizationId && body.organizationId !== user.organizationId) {
    return reply.status(403).send({
      error: 'TENANT_VIOLATION',
      message: 'Access to data outside your organization is strictly prohibited',
    });
  }
}
