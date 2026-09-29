import bcrypt from 'bcryptjs';
import { db, pool } from '../db/index.js';
import { users, organizations, candidates, platformSettings, invoices, tokenConsumptionLedger } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { env } from '../env.js';
import { DEFAULT_GLOBAL_EVAL_PROMPT } from '../services/promptService.js';

export async function seed() {
  console.log('--- Commencing JDMatcher Enterprise Database Seeding ---');

  // 1. Seed Global Evaluation Prompt
  console.log('Seeding Global Evaluation Prompt into platform_settings...');
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

  // 2. Seed Super Admin Account
  console.log(`Checking Super Admin account (${env.SUPER_ADMIN_EMAIL})...`);
  const [existingSuperAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.email, env.SUPER_ADMIN_EMAIL.toLowerCase()))
    .limit(1);

    const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 10);
    if (!existingSuperAdmin) {
      const [superAdmin] = await db
        .insert(users)
        .values({
          organizationId: null, // Super Admin is not tied to any tenant
          role: 'super_admin',
          email: env.SUPER_ADMIN_EMAIL.toLowerCase(),
          passwordHash,
          fullName: env.SUPER_ADMIN_NAME,
        })
        .returning();
      console.log(`Super Admin provisioned successfully: ${superAdmin.email}`);
    } else {
      await db
        .update(users)
        .set({
          passwordHash,
          fullName: env.SUPER_ADMIN_NAME,
          role: 'super_admin',
          organizationId: null,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingSuperAdmin.id));
      console.log(`Super Admin account refreshed with current env credentials: ${existingSuperAdmin.email}`);
    }

    const shouldSeedDemo = process.argv.includes('--demo');
    if (!shouldSeedDemo) {
      console.log('\n--- Fresh Workflow Mode: Demo agency seeding skipped (use --demo to seed Apex IT demo) ---');
      console.log('--- Database Seeding Completed Successfully ---');
      return;
    }

    // 3. Seed Demo Agency: Apex IT Staffing (Only when --demo flag is provided)
    console.log('Checking demo agency: Apex IT Staffing...');
    let [demoOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'apex-it-staffing'))
      .limit(1);

  if (!demoOrg) {
    [demoOrg] = await db
      .insert(organizations)
      .values({
        name: 'Apex IT Staffing Solutions',
        slug: 'apex-it-staffing',
        securityDepositLimit: '500.0000',
        totalBilledAmount: '0.0000',
        profitMultiplier: '4.00',
      })
      .returning();
    console.log(`Demo Agency created: ${demoOrg.name} ($500.00 Deposit Limit, 4.0x Multiplier)`);
  }

  // 4. Seed Org Admin for Demo Agency
  const orgAdminEmail = 'admin@apexit.com';
  const [existingOrgAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.email, orgAdminEmail))
    .limit(1);

  if (!existingOrgAdmin) {
    const adminHash = await bcrypt.hash('ApexAdmin2026!', 10);
    await db.insert(users).values({
      organizationId: demoOrg.id,
      role: 'org_admin',
      email: orgAdminEmail,
      passwordHash: adminHash,
      fullName: 'Sarah Jenkins (Apex Director)',
    });
    console.log(`Org Admin created: ${orgAdminEmail}`);
  }

  // 5. Seed Recruiter for Demo Agency
  const recruiterEmail = 'recruiter@apexit.com';
  const [existingRecruiter] = await db
    .select()
    .from(users)
    .where(eq(users.email, recruiterEmail))
    .limit(1);

  let recruiterId = existingRecruiter?.id;
  if (!existingRecruiter) {
    const recHash = await bcrypt.hash('Recruiter2026!', 10);
    const [recruiter] = await db
      .insert(users)
      .values({
        organizationId: demoOrg.id,
        role: 'recruiter',
        email: recruiterEmail,
        passwordHash: recHash,
        fullName: 'Mike Ross (Bench Sales)',
        deviceId: null,
        deviceLastLockedAt: null,
        deviceSwitchAllowedAfter: null,
      })
      .returning();
    recruiterId = recruiter.id;
    console.log(`Recruiter created: ${recruiterEmail} (Ready to hardware-bind on first extension login)`);
  }

  // 6. Seed Realistic Candidates for Demo Agency with strict ENUMs
  const [existingCandidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.organizationId, demoOrg.id))
    .limit(1);

  if (!existingCandidate) {
    console.log('Seeding demo bench candidates with strict ENUMs...');
    await db.insert(candidates).values([
      {
        organizationId: demoOrg.id,
        createdByRecruiterId: recruiterId,
        fullName: 'Vikram Sharma',
        primaryTitle: 'Lead Java Cloud Architect',
        rawResumeText: `
VIKRAM SHARMA - Lead Java Cloud Architect
SUMMARY: 11+ years of experience architecting distributed enterprise applications.
EXPERTISE: Core Java, Spring Boot 3, Spring Cloud, AWS (ECS, EKS, RDS, S3, Lambda), Kafka, Docker, Kubernetes.
WORK AUTHORIZATION: H-1B (Valid until 2028).
EXPERIENCE:
- Lead Architect at Capital One (2021-Present): Designed high-throughput transaction ledger handling 45k TPS with Kafka and Spring Boot.
- Senior Java Engineer at JPMorgan Chase (2017-2021): Migrated monolith banking service to AWS EKS microservices.
EDUCATION: B.Tech in Computer Science.
        `.trim(),
      },
      {
        organizationId: demoOrg.id,
        createdByRecruiterId: recruiterId,
        fullName: 'Ashley Taylor',
        primaryTitle: 'Senior Full Stack Engineer',
        rawResumeText: `
ASHLEY TAYLOR - Senior Full Stack Engineer
SUMMARY: 8 years building resilient enterprise web applications. Holds active Secret clearance.
CLEARANCE: Active Secret Clearance (Department of Defense).
CITIZENSHIP: US Citizen.
SKILLS: React 18/19, Next.js App Router, TypeScript, Node.js, Fastify, PostgreSQL, GraphQL, Docker.
EXPERIENCE:
- Senior Engineer at Lockheed Martin (2020-Present): Led classified telemetry portal development using React and Fastify.
- Full Stack Engineer at General Dynamics (2017-2020): Built mission tracking dashboard.
        `.trim(),
      },
      {
        organizationId: demoOrg.id,
        createdByRecruiterId: recruiterId,
        fullName: 'Carlos Gomez',
        primaryTitle: 'DevOps / Platform Engineer',
        rawResumeText: `
CARLOS GOMEZ - DevOps & Cloud Platform Engineer
SUMMARY: 7 years specializing in Kubernetes orchestration, Terraform infrastructure as code, and automated CI/CD pipelines.
WORK AUTHORIZATION: US Permanent Resident (Green Card).
CLEARANCE: Public Trust.
SKILLS: AWS, Terraform, Kubernetes, Helm, ArgoCD, GitHub Actions, Prometheus, Grafana, Linux.
EXPERIENCE:
- Platform Engineer at Wayfair (2021-Present): Managed 120-node multi-region EKS clusters with Terraform and GitOps.
        `.trim(),
      },
    ]);
    console.log('Seeded 3 benchmark bench candidates.');
  }

  // 7. Seed Monthly Expense Tracking & Real-Life Invoices for Demo Agency (Apex IT Staffing)
  console.log('Refreshing monthly token-only invoices for Apex IT Staffing...');
  await db.delete(invoices).where(eq(invoices.organizationId, demoOrg.id));

  if (true) {
    console.log('Seeding rich monthly business-level invoices with UPI details (Pure Token Pricing)...');
    
    // Seed sample ledger entries across months if empty
    const [existingLedger] = await db
      .select()
      .from(tokenConsumptionLedger)
      .where(eq(tokenConsumptionLedger.organizationId, demoOrg.id))
      .limit(1);

    if (!existingLedger && recruiterId) {
      console.log('Seeding historical ledger consumption entries...');
      await db.insert(tokenConsumptionLedger).values([
        // July 2026
        {
          organizationId: demoOrg.id,
          recruiterId,
          inputTokens: 980000,
          outputTokens: 980000,
          totalTokens: 1960000,
          rawCostUsd: '12.250000',
          profitMultiplier: '4.00',
          billedCostUsd: '49.000000',
          latencyMs: 740,
          modelName: 'gemini-3.5-flash-lite',
          timestamp: new Date('2026-07-20T10:30:00Z'),
        },
        // August 2026
        {
          organizationId: demoOrg.id,
          recruiterId,
          inputTokens: 2150000,
          outputTokens: 2150000,
          totalTokens: 4300000,
          rawCostUsd: '26.875000',
          profitMultiplier: '4.00',
          billedCostUsd: '107.500000',
          latencyMs: 690,
          modelName: 'gemini-3.5-flash-lite',
          timestamp: new Date('2026-08-18T14:45:00Z'),
        },
        // September 2026
        {
          organizationId: demoOrg.id,
          recruiterId,
          inputTokens: 1420000,
          outputTokens: 1420000,
          totalTokens: 2840000,
          rawCostUsd: '17.800000',
          profitMultiplier: '4.00',
          billedCostUsd: '71.200000',
          latencyMs: 710,
          modelName: 'gemini-3.5-flash-lite',
          timestamp: new Date('2026-09-15T11:20:00Z'),
        },
        // October 2026 (Unbilled / Ongoing)
        {
          organizationId: demoOrg.id,
          recruiterId,
          inputTokens: 340000,
          outputTokens: 340000,
          totalTokens: 680000,
          rawCostUsd: '4.250000',
          profitMultiplier: '4.00',
          billedCostUsd: '17.000000',
          latencyMs: 650,
          modelName: 'gemini-3.5-flash-lite',
          timestamp: new Date('2026-10-02T09:15:00Z'),
        },
      ]);
    }

    // Seed July 2026 (Paid Invoice)
    await db.insert(invoices).values({
      organizationId: demoOrg.id,
      invoiceNumber: 'JDM-202607-APEX01',
      billingMonth: '2026-07',
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-07-31T23:59:59Z'),
      issueDate: new Date('2026-08-01T09:00:00Z'),
      dueDate: new Date('2026-08-15T23:59:59Z'),
      status: 'paid',
      isGenerated: true,
      totalEvaluations: 980,
      totalTokens: 7100000,
      rawCostUsd: '12.2500',
      subtotalUsd: '49.0000',
      taxUsd: '0.0000',
      totalAmountUsd: '49.0000',
      exchangeRateInr: '86.5000',
      totalAmountInr: '4238.50',
      upiId: '8999911999-2@ybl',
      ownerName: 'Divy Patel',
      ownerPhone: '+91 8999911999',
      ownerEmail: 'divy9954@gmail.com',
      lineItems: [
        {
          id: 'li-in',
          category: 'Input Tokens',
          description: 'Gemini 3.5 Flash-Lite Input Tokens (Prompt & Context Processing)',
          quantity: 2500000,
          unit: 'tokens',
          unitPriceUsd: 0.0000012,
          totalUsd: 3.00,
        },
        {
          id: 'li-out',
          category: 'Output Tokens',
          description: 'Gemini 3.5 Flash-Lite Output Tokens (Evaluation Reasoning & Match Scoring)',
          quantity: 4600000,
          unit: 'tokens',
          unitPriceUsd: 0.000010,
          totalUsd: 46.00,
        },
      ],
      notes: 'Settled via UPI transaction ID: UPI/20260729/89999119992. Receipt generated.',
      generatedBy: 'divy9954@gmail.com',
      generatedAt: new Date('2026-08-01T09:00:00Z'),
      paidAt: new Date('2026-07-29T14:30:00Z'),
    });

    // Seed August 2026 (Paid Invoice)
    await db.insert(invoices).values({
      organizationId: demoOrg.id,
      invoiceNumber: 'JDM-202608-APEX01',
      billingMonth: '2026-08',
      periodStart: new Date('2026-08-01T00:00:00Z'),
      periodEnd: new Date('2026-08-31T23:59:59Z'),
      issueDate: new Date('2026-09-01T09:00:00Z'),
      dueDate: new Date('2026-09-15T23:59:59Z'),
      status: 'paid',
      isGenerated: true,
      totalEvaluations: 2150,
      totalTokens: 16250000,
      rawCostUsd: '26.8750',
      subtotalUsd: '107.5000',
      taxUsd: '0.0000',
      totalAmountUsd: '107.5000',
      exchangeRateInr: '86.5000',
      totalAmountInr: '9298.75',
      upiId: '8999911999-2@ybl',
      ownerName: 'Divy Patel',
      ownerPhone: '+91 8999911999',
      ownerEmail: 'divy9954@gmail.com',
      lineItems: [
        {
          id: 'li-in',
          category: 'Input Tokens',
          description: 'Gemini 3.5 Flash-Lite Input Tokens (Prompt & Context Processing)',
          quantity: 6250000,
          unit: 'tokens',
          unitPriceUsd: 0.0000012,
          totalUsd: 7.50,
        },
        {
          id: 'li-out',
          category: 'Output Tokens',
          description: 'Gemini 3.5 Flash-Lite Output Tokens (Evaluation Reasoning & Match Scoring)',
          quantity: 10000000,
          unit: 'tokens',
          unitPriceUsd: 0.000010,
          totalUsd: 100.00,
        },
      ],
      notes: 'Settled via UPI transaction ID: UPI/20260828/89999119992. Receipt generated.',
      generatedBy: 'divy9954@gmail.com',
      generatedAt: new Date('2026-09-01T09:00:00Z'),
      paidAt: new Date('2026-08-28T18:15:00Z'),
    });

    // Seed September 2026 (Generated & Published Invoice - Payment Due)
    await db.insert(invoices).values({
      organizationId: demoOrg.id,
      invoiceNumber: 'JDM-202609-APEX01',
      billingMonth: '2026-09',
      periodStart: new Date('2026-09-01T00:00:00Z'),
      periodEnd: new Date('2026-09-30T23:59:59Z'),
      issueDate: new Date('2026-09-25T11:00:00Z'),
      dueDate: new Date('2026-10-15T23:59:59Z'),
      status: 'generated',
      isGenerated: true, // Super admin chose to generate bill! Agency gets Download Invoice button!
      totalEvaluations: 1420,
      totalTokens: 10200000,
      rawCostUsd: '17.8000',
      subtotalUsd: '71.2000',
      taxUsd: '0.0000',
      totalAmountUsd: '71.2000',
      exchangeRateInr: '86.5000',
      totalAmountInr: '6158.80',
      upiId: '8999911999-2@ybl',
      ownerName: 'Divy Patel',
      ownerPhone: '+91 8999911999',
      ownerEmail: 'divy9954@gmail.com',
      lineItems: [
        {
          id: 'li-in',
          category: 'Input Tokens',
          description: 'Gemini 3.5 Flash-Lite Input Tokens (Prompt & Context Processing)',
          quantity: 3500000,
          unit: 'tokens',
          unitPriceUsd: 0.0000012,
          totalUsd: 4.20,
        },
        {
          id: 'li-out',
          category: 'Output Tokens',
          description: 'Gemini 3.5 Flash-Lite Output Tokens (Evaluation Reasoning & Match Scoring)',
          quantity: 6700000,
          unit: 'tokens',
          unitPriceUsd: 0.000010,
          totalUsd: 67.00,
        },
      ],
      notes: 'Scan the UPI QR code using Google Pay, PhonePe, or Paytm to pay ₹6,158.80 instantly.',
      generatedBy: 'divy9954@gmail.com',
      generatedAt: new Date('2026-09-25T11:00:00Z'),
    });

    // Seed October 2026 (Unbilled / Ongoing Month with isGenerated = false)
    await db.insert(invoices).values({
      organizationId: demoOrg.id,
      invoiceNumber: 'JDM-202610-APEX01',
      billingMonth: '2026-10',
      periodStart: new Date('2026-10-01T00:00:00Z'),
      periodEnd: new Date('2026-10-31T23:59:59Z'),
      issueDate: new Date('2026-10-02T09:00:00Z'),
      dueDate: new Date('2026-11-15T23:59:59Z'),
      status: 'draft',
      isGenerated: false, // Super admin has NOT generated bill yet! Download button hidden from Agency!
      totalEvaluations: 340,
      totalTokens: 2580000,
      rawCostUsd: '4.2500',
      subtotalUsd: '17.0000',
      taxUsd: '0.0000',
      totalAmountUsd: '17.0000',
      exchangeRateInr: '86.5000',
      totalAmountInr: '1470.50',
      upiId: '8999911999-2@ybl',
      ownerName: 'Divy Patel',
      ownerPhone: '+91 8999911999',
      ownerEmail: 'divy9954@gmail.com',
      lineItems: [
        {
          id: 'li-in',
          category: 'Input Tokens',
          description: 'Gemini 3.5 Flash-Lite Input Tokens (Prompt & Context Processing)',
          quantity: 1000000,
          unit: 'tokens',
          unitPriceUsd: 0.0000012,
          totalUsd: 1.20,
        },
        {
          id: 'li-out',
          category: 'Output Tokens',
          description: 'Gemini 3.5 Flash-Lite Output Tokens (Evaluation Reasoning & Match Scoring)',
          quantity: 1580000,
          unit: 'tokens',
          unitPriceUsd: 0.000010,
          totalUsd: 15.80,
        },
      ],
      notes: 'Pending Super Admin monthly billing generation.',
    });

    console.log('Seeded 4 months of realistic expense tracking & invoices (Jul, Aug, Sep, Oct) for Apex IT Staffing!');
  }

  console.log('--- Database Seeding Completed Successfully ---');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seeding failed:', err);
      await pool.end();
      process.exit(1);
    });
}
