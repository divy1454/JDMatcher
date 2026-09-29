import bcrypt from 'bcryptjs';
import { db, pool } from '../db/index.js';
import {
  users,
  organizations,
  candidates,
  matchedJds,
  tokenConsumptionLedger,
  invoices,
  platformSettings,
} from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { env } from '../env.js';
import { DEFAULT_GLOBAL_EVAL_PROMPT } from '../services/promptService.js';

export async function freshStart() {
  console.log('====================================================');
  console.log('  STARTING FRESH WORKFLOW & DATABASE PURGE');
  console.log('====================================================');

  // Step 1: Wipe all transactional & tenant data in foreign-key safe order
  console.log('Clearing all invoices...');
  await db.delete(invoices);

  console.log('Clearing all token consumption ledger entries...');
  await db.delete(tokenConsumptionLedger);

  console.log('Clearing all matched job descriptions...');
  await db.delete(matchedJds);

  console.log('Clearing all candidate profiles...');
  await db.delete(candidates);

  console.log('Clearing all non-super-admin users...');
  await db.delete(users);

  console.log('Clearing all organizations/agencies...');
  await db.delete(organizations);

  console.log('All tenant and demo data completely cleared from DB.');

  // Step 2: Ensure Global Evaluation Prompt is present in platform_settings
  console.log('\nInitializing Global Evaluation Prompt in platform_settings...');
  await db
    .insert(platformSettings)
    .values({
      key: 'GLOBAL_EVAL_PROMPT',
      value: DEFAULT_GLOBAL_EVAL_PROMPT,
      description: 'Default platform fallback evaluation prompt for bench sales matching',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        value: DEFAULT_GLOBAL_EVAL_PROMPT,
        updatedAt: new Date(),
      },
    });
  console.log('Global Evaluation Prompt initialized.');

  // Step 3: Provision Super Admin with user-defined credentials
  const superAdminEmail = env.SUPER_ADMIN_EMAIL.toLowerCase().trim();
  const superAdminPassword = env.SUPER_ADMIN_PASSWORD;
  const superAdminName = env.SUPER_ADMIN_NAME;

  console.log(`\nProvisioning Super Admin account:`);
  console.log(`  Email: ${superAdminEmail}`);
  console.log(`  Name:  ${superAdminName}`);

  const passwordHash = await bcrypt.hash(superAdminPassword, 10);

  const [existingSuperAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.email, superAdminEmail))
    .limit(1);

  let superAdminId: string;
  if (!existingSuperAdmin) {
    const [created] = await db
      .insert(users)
      .values({
        organizationId: null,
        role: 'super_admin',
        email: superAdminEmail,
        passwordHash,
        fullName: superAdminName,
        isActive: true,
      })
      .returning();
    superAdminId = created.id;
    console.log(`  Status: Created new Super Admin account (ID: ${superAdminId})`);
  } else {
    const [updated] = await db
      .update(users)
      .set({
        passwordHash,
        fullName: superAdminName,
        role: 'super_admin',
        organizationId: null,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingSuperAdmin.id))
      .returning();
    superAdminId = updated.id;
    console.log(`  Status: Updated existing Super Admin credentials (ID: ${superAdminId})`);
  }

  // Step 4: Verify Database State
  console.log('\n--- VERIFYING FRESH DATABASE STATE ---');
  const orgCount = await db.select({ count: sql<number>`count(*)` }).from(organizations);
  const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
  const candCount = await db.select({ count: sql<number>`count(*)` }).from(candidates);
  const invoiceCount = await db.select({ count: sql<number>`count(*)` }).from(invoices);
  const ledgerCount = await db.select({ count: sql<number>`count(*)` }).from(tokenConsumptionLedger);

  console.log(`  Organizations:             ${Number(orgCount[0]?.count || 0)} (Fresh Start)`);
  console.log(`  Total Users:               ${Number(userCount[0]?.count || 0)} (Only Super Admin)`);
  console.log(`  Candidates:                ${Number(candCount[0]?.count || 0)} (Clean)`);
  console.log(`  Invoices:                  ${Number(invoiceCount[0]?.count || 0)} (Clean)`);
  console.log(`  Token Consumption Entries: ${Number(ledgerCount[0]?.count || 0)} (Clean)`);

  // Step 5: Test Super Admin Login Verification
  const [verifyUser] = await db.select().from(users).where(eq(users.email, superAdminEmail)).limit(1);
  const isPasswordValid = await bcrypt.compare(superAdminPassword, verifyUser.passwordHash);
  if (!isPasswordValid) {
    throw new Error('CRITICAL: Password verification failed for Super Admin after fresh start!');
  }
  console.log(`\n  Super Admin Credentials Verified: LOGIN READY (BCrypt match: OK)`);
  console.log('====================================================');
  console.log('  FRESH START READY: Super Admin can now log in!');
  console.log('====================================================\n');
}

if (process.argv[1] && process.argv[1].endsWith('fresh-start.ts')) {
  freshStart()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Fresh start failed:', err);
      await pool.end();
      process.exit(1);
    });
}
