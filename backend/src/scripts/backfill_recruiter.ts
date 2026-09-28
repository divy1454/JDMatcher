import path from 'path';
import * as dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function backfill() {
  const res = await pool.query("SELECT id, email FROM users WHERE role = 'recruiter'");
  console.log('Recruiters in DB:', res.rows);
  if (res.rows.length > 0) {
    const recruiterId = res.rows[0].id;
    const updateRes = await pool.query(
      'UPDATE candidates SET created_by_recruiter_id = $1 WHERE created_by_recruiter_id IS NULL',
      [recruiterId]
    );
    console.log(`Assigned ${updateRes.rowCount} benchmark candidates to recruiter ${res.rows[0].email} (${recruiterId})`);
  }
  await pool.end();
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
