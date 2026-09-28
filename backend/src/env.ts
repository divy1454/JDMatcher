import { z } from 'zod';
import * as dotenv from 'dotenv';
import path from 'path';

// Load root .env or local .env
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/jdmatcher'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().default('super-secret-jwt-key-jdmatcher-enterprise-2026-production'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  SUPER_ADMIN_EMAIL: z.string().email().default('admin@jdmatcher.internal'),
  SUPER_ADMIN_PASSWORD: z.string().default('ChangeMeInProd123!'),
  SUPER_ADMIN_NAME: z.string().default('Platform Super Admin'),
  // Production CORS: Comma-separated list of allowed origins
  CORS_ORIGINS: z.string().optional().default(''),
});

export const env = envSchema.parse(process.env);
