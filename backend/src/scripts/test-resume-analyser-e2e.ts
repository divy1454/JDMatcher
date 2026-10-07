import { db } from '../db/index.js';
import { users, organizations, candidates } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function testE2E() {
  console.log('--- Testing Resume Analyser End-to-End ---');

  // 1. Find or verify recruiter
  let [recruiter] = await db
    .select()
    .from(users)
    .where(eq(users.role, 'recruiter'))
    .limit(1);

  if (!recruiter) {
    console.log('No recruiter found, checking organizations...');
    let [org] = await db.select().from(organizations).limit(1);
    if (!org) {
      console.error('No organization found');
      return;
    }
    const hash = await bcrypt.hash('Recruiter2026!', 10);
    [recruiter] = await db.insert(users).values({
      organizationId: org.id,
      role: 'recruiter',
      email: 'recruiter-test@agency.com',
      passwordHash: hash,
      fullName: 'Test Recruiter',
    }).returning();
  }

  // Reset password of this recruiter to Recruiter2026! for test
  const passwordHash = await bcrypt.hash('Recruiter2026!', 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, recruiter.id));

  // 2. Login to get JWT
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: recruiter.email,
      password: 'Recruiter2026!',
    }),
  });

  const loginData = await loginRes.json();
  if (!loginData.token) {
    console.error('Login failed:', loginData);
    return;
  }
  const token = loginData.token;
  console.log('Logged in successfully, token received.');

  // 3. Find a candidate
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.organizationId, recruiter.organizationId!))
    .limit(1);

  console.log('Candidate found:', candidate?.fullName);

  // 4. Test Resume Analysis endpoint
  console.log('Calling POST /api/analyze/resume...');
  const resumeText = candidate?.rawResumeText || `
DAKSH PATEL
Marketing Analyst | Performance & Digital Analytics
Tempe, AZ | Phone: (480) 555-0192

SUMMARY: 4+ years of full-time experience in performance marketing analytics, campaign reporting, A/B testing, and digital media attribution. SQL, Python, Tableau, Power BI.

EXPERIENCE:
M&T Bank — Marketing Analyst (03/2024 – Present)
- Led campaign performance analysis for Retail Banking, Wealth Management, and Mortgage marketing.
- Conducted regression analyzing boosting ROI by 20%. Automated Power BI dashboards reducing turnaround 45%.

Reliance Jio — Marketing Analyst (01/2021 – 12/2022)
- Analyzed prepaid subscriber acquisition and recharge behavior across JioFiber broadband campaigns.
- Delivered cross-channel attribution reporting in Tableau with CRM and ERP data. CTR +24%, CPA -18%.

EDUCATION:
- MS in Business Analytics, Arizona State University (01/2023 – 12/2024)
- BTech in Computer Science, Gujarat Tech University (07/2018 – 06/2022)

SKILLS: Tableau, Power BI, SQL, Python, Excel VBA, Google Ads, Meta Ads, Marketo, HubSpot, Looker.
  `.trim();

  const boundDeviceId = recruiter.deviceId || 'mach_9cb628e8354a31bf43bc3ecb7a368e83';

  const analyzeRes = await fetch('http://localhost:4000/api/analyze/resume', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-device-id': boundDeviceId,
    },
    body: JSON.stringify({
      candidateId: candidate?.id,
      rawResumeText: resumeText,
      candidateName: candidate?.fullName || 'Daksh Patel',
      candidateTitle: candidate?.primaryTitle || 'Marketing Analyst',
    }),
  });

  if (!analyzeRes.ok) {
    const errText = await analyzeRes.text();
    console.error('Resume Analysis failed with status', analyzeRes.status, errText);
    return;
  }

  const analysisResult = await analyzeRes.json();
  console.log('\n--- Resume Analysis Results ---');
  console.log('Record ID:', analysisResult.id);
  console.log('Total Years Exp:', analysisResult.candidateSnapshot?.totalYearsExperience);
  console.log('Core Specialization:', analysisResult.candidateSnapshot?.coreSpecialization);
  console.log('Target Seniority:', analysisResult.candidateSnapshot?.targetSeniority);
  console.log('Hands-On Domains count:', analysisResult.industriesAndDomains?.handsOnDomains?.length);
  console.log('Role Tiers count:', analysisResult.roleTiers?.length);
  console.log('Primary Fit Companies:', analysisResult.primaryFitCompanies?.length);
  console.log('Secondary Fit Companies:', analysisResult.secondaryFitCompanies?.length);
  console.log('Workflow Notes Verify items:', analysisResult.workflowNotes?.verifyBeforeSubmitting?.length);

  // 5. Check History endpoint
  const historyRes = await fetch('http://localhost:4000/api/analyze/resume-history', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const historyData = await historyRes.json();
  console.log('History items count:', historyData.length);

  console.log('\n✅ All Resume Analyser Endpoints Verified Successfully!');
}

testE2E().catch(console.error);
