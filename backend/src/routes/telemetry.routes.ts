import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { BillingService } from '../services/billingService.js';
import { telemetryService, TelemetryEvent } from '../services/telemetryService.js';
import { pool, db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { organizations, users, tokenConsumptionLedger, matchedJds } from '../db/schema.js';

const statsQuerySchema = z.object({
  timeframe: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
});

export const telemetryRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/telemetry/stats (Super Admin: Aggregated stats and time-series for Recharts)
  fastify.get(
    '/stats',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      const parseResult = statsQuerySchema.safeParse(request.query);
      const timeframe = parseResult.success ? parseResult.data.timeframe : '24h';

      const stats = await BillingService.getTelemetryStats(timeframe);

      // Server health and table row counts (robust when tables are empty)
      const countsResult = await db.execute<{
        orgCount: string;
        userCount: string;
        ledgerCount: string;
        matchedJdCount: string;
      }>(sql`
        SELECT
          (SELECT count(*) FROM organizations) as "orgCount",
          (SELECT count(*) FROM users) as "userCount",
          (SELECT count(*) FROM token_consumption_ledger) as "ledgerCount",
          (SELECT count(*) FROM matched_jds) as "matchedJdCount"
      `);

      const counts = countsResult.rows[0] || {
        orgCount: '0',
        userCount: '0',
        ledgerCount: '0',
        matchedJdCount: '0',
      };

      return reply.send({
        ...stats,
        serverHealth: {
          uptimeSeconds: Math.floor(process.uptime()),
          memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          dbPool: {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount,
          },
          tableCounts: {
            organizations: Number(counts.orgCount),
            users: Number(counts.userCount),
            ledgerEntries: Number(counts.ledgerCount),
            matchedJds: Number(counts.matchedJdCount),
          },
        },
      });
    }
  );

  // GET /api/telemetry/stream (Super Admin: Live SSE event stream)
  fastify.get(
    '/stream',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      // Hijack the response so Fastify does not attempt to send its own reply
      reply.hijack();

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('Access-Control-Allow-Origin', '*');
      reply.raw.flushHeaders();

      // Send initial connection event
      reply.raw.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to live telemetry stream' })}\n\n`);

      const onTelemetry = (event: TelemetryEvent) => {
        try {
          reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        } catch (_err) {
          // Client likely disconnected — cleanup handled by 'close' event
        }
      };

      telemetryService.on('telemetry', onTelemetry);

      // Send periodic health pulse every 5 seconds
      const pulseInterval = setInterval(() => {
        try {
          const pulseData = {
            type: 'health_pulse',
            timestamp: new Date().toISOString(),
            data: {
              dbConnections: pool.totalCount - pool.idleCount,
              uptimeSeconds: Math.floor(process.uptime()),
            },
          };
          reply.raw.write(`event: health_pulse\ndata: ${JSON.stringify(pulseData)}\n\n`);
        } catch (_err) {
          // Client likely disconnected
          clearInterval(pulseInterval);
        }
      }, 5000);

      // Cleanup on client disconnect
      request.raw.on('close', () => {
        clearInterval(pulseInterval);
        telemetryService.off('telemetry', onTelemetry);
      });
    }
  );
};
