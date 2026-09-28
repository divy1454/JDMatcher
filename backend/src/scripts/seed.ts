import bcrypt from 'bcryptjs';
import { db, pool } from '../db/index.js';
import { users, organizations, candidates, platformSettings } from '../db/schema.js';
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

  if (!existingSuperAdmin) {
    const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 10);
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
    console.log(`Super Admin account already exists: ${existingSuperAdmin.email}`);
  }

  // 3. Seed Demo Agency: Apex IT Staffing
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
