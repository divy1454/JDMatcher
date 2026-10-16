import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { env } from '../env.js';

const { Pool } = pg;

const isProduction = env.NODE_ENV === 'production';
// Enable SSL for Supabase and production PostgreSQL providers
const requiresSsl = isProduction || env.DATABASE_URL.includes('supabase.com') || env.DATABASE_URL.includes('neon.tech');

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: isProduction ? 10 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

export async function testDbConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch (error) {
    console.error('Failed to connect to database:', error);
    return false;
  }
}
