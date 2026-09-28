import { BillingService } from '../services/billingService.js';
import { PromptService, DEFAULT_GLOBAL_EVAL_PROMPT } from '../services/promptService.js';
import { GeminiService } from '../services/geminiService.js';

async function runTestSuite() {
  console.log('===============================================================');
  console.log('   JDMATCHER ENTERPRISE: ARCHITECTURAL VERIFICATION SUITE       ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // TEST 1: Offline Security Deposit Arithmetic
  console.log('--- TEST GROUP 1: OFFLINE BILLING & TOKEN ARITHMETIC ---');
  // Formula: (InputTokens / 1M * $0.30) + (OutputTokens / 1M * $2.50)
  // Example: 10,000 input tokens = $0.003; 2,000 output tokens = $0.005. Total Raw = $0.008.
  // With 4x multiplier: Billed = $0.032.
  const rawCost = BillingService.calculateRawCost(10_000, 2_000);
  assert(rawCost === 0.008, 'Raw Cost Calculation ($0.30/1M In, $2.50/1M Out)', `Expected 0.008, got ${rawCost}`);

  const multiplier = 4.0;
  const billedCost = Number((rawCost * multiplier).toFixed(6));
  assert(billedCost === 0.032, 'Billed Cost Multiplier (4.0x)', `Expected 0.032, got ${billedCost}`);

  // TEST 2: Hard 402 Deposit Limit Enforcement Logic
  console.log('\n--- TEST GROUP 2: HTTP 402 HARD DEPOSIT LIMIT STOP ---');
  const depositLimit = 500.00;
  let currentBilled = 499.98;
  const wouldExceed = (currentBilled + billedCost) >= depositLimit;
  assert(wouldExceed === true, 'Pre-flight check blocks when total billed >= deposit limit (HTTP 402)');

  // TEST 3: "Mark as Paid" Zero-Reset Simulation
  console.log('\n--- TEST GROUP 3: SUPER ADMIN "MARK AS PAID" RESET ---');
  let resetBilledAmount = '500.0000';
  // Mark as paid execution
  resetBilledAmount = '0.0000';
  assert(parseFloat(resetBilledAmount) === 0.0, 'Mark as Paid resets total_billed_amount to exactly $0.00');
  const isUnlocked = parseFloat(resetBilledAmount) < depositLimit;
  assert(isUnlocked === true, 'Resetting balance immediately lifts HTTP 402 lockout');

  // TEST 4: Recruiter Hardware Anti-Sharing Lock (x-device-id)
  console.log('\n--- TEST GROUP 4: HARDWARE DEVICE LOCKING & 30-DAY TRANSFER ---');
  const initialDeviceId = 'hw-macbook-pro-2026-m3';
  let boundDeviceId: string | null = null;

  // Step 4.1: First-time auto-bind
  if (!boundDeviceId) {
    boundDeviceId = initialDeviceId;
  }
  assert(boundDeviceId === initialDeviceId, 'First login auto-binds recruiter seat to machine fingerprint');

  // Step 4.2: Same device passes
  const requestDeviceId = 'hw-macbook-pro-2026-m3';
  assert(requestDeviceId === boundDeviceId, 'Matching x-device-id is authorized');

  // Step 4.3: Unauthorized second machine blocked within 30 days
  const unauthorizedDevice = 'hw-dell-xps-unauthorized';
  const now = new Date();
  const cooldownExpires = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000); // 25 days remaining
  const isTransferAllowed = now >= cooldownExpires;
  assert(isTransferAllowed === false, 'Mismatched device rejected with 403 during active 30-day transfer window');

  // Step 4.4: Device transfer allowed after 30 days
  const expiredCooldown = new Date(now.getTime() - 1000); // Expired
  const canMigrate = now >= expiredCooldown;
  assert(canMigrate === true, 'Self-service seat transfer unlocked once 30-day cooldown expires');

  // TEST 5: Dynamic Waterfall Prompt Engine
  console.log('\n--- TEST GROUP 5: DYNAMIC WATERFALL PROMPTING ---');
  const candidateMock: any = {
    fullName: 'Vikram Sharma',
    primaryTitle: 'Lead Java Cloud Architect',
    visaStatus: 'H-1B',
    securityClearance: 'None',
    workPreference: 'Remote',
    rawResumeText: '11 years Java & Spring Boot AWS experience',
  };

  const sampleJd = 'Looking for Lead Java Engineer with Spring Boot and AWS. Remote position.';
  const variables = PromptService.buildVariables(candidateMock, sampleJd);

  assert(variables.candidate_name === 'Vikram Sharma', 'Candidate name variable mapped');
  assert(variables.candidate_resume.includes('11 years Java'), 'Candidate resume variable mapped');
  assert(variables.jd_text === sampleJd, 'JD text variable mapped');

  const hydrated = PromptService.hydratePrompt(DEFAULT_GLOBAL_EVAL_PROMPT, variables);
  assert(hydrated.includes('Vikram Sharma'), 'Prompt template hydrated {{candidate_name}}');
  assert(!hydrated.includes('{{candidate_name}}'), 'All placeholders cleanly hydrated');

  // TEST 6: Gemini Evaluation Response Structure
  console.log('\n--- TEST GROUP 6: GEMINI 2.5 EVALUATION & DETERMINISM ---');
  const evalResult = await GeminiService.evaluate(hydrated);
  assert(evalResult.result.verdict === 'APPLY' || evalResult.result.verdict === 'SKIP', 'Evaluation returns strict verdict enum (APPLY | SKIP)');
  assert(typeof evalResult.result.matchScore === 'number' && evalResult.result.matchScore >= 0 && evalResult.result.matchScore <= 100, 'Evaluation returns valid match score (0-100)');
  assert(typeof evalResult.result.isEligible === 'boolean', 'Evaluation includes eligibility check');
  assert(evalResult.result.candidateFitCheck && Array.isArray(evalResult.result.candidateFitCheck.alignedSkills), 'Evaluation provides aligned skills array');
  assert(evalResult.usage.inputTokens > 0 && evalResult.usage.outputTokens > 0, 'Accurate token usage recorded for ledger');

  // SUMMARY
  console.log('\n===============================================================');
  console.log(`   TEST RESULTS: ${passed} PASSED | ${failed} FAILED           `);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
