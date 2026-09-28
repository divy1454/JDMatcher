import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import path from 'path';

export async function runMigrations() {
  console.log('Running pending Drizzle migrations...');
  try {
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), './drizzle') });
    console.log('Migrations completed successfully.');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
