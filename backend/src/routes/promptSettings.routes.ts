import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { platformSettings, organizations } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { DEFAULT_GLOBAL_EVAL_PROMPT } from '../services/promptService.js';

const promptPayloadSchema = z.object({
  prompt: z.string().min(20, 'Prompt must be at least 20 characters'),
});

export const promptSettingsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/prompt-settings/global (Super Admin: get platform-wide fallback prompt)
  fastify.get(
    '/global',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      const [setting] = await db
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, 'GLOBAL_EVAL_PROMPT'))
        .limit(1);

      return reply.send({
        key: 'GLOBAL_EVAL_PROMPT',
        prompt: setting?.value || DEFAULT_GLOBAL_EVAL_PROMPT,
        updatedAt: setting?.updatedAt || new Date().toISOString(),
      });
    }
  );

  // PUT /api/prompt-settings/global (Super Admin: update platform-wide fallback prompt)
  fastify.put(
    '/global',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      const parseResult = promptPayloadSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const { prompt } = parseResult.data;

      const [updated] = await db
        .insert(platformSettings)
        .values({
          key: 'GLOBAL_EVAL_PROMPT',
          value: prompt,
          description: 'Global fallback evaluation prompt for bench sales matching',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: {
            value: prompt,
            updatedAt: new Date(),
          },
        })
        .returning();

      return reply.send({
        success: true,
        setting: updated,
      });
    }
  );

  // GET /api/prompt-settings/org (Org Admin: get agency custom evaluation prompt)
  fastify.get(
    '/org',
    { preHandler: [authGuard, requireRole(['org_admin'])] },
    async (request, reply) => {
      const user = request.user!;

      const [org] = await db
        .select({
          customEvalPrompt: organizations.customEvalPrompt,
        })
        .from(organizations)
        .where(eq(organizations.id, user.organizationId!))
        .limit(1);

      return reply.send({
        customEvalPrompt: org?.customEvalPrompt || null,
        fallbackPrompt: DEFAULT_GLOBAL_EVAL_PROMPT,
      });
    }
  );

  // PUT /api/prompt-settings/org (Org Admin: update agency custom evaluation prompt)
  fastify.put(
    '/org',
    { preHandler: [authGuard, requireRole(['org_admin'])] },
    async (request, reply) => {
      const user = request.user!;
      const parseResult = z
        .object({
          customEvalPrompt: z.string().nullable(),
        })
        .safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const { customEvalPrompt } = parseResult.data;

      const [updated] = await db
        .update(organizations)
        .set({
          customEvalPrompt: customEvalPrompt ? customEvalPrompt.trim() : null,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, user.organizationId!))
        .returning({
          id: organizations.id,
          customEvalPrompt: organizations.customEvalPrompt,
        });

      return reply.send({
        success: true,
        organization: updated,
      });
    }
  );
};
