import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { env } from './env.js';
import { pool, testDbConnection } from './db/index.js';
import { authRoutes } from './routes/auth.routes.js';
import { analyzeRoutes } from './routes/analyze.routes.js';
import { orgsRoutes } from './routes/orgs.routes.js';
import { candidatesRoutes } from './routes/candidates.routes.js';
import { recruitersRoutes } from './routes/recruiters.routes.js';
import { promptSettingsRoutes } from './routes/promptSettings.routes.js';
import { telemetryRoutes } from './routes/telemetry.routes.js';
import { invoicesRoutes } from './routes/invoices.routes.js';

export async function buildServer() {
  const isProduction = env.NODE_ENV === 'production';

  const app = Fastify({
    logger: env.NODE_ENV !== 'test'
      ? {
          level: isProduction ? 'info' : 'debug',
          ...(isProduction
            ? {
                redact: ['req.headers.authorization', 'req.headers["x-device-id"]'],
              }
            : {}),
        }
      : false,
    trustProxy: true,
    bodyLimit: 1_048_576, // 1MB max request body
  });

  // Sensible defaults and error decorators
  await app.register(sensible);

  // Security headers (disabled for SSE content-type override)
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disabled to support SSE and Chrome Extension
  });

  // Rate limiting (production: 100 req/min per IP, dev: relaxed)
  await app.register(rateLimit, {
    max: isProduction ? 100 : 1000,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'],
  });

  // CORS support for Next.js frontend and Chrome Extension
  const corsOrigins: string[] | true = env.CORS_ORIGINS && env.CORS_ORIGINS.trim().length > 0
    ? env.CORS_ORIGINS.split(',').map((o: string) => o.trim()).filter(Boolean)
    : true; // Allow all in development when no origins specified

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, server-to-server, background service workers)
      if (!origin) return cb(null, true);
      // Always allow Chrome & browser extensions
      if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
        return cb(null, true);
      }
      if (corsOrigins === true) return cb(null, true);
      if (Array.isArray(corsOrigins)) {
        if (corsOrigins.includes(origin) || corsOrigins.includes('*')) {
          return cb(null, true);
        }
      }
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'Accept'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // JWT Plugin
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: '7d',
    },
  });

  // System Health Check
  const healthHandler = async () => ({
    status: 'healthy',
    service: 'JDMatcher Enterprise Backend API',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  // API Routes - Registered under both /api/* and root /* for universal compatibility
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(authRoutes, { prefix: '/auth' });

  await app.register(analyzeRoutes, { prefix: '/api/analyze' });
  await app.register(analyzeRoutes, { prefix: '/analyze' });

  await app.register(orgsRoutes, { prefix: '/api/orgs' });
  await app.register(orgsRoutes, { prefix: '/orgs' });

  await app.register(candidatesRoutes, { prefix: '/api/candidates' });
  await app.register(candidatesRoutes, { prefix: '/candidates' });

  await app.register(recruitersRoutes, { prefix: '/api/recruiters' });
  await app.register(recruitersRoutes, { prefix: '/recruiters' });

  await app.register(promptSettingsRoutes, { prefix: '/api/prompt-settings' });
  await app.register(promptSettingsRoutes, { prefix: '/prompt-settings' });

  await app.register(telemetryRoutes, { prefix: '/api/telemetry' });
  await app.register(telemetryRoutes, { prefix: '/telemetry' });

  await app.register(invoicesRoutes, { prefix: '/api/invoices' });
  await app.register(invoicesRoutes, { prefix: '/invoices' });

  return app;
}

async function start() {
  const server = await buildServer();

  try {
    const isDbConnected = await testDbConnection();
    if (isDbConnected) {
      server.log.info('PostgreSQL Database connection verified.');
    } else {
      server.log.warn('Could not verify PostgreSQL connection. Ensure DATABASE_URL is reachable.');
    }

    await server.listen({ port: env.PORT, host: env.HOST });
    console.log(`\n======================================================`);
    console.log(`  JDMatcher Enterprise API listening on http://${env.HOST}:${env.PORT}`);
    console.log(`  Environment: ${env.NODE_ENV}`);
    console.log(`======================================================\n`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const closeSignals = ['SIGINT', 'SIGTERM'];
  for (const signal of closeSignals) {
    process.on(signal, async () => {
      console.log(`Received ${signal}, closing server...`);
      await server.close();
      await pool.end();
      process.exit(0);
    });
  }
}

// Always start when this module is the entry point
// Works correctly for both `tsx src/server.ts` (dev) and `node dist/server.js` (prod)
start();
