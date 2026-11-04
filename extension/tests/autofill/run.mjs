#!/usr/bin/env node
/**
 * Auto-fill regression tests.
 *
 * Builds the real content script, opens look-alike application forms in Chromium under realistic URLs
 * (Workday, Greenhouse, Lever, LinkedIn, a generic careers site, a shadow-DOM form), runs the engine
 * the way the "Fill Form" button does, and checks every answer that ends up on the page.
 *
 *   npm run test:autofill          (first run only: npx playwright install chromium)
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(here, '../..');
const tmp = path.join(here, '.tmp');
fs.mkdirSync(path.join(tmp, 'screens'), { recursive: true });

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
await build({
  entryPoints: [path.join(extRoot, 'src/content-autofill/index.ts')],
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  outfile: path.join(tmp, 'content-autofill.js'),
  loader: { '.css': 'empty' },
  logLevel: 'warning',
});
await build({
  entryPoints: [path.join(here, 'harness/unit-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: path.join(tmp, 'unit.mjs'),
  logLevel: 'warning',
});
const engineJs = fs.readFileSync(path.join(tmp, 'content-autofill.js'), 'utf8');
const engineCss = fs.readFileSync(path.join(extRoot, 'src/content-autofill/content-autofill.css'), 'utf8');
const mockJs = fs.readFileSync(path.join(here, 'harness/mock-chrome.js'), 'utf8');
const unit = await import(pathToFileURL(path.join(tmp, 'unit.mjs')).href);

// ---------------------------------------------------------------------------
// Test candidate: H-1B DevOps engineer in Austin, TX
// ---------------------------------------------------------------------------
const PROFILE = {
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Ravi Kumar',
  primaryTitle: 'DevOps Engineer',
  totalYearsExperience: 9,
  personal: {
    firstName: 'Ravi',
    lastName: 'Kumar',
    fullName: 'Ravi Kumar',
    email: 'ravi.kumar@example.com',
    phone: '+1 512-555-0100',
    phoneCountryCode: '+1',
    address: '100 Congress Ave',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    country: 'United States',
    citizenshipStatus: 'H-1B',
  },
  education: [{ degreeLevel: "Master's Degree", major: 'Computer Science', schoolName: 'University of Texas at Dallas', graduationYear: '2015' }],
  workHistory: [{ companyName: 'Acme Corp', jobTitle: 'Senior DevOps Engineer', isCurrentRole: true, totalYearsExperience: 9 }],
  social: { linkedinUrl: 'https://www.linkedin.com/in/ravikumar', githubUrl: 'https://github.com/ravikumar' },
  equalOpportunity: {},
  screening: {
    authorizedToWorkInUS: true,
    requireSponsorship: true,
    currentSponsorshipType: 'H-1B',
    willingToRelocate: true,
    noticePeriodWeeks: '2',
    securityClearanceLevel: 'None',
    assumed: [],
  },
  applicationQuestions: { customAnswers: { 'How did you hear about us': 'LinkedIn' } },
  savedResponses: [{ questionPattern: 'Notice period', answer: '2 weeks', matchType: 'semantic' }],
  resumeFileBase64: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n% test resume\n').toString('base64'),
  resumeFileName: 'Ravi_Kumar_Resume.pdf',
  resumeMimeType: 'application/pdf',
};

// ---------------------------------------------------------------------------
// Tiny assertion helpers
// ---------------------------------------------------------------------------
const results = [];
function check(group, label, actual, expected, mode = 'eq') {
  let pass;
  if (mode === 'eq') pass = JSON.stringify(actual) === JSON.stringify(expected);
  else if (mode === 'contains') pass = String(actual ?? '').includes(expected);
  else if (mode === 'startsWith') pass = String(actual ?? '').startsWith(expected);
  else if (mode === 'nonempty') pass = Boolean(actual && String(actual).trim());
  else if (mode === 'falsy') pass = !actual;
  else pass = Boolean(mode(actual));
  results.push({ group, label, actual, expected: mode === 'eq' || mode === 'contains' || mode === 'startsWith' ? expected : mode.toString(), pass });
}

// ---------------------------------------------------------------------------
// Unit checks on answer matching
// ---------------------------------------------------------------------------
const m = (opts, target) => unit.matchOption(opts, target)?.option ?? null;
check('matching', '"Yes" skips a "--" placeholder', m(['--', 'Yes', 'No'], 'Yes'), 'Yes');
check('matching', '"No" does not match "Notice"/"None"', m(['Notice', 'None', 'No'], 'No'), 'No');
check('matching', '"No" with no real No option', m(['None', 'Not applicable'], 'No'), null);
check('matching', 'Decline maps to "I don\'t wish to answer"', m(['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', "I don't wish to answer"], 'Decline to self-identify'), "I don't wish to answer");
check('matching', 'Decline with no decline option', m(['Male', 'Female'], 'Decline to self-identify'), null);
check('matching', '"not a veteran" never picks "a protected veteran"', m(['I am a protected veteran', 'I am not a protected veteran'], 'I am not a protected veteran'), 'I am not a protected veteran');
check('matching', 'United States = United States of America', m(['Canada', 'United States Minor Outlying Islands', 'United States of America'], 'United States'), 'United States of America');
check('matching', 'TX = Texas', m(['Alabama', 'Texas', 'Utah'], 'TX'), 'Texas');
check('matching', '9 years fits "6-10 years"', m(['0-2 years', '3-5 years', '6-10 years', '10+ years'], '9'), '6-10 years');
check('matching', 'H-1B = "H1-B Visa"', m(['US Citizen', 'Green Card', 'H1-B Visa'], 'H-1B'), 'H1-B Visa');
check('matching', 'Two "Yes - ..." options are ambiguous', unit.matchOption(['Yes - I am a US citizen', 'Yes - I have a green card', 'No - I need sponsorship'], 'Yes')?.ambiguous, true);
check('matching', 'Saved "Notice period" does not match a bare "No"', unit.questionSimilarity('Notice period', 'No') < 0.72, true);
check('matching', 'Saved "How did you hear about us" matches "...about this job?"', unit.questionSimilarity('How did you hear about us', 'How did you hear about this job?') >= 0.72, true);
check('matching', 'Saved "Salary" does not match a long hourly-rate question', unit.questionSimilarity('Salary', 'What are your salary expectations for this contract role, hourly?') < 0.72, true);

// ---------------------------------------------------------------------------
// Browser cases
// ---------------------------------------------------------------------------
const browser = await chromium.launch();

async function openCase(url, fixture, extraScript = '', profile = PROFILE) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  const html = fs
    .readFileSync(path.join(here, 'fixtures', fixture), 'utf8')
    .replace(
      '</body>',
      `<style>${engineCss}</style><script>window.__JDM_TEST_PROFILE__=${JSON.stringify(profile)};${extraScript}</script>` +
        `<script>${mockJs}</script><script src="/__jdm/engine.js"></script></body>`
    );
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/__jdm/engine.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: engineJs });
    if (route.request().url() === url) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    return route.abort();
  });
  await page.goto(url);
  return { context, page, errors };
}

const fillForm = (page) => page.evaluate(() => window.__jdmDispatch({ type: 'EXECUTE_AUTOFILL' }));
const panelTitle = (page) =>
  page.evaluate(() => document.getElementById('jdm-review-panel')?.shadowRoot?.querySelector('.title')?.textContent || '');
const panelItems = (page) =>
  page.evaluate(() =>
    Array.from(document.getElementById('jdm-review-panel')?.shadowRoot?.querySelectorAll('li') || []).map((li) => li.textContent)
  );
async function waitForPanel(page, startsWith, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const t = await panelTitle(page);
    if (t.startsWith(startsWith)) return t;
    await page.waitForTimeout(250);
  }
  return panelTitle(page);
}
const val = (page, selector) => page.evaluate((s) => document.querySelector(s)?.value ?? null, selector);
const selectedText = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? el.options[el.selectedIndex]?.text ?? null : null;
  }, selector);
const checkedLabel = (page, name) =>
  page.evaluate((n) => {
    const r = document.querySelector(`input[name="${n}"]:checked`);
    if (!r) return '(none)';
    const lbl = (r.id && document.querySelector(`label[for="${r.id}"]`)) || r.closest('label');
    return lbl ? lbl.textContent.trim() : r.value;
  }, name);
const isChecked = (page, selector) => page.evaluate((s) => Boolean(document.querySelector(s)?.checked), selector);
const jdm = (page) => page.evaluate(() => ({ aiCalls: window.__jdm.aiCalls, confirms: window.__jdm.confirms }));

// --- A. Generic careers site (the form from the original bug report, extended) ---
{
  const group = 'generic site';
  const { context, page, errors } = await openCase('https://careers.example-co.com/apply/devops-123', 'generic.html');
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Paused');
  check(group, 'Run pauses because the hourly rate needs the recruiter', title, 'Paused', 'startsWith');
  check(group, 'Paused list names the hourly rate', (await panelItems(page)).join(' | '), 'Desired hourly rate', 'contains');
  check(group, 'First name', await val(page, '#first_name'), 'Ravi');
  check(group, 'Email', await val(page, '#email'), 'ravi.kumar@example.com');
  check(group, 'State dropdown (profile has "TX")', await selectedText(page, '#state'), 'Texas');
  check(group, 'Country dropdown', await selectedText(page, '#country'), 'United States of America');
  check(group, 'Sponsorship (H-1B) = Yes', await checkedLabel(page, 'require_sponsorship'), 'Yes');
  check(group, 'Authorized to work = Yes', await checkedLabel(page, 'answers[2][boolean_value]'), 'Yes');
  check(group, '"Work without sponsorship?" = No (page default "Yes" replaced)', await checkedLabel(page, 'q_nosponsor'), 'No');
  check(group, 'Relocate dropdown with "--" placeholder', await selectedText(page, '#relocate'), 'Yes');
  check(group, 'Kubernetes years from the resume, not total years', await val(page, 'input[name="k8s_years"]'), '3');
  check(group, 'Why-this-role answer written', await val(page, '#why'), 'Kubernetes', 'contains');
  check(group, 'Hourly rate left for the recruiter', await selectedText(page, '#rate'), 'Select');
  check(group, 'Gender = decline', await selectedText(page, '#gender'), 'Decline to self-identify');
  check(group, 'Veteran = decline (not "not a veteran")', await selectedText(page, '#veteran'), "I don't wish to answer");
  check(group, 'Disability = decline', await checkedLabel(page, 'disability'), 'I do not want to answer');
  check(group, 'Privacy consent ticked', await isChecked(page, '#consent'), true);
  check(group, 'Job-alert opt-in left unticked', await isChecked(page, '#marketing'), false);
  check(group, 'Unlabeled box left blank', await val(page, '.mystery'), '');
  check(group, 'Hidden honeypot left blank', await val(page, '#honeypot'), '');

  const { aiCalls } = await jdm(page);
  const aiFields = aiCalls.flatMap((c) => c.unresolvedFields);
  check(group, 'AI gets the job description', aiCalls.every((c) => (c.jobDescription || '').includes('Kubernetes')), true);
  check(group, 'AI sees the real question text', aiFields.some((f) => f.question === 'How many years of experience do you have with Kubernetes?'), true);
  check(group, 'No "Yes"/"No" option label is sent as a question', aiFields.some((f) => /^(yes|no)$/i.test(f.question || f.label)), false);
  check(group, 'Sponsorship/authorization never sent to AI', aiFields.some((f) => /sponsor|authori[sz]ed/i.test(f.question)), false);

  // The recruiter picks the rate and presses Continue on the panel
  await page.selectOption('#rate', { label: '$50-$60' });
  await page.locator('#jdm-review-panel button.primary').click();
  check(group, 'After Continue: ready for the recruiter to submit', await waitForPanel(page, 'Ready'), 'Ready', 'startsWith');
  const readyList = (await panelItems(page)).join(' | ');
  check(group, 'Fixed rate is no longer listed as a problem', readyList.includes('Rate is not in the profile'), false);
  check(group, 'Final list shows the AI answers for a last glance', readyList, 'Answered by AI: 3', 'contains');
  check(group, 'Submit was never clicked by the engine', await page.evaluate(() => window.__submitClicked || 0), 0);
  await page.screenshot({ path: path.join(tmp, 'screens', 'generic.png'), fullPage: true });
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- B. Greenhouse-style form (React-Select comboboxes, typeahead location, resume upload) ---
{
  const group = 'greenhouse';
  const { context, page, errors } = await openCase('https://boards.greenhouse.io/acme/jobs/4012345', 'greenhouse.html');
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Ready');
  check(group, 'Reaches "ready to submit" with nothing to review', title, 'Ready', 'startsWith');
  check(group, 'Last name', await val(page, '#last_name'), 'Kumar');
  check(group, 'Location typeahead picks Austin, Texas', await val(page, '#loc'), 'Austin, Texas, United States');
  check(group, 'Resume attached', await page.evaluate(() => document.getElementById('resume').files[0]?.name), 'Ravi_Kumar_Resume.pdf');
  check(group, 'LinkedIn', await val(page, '#linkedin'), 'https://www.linkedin.com/in/ravikumar');
  const single = (id) => page.evaluate((i) => document.querySelector(`#${i}`).closest('.select__container').querySelector('.select__single-value')?.textContent || '', id);
  check(group, 'Authorized (React-Select) = Yes', await single('q_auth'), 'Yes');
  check(group, 'Sponsorship (React-Select) = Yes', await single('q_sponsor'), 'Yes');
  check(group, 'How did you hear = saved answer "LinkedIn"', await single('q_source'), 'LinkedIn');
  check(group, 'Gender = decline', await single('q_gender'), 'Decline To Self Identify');
  check(group, 'Submit not clicked by the engine', await page.evaluate(() => window.__submitClicked || 0), 0);

  // The recruiter submits: the answers get saved for next time
  await page.click('#submit');
  await page.waitForTimeout(300);
  const { confirms } = await jdm(page);
  const learned = (confirms[0]?.answers || []).map((a) => `${a.question} => ${a.answer}`).join(' | ');
  check(group, 'Submitted screening answer is saved for next time', learned, 'How did you hear about this job? => LinkedIn', 'contains');
  await page.screenshot({ path: path.join(tmp, 'screens', 'greenhouse.png'), fullPage: true });
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- C. Workday-style multi-page application (dropdown buttons, same URL on every page) ---
{
  const group = 'workday';
  const evaluationState = {
    status: 'success',
    scrapedJdText:
      'Globex is hiring a DevOps Engineer in Austin. You will manage AWS infrastructure with Terraform, run Kubernetes clusters, and build CI/CD pipelines. 3+ years of Terraform required.',
    jobTitle: 'DevOps Engineer',
    companyOrClient: 'Globex',
    selectedCandidateId: PROFILE.id,
    timestamp: Date.now(),
  };
  const { context, page, errors } = await openCase(
    'https://globex.wd5.myworkdayjobs.com/en-US/External/job/Austin-TX/DevOps-Engineer_R123/apply/applyManually',
    'workday.html',
    `window.__JDM_TEST_STORAGE__ = { evaluationState: ${JSON.stringify(evaluationState)} };`
  );
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Ready', 120000);
  check(group, 'Runs through all 4 pages and stops on Review', title, 'Ready', 'startsWith');
  check(group, 'Stopped on the Review page', await page.evaluate(() => window.__wdStep), 4);
  check(group, 'Review panel lists the AI answer from page 3', (await panelItems(page)).join(' | '), 'Answered by AI: 2-4 years', 'contains');
  check(group, 'Submit never clicked', await page.evaluate(() => Boolean(window.__submitted)), false);
  const a = await page.evaluate(() => window.__wdAnswers);
  check(group, 'Phone device type', a['Phone Device Type'], 'Mobile');
  check(group, 'Country (dropdown button)', a['Country'], 'United States of America');
  check(group, 'State (dropdown button, profile "TX")', a['State'], 'Texas');
  check(group, 'Postal code', a['Postal Code'], '78701');
  check(group, 'Resume uploaded', a['Resume/CV'], 'Ravi_Kumar_Resume.pdf');
  check(group, 'Authorized to work = Yes', a['Are you legally authorized to work in the country in which the job is located?'], 'Yes');
  check(group, 'Sponsorship = Yes', a['Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?'], 'Yes');
  check(group, 'Relocate = Yes', a['Are you willing to relocate?'], 'Yes');
  check(group, 'Terraform years from AI', a['How many years of experience do you have with Terraform?'], '2-4 years');
  check(group, 'Previously worked for Globex = No', a['Have you previously worked for Globex?'], 'No');
  check(group, 'Gender = decline', a['Gender'], 'I do not wish to answer');
  check(group, 'Veteran = decline', a['Veteran Status'], 'I do not wish to self-identify');
  check(group, 'Ethnicity = decline', a['Ethnicity'], 'I do not wish to answer');
  check(group, 'Terms consent ticked', a['I have read and consent to the terms and conditions'], 'checked');
  const { aiCalls } = await jdm(page);
  const tfCall = aiCalls.find((c) => c.unresolvedFields.some((f) => /Terraform/.test(f.question)));
  check(group, 'AI got the evaluated JD (Workday pages have none)', tfCall?.jobDescription || '', 'Terraform required', 'contains');
  check(group, 'AI got the company name', tfCall?.companyName || '', 'Globex');
  check(group, 'AI got the dropdown options', tfCall?.unresolvedFields.find((f) => /Terraform/.test(f.question))?.options, ['0-1 years', '2-4 years', '5+ years']);
  await page.screenshot({ path: path.join(tmp, 'screens', 'workday.png'), fullPage: true });
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- C2. Workday run that pauses for missing data; the recruiter fills it and clicks Next themselves ---
{
  const group = 'workday (pause, then recruiter continues)';
  const noPhone = JSON.parse(JSON.stringify(PROFILE));
  noPhone.personal.phone = '';
  const { context, page, errors } = await openCase(
    'https://globex.wd5.myworkdayjobs.com/en-US/External/job/Austin-TX/DevOps-Engineer_R123/apply/applyManually',
    'workday.html',
    '',
    noPhone
  );
  await page.waitForTimeout(1500);
  await fillForm(page);
  const paused = await waitForPanel(page, 'Paused');
  check(group, 'Pauses on page 1 because the phone number is missing', paused, 'Paused', 'startsWith');
  check(group, 'Says which question needs the recruiter', (await panelItems(page)).join(' | '), 'Phone Number', 'contains');
  check(group, 'Still on page 1', await page.evaluate(() => window.__wdStep), 0);
  await page.fill('#phone', '512-555-0199');
  await page.click('#next'); // the recruiter's own click
  const title = await waitForPanel(page, 'Ready', 120000);
  check(group, 'Carries on by itself after the recruiter clicks Next', title, 'Ready', 'startsWith');
  check(group, 'Reached the Review page', await page.evaluate(() => window.__wdStep), 4);
  check(group, "Recruiter's phone number kept", await page.evaluate(() => window.__wdAnswers['Phone Number']), '512-555-0199');
  check(group, 'Submit never clicked', await page.evaluate(() => Boolean(window.__submitted)), false);
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- C3. One-page form whose final button says "Continue": never clicked ---
{
  const group = 'one-page form with a "Continue" button';
  const { context, page, errors } = await openCase('https://careers.oneshot-co.com/apply/55501', 'continue.html');
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Auto-fill stopped', 20000);
  check(group, 'Stops and asks the recruiter to click it', title, 'Auto-fill stopped', 'startsWith');
  check(group, 'Explains why', (await panelItems(page)).join(' | '), 'might submit the application', 'contains');
  check(group, 'Fields filled', await val(page, '#em'), 'ravi.kumar@example.com');
  check(group, '"Continue" never clicked', await page.evaluate(() => window.__continueClicked || 0), 0);
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- D. Lever-style form (hidden custom radios, multi-select checkboxes) ---
{
  const group = 'lever';
  const { context, page, errors } = await openCase('https://jobs.lever.co/acme/1b2c3d4e/apply', 'lever.html');
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Ready');
  check(group, 'Reaches "ready to submit"', title, 'Ready', 'startsWith');
  check(group, 'Full name', await val(page, 'input[name="name"]'), 'Ravi Kumar');
  check(group, 'Current company', await val(page, 'input[name="org"]'), 'Acme Corp');
  check(group, 'Authorized (hidden custom radio) = Yes', await page.evaluate(() => document.querySelector('input[name="cards[a1][field0]"]:checked')?.value || '(none)'), 'Yes');
  check(
    group,
    'Tools used: only what the resume shows',
    await page.evaluate(() => Array.from(document.querySelectorAll('input[name="cards[a1][field1]"]:checked')).map((c) => c.value)),
    ['Kubernetes', 'Terraform', 'Ansible']
  );
  check(group, 'Marketing opt-in left unticked', await isChecked(page, '#updates'), false);
  check(group, 'Optional "Additional information" left blank', await val(page, 'textarea[name="comments"]'), '');
  await page.screenshot({ path: path.join(tmp, 'screens', 'lever.png'), fullPage: true });
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- E. LinkedIn Easy Apply: fill, but never click Next (LinkedIn bans automation) ---
{
  const group = 'linkedin';
  const { context, page, errors } = await openCase('https://www.linkedin.com/jobs/view/3901234567/', 'linkedin.html');
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Filled. Click Next yourself');
  check(group, 'Explains that Next is up to the recruiter', title, 'Filled. Click Next yourself', 'startsWith');
  check(group, 'Phone filled', await val(page, '#ph'), '+1 512-555-0100');
  check(group, 'Next never clicked', await page.evaluate(() => window.__nextClicked || 0), 0);
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- F. Form inside shadow DOM; JDMatcher's own widget left alone ---
{
  const group = 'shadow dom';
  const { context, page, errors } = await openCase('https://careers.shadowcorp.com/apply/cloud-engineer', 'shadow.html');
  await page.waitForTimeout(1500);
  await fillForm(page);
  await waitForPanel(page, 'Ready', 15000);
  const shadowVal = (id) => page.evaluate((i) => document.querySelector('app-form').shadowRoot.getElementById(i).value, id);
  check(group, 'First name inside shadow root', await shadowVal('fn'), 'Ravi');
  check(group, 'Email inside shadow root', await shadowVal('em'), 'ravi.kumar@example.com');
  check(group, 'Phone inside shadow root', await shadowVal('ph'), '+1 512-555-0100');
  const widget = await page.evaluate(() => {
    const r = document.getElementById('jdmatcher-extension-host').shadowRoot;
    return [r.getElementById('jd-input').value, r.getElementById('widget-email').value];
  });
  check(group, "JDMatcher's own widget untouched", widget, ['', '']);
  check(group, 'No page errors', errors, []);
  await context.close();
}

await browser.close();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
let currentGroup = '';
for (const r of results) {
  if (r.group !== currentGroup) {
    currentGroup = r.group;
    console.log(`\n${currentGroup}`);
  }
  const mark = r.pass ? 'PASS' : 'FAIL';
  const detail = r.pass ? '' : `\n      expected: ${JSON.stringify(r.expected)}\n      actual:   ${JSON.stringify(r.actual)}`;
  console.log(`  ${mark}  ${r.label}${detail}`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${path.join(tmp, 'screens')}`);
process.exit(failed ? 1 : 0);
