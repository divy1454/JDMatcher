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
check('matching', '"Charlotte, North Carolina" picks "Charlotte, NC, USA" (location suggestions)', m(['Charlotte, NC, USA', 'Charlotte, MI, USA', 'Charlotte Hall, MD, USA'], 'Charlotte, North Carolina'), 'Charlotte, NC, USA');
check('matching', '"Austin, Texas" never picks "Austin, MN, USA"', m(['Austin, MN, USA', 'Austin, TX, USA'], 'Austin, Texas'), 'Austin, TX, USA');
check('matching', '"Not Hispanic or Latino" is not "Hispanic or Latino"', m(['Hispanic or Latino', 'Not Hispanic or Latino'], 'Not Hispanic or Latino'), 'Not Hispanic or Latino');
check('matching', '"Asian" = "Asian (Not Hispanic or Latino)"', m(['Hispanic or Latino', 'White (Not Hispanic or Latino)', 'Asian (Not Hispanic or Latino)', 'Decline to self-identify'], 'Asian'), 'Asian (Not Hispanic or Latino)');
check('matching', 'Highest travel option', unit.highestOptionIndex(['--', '0%', 'Up to 25%', '50-75%', '75%+', "I'd rather not say"]), 4);
check('matching', 'Country code: +1 among +44/+1/+91', m(['+44', '+1', '+91'], 'United States (+1)'), '+1');
check('matching', 'Country code with flags: the US, not Canada', m(['🇬🇧 +44', '🇨🇦 +1', '🇺🇸 +1', '🇮🇳 +91'], 'United States (+1)'), '🇺🇸 +1');
check('matching', 'Country code with names: "United States (+1)", not "Canada (+1)"', m(['United Kingdom (+44)', 'Canada (+1)', 'United States (+1)'], 'United States (+1)'), 'United States (+1)');
check('matching', '"+1 268" (Antigua) is not +1', m(['Antigua and Barbuda (+1 268)', 'US (+1)'], 'United States (+1)'), 'US (+1)');
check('matching', 'Two identical "+1" entries are not a real choice', unit.matchOption(['+44', '+1', '+1'], 'United States (+1)')?.ambiguous, false);
check('matching', 'Dial code read from "🇬🇧 +44"', unit.dialCodeOf('🇬🇧 +44'), '44');

// ---------------------------------------------------------------------------
// Which sites fill on page load
// ---------------------------------------------------------------------------
const loc = (u) => {
  const x = new URL(u);
  return { hostname: x.hostname, pathname: x.pathname, href: x.href };
};
check('sites', 'JobDiva candidate portal is a known ATS', unit.knownAtsSite(loc('https://www1.jobdiva.com/portal/?a=abc123#/signup?jobid=33552111')), 'jobdiva');
check('sites', "JobDiva's recruiter pages are not", unit.knownAtsSite(loc('https://www1.jobdiva.com/employers/myjobs/search.jsp')), null);
check('sites', 'ADP Workforce Now careers page is a known ATS', unit.knownAtsSite(loc('https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=4c9a1f1d&jobId=9201686904331_11')), 'adp');
check('sites', 'ADP payroll pages never fill on load', unit.isRecognizedJobPage(loc('https://workforcenow.adp.com/theme/index.html')), false);
check('sites', 'Rippling application is a known ATS', unit.knownAtsSite(loc('https://ats.rippling.com/en-GB/acme/jobs/fd8d9c2e/apply?step=application')), 'rippling');
check('sites', 'LinkedIn job pages fill on load', unit.isRecognizedJobPage(loc('https://www.linkedin.com/jobs/view/3901234567/')), true);
check('sites', 'LinkedIn profile editing never fills on load', unit.isRecognizedJobPage(loc('https://www.linkedin.com/in/someone/edit/intro/')), false);
check('sites', 'Indeed employer dashboard never fills on load', unit.isRecognizedJobPage(loc('https://employers.indeed.com/jobs')), false);
check('sites', 'BambooHR careers page is a known ATS', unit.knownAtsSite(loc('https://acme.bamboohr.com/careers/123')), 'bamboohr');
check('sites', 'BambooHR employee pages never fill on load', unit.isRecognizedJobPage(loc('https://acme.bamboohr.com/employees/employee.php?id=4')), false);
check('sites', 'A company careers page still fills on load', unit.isRecognizedJobPage(loc('https://careers.example-co.com/apply/devops-123')), true);

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
    if (route.request().url() === url.split('#')[0]) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
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
  check(group, 'How did you hear = LinkedIn (standing answer)', await single('q_source'), 'LinkedIn');
  check(group, 'Kubernetes years answered by the AI', await val(page, '#k8s'), '3');
  check(group, 'Gender = decline', await single('q_gender'), 'Decline To Self Identify');
  check(group, 'Submit not clicked by the engine', await page.evaluate(() => window.__submitClicked || 0), 0);

  // The recruiter submits: the answers get saved for next time
  await page.click('#submit');
  await page.waitForTimeout(300);
  const { confirms } = await jdm(page);
  const learned = (confirms[0]?.answers || []).map((a) => `${a.question} => ${a.answer}`).join(' | ');
  check(group, 'Submitted AI answer is saved for next time', learned, 'How many years of experience do you have with Kubernetes? => 3', 'contains');
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


// --- G. Rippling-style form: unlabelled "Select" dropdowns, location type-ahead, optional self-ID ---
async function ripplingCase(group, profile, expect) {
  const { context, page, errors } = await openCase(
    'https://ats.rippling.com/en-GB/acme/jobs/46f46d24-e55f-4011-b531-89cd4f9add2f/apply?jr_id=6aa1c92fdbc0e60e37e13a71',
    'rippling.html',
    '',
    profile
  );
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Ready', 60000);
  check(group, 'Reaches "ready to submit"', title, 'Ready', 'startsWith');
  const flags = (await panelItems(page)).filter((t) => !/^Answered by AI/.test(t));
  check(group, 'Nothing flagged for the recruiter', flags, []);
  check(group, 'First name', await val(page, '#first'), 'Ravi');
  check(group, 'Phone', await val(page, '#phone'), '+1 512-555-0100');
  check(group, 'Location type-ahead picks "Austin, TX, USA"', await val(page, '#loc'), 'Austin, TX, USA');
  const a = await page.evaluate(() => window.__answers);
  check(group, 'Work authorization (question is a <p>, dropdown says "Select") = Yes', a.q_auth, 'Yes');
  check(group, 'How did you hear = LinkedIn (standing answer)', a.q_source, 'LinkedIn');
  check(group, 'Pronouns: no "prefer not to say" option, optional -> left blank', a.q_pronouns, undefined);
  check(group, 'Hispanic/Latino', a.q_hisp, expect.hispanic);
  check(group, 'Race', a.q_race, expect.race);
  const { aiCalls } = await jdm(page);
  check(group, 'No question sent to the AI as "Select"', aiCalls.flatMap((c) => c.unresolvedFields).filter((f) => /^select$/i.test(f.question || f.label)).length, 0);
  check(group, 'Submit never clicked', await page.evaluate(() => window.__submitClicked || 0), 0);
  if (expect.screenshot) await page.screenshot({ path: path.join(tmp, 'screens', 'rippling.png'), fullPage: true });
  check(group, 'No page errors', errors, []);
  await context.close();
}
{
  const asian = JSON.parse(JSON.stringify(PROFILE));
  asian.equalOpportunity = { eeoRace: 'Asian', eeoGender: 'Male' };
  await ripplingCase('rippling (candidate chose "Asian")', asian, { hispanic: 'No', race: 'Asian', screenshot: true });
  await ripplingCase('rippling (candidate declines)', PROFILE, { hispanic: "I don't wish to answer", race: "I don't wish to answer" });
}


// --- H. Classic Greenhouse embed (Suvoda report): standing answers, Hispanic/Latino, race shown afterwards ---
{
  const group = 'greenhouse classic (Suvoda-style)';
  const asian = JSON.parse(JSON.stringify(PROFILE));
  asian.equalOpportunity = { eeoRace: 'Asian', eeoGender: 'Male', eeoVeteran: 'I am not a protected veteran' };
  const { context, page, errors } = await openCase('https://boards.greenhouse.io/embed/job_app?for=suvoda&token=8919913002', 'greenhouse-classic.html', '', asian);
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Ready', 60000);
  check(group, 'Reaches "ready to submit"', title, 'Ready', 'startsWith');
  check(group, 'How did you hear about Suvoda? = LinkedIn', await selectedText(page, '#q_source'), 'LinkedIn');
  check(group, 'Related to anyone who works there? = No', await val(page, '#q_related'), 'No');
  check(group, 'Willing/able to travel = Yes', await selectedText(page, '#q_travel'), 'Yes');
  check(group, 'Travel percentage = the highest option', await selectedText(page, '#q_travel_pct'), '100%');
  check(group, 'Gender = Male', await selectedText(page, '#job_application_gender'), 'Male');
  check(group, 'Hispanic/Latino = No (race is Asian)', await selectedText(page, '#job_application_hispanic_ethnicity'), 'No');
  check(group, 'Race question that appears afterwards = Asian', await selectedText(page, '#job_application_race'), 'Asian');
  check(group, 'Veteran', await selectedText(page, '#job_application_veteran_status'), 'I am not a protected veteran');
  check(group, 'Disability = decline', await selectedText(page, '#job_application_disability_status'), "I don't wish to answer");
  check(group, 'Nothing flagged', (await panelItems(page)).filter((t) => !/^Answered by AI/.test(t)), []);
  const { aiCalls } = await jdm(page);
  check(group, 'None of these went to the AI', aiCalls.flatMap((c) => c.unresolvedFields).map((f) => f.question), []);
  check(group, 'Submit never clicked', await page.evaluate(() => window.__submitClicked || 0), 0);
  await page.screenshot({ path: path.join(tmp, 'screens', 'greenhouse-classic.png'), fullPage: true });
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- I. Ashby: the EEO survey is checkbox groups ---
async function ashbyCase(group, profile, expect) {
  const { context, page, errors } = await openCase('https://jobs.ashbyhq.com/siftwell-analytics/0bb67374-a9f1-4748-b7f2-14ebfc846f8b/application', 'ashby.html', '', profile);
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Ready', 60000);
  check(group, 'Reaches "ready to submit"', title, 'Ready', 'startsWith');
  const ticked = (name) => page.evaluate((n) => Array.from(document.querySelectorAll(`input[name="${n}"]:checked`)).map((c) => document.querySelector(`label[for="${c.id}"]`).textContent), name);
  check(group, 'Gender box', await ticked('eeoc_gender'), expect.gender);
  check(group, 'Race box', await ticked('eeoc_race'), expect.race);
  check(group, 'Veteran box', await ticked('eeoc_veteran'), expect.veteran);
  check(group, 'Disability box', await ticked('eeoc_disability'), expect.disability);
  check(group, 'Nothing flagged', (await panelItems(page)).filter((t) => !/^Answered by AI/.test(t)), []);
  if (expect.rerender) {
    // The site redraws the gender question empty. The engine ticked those boxes itself (a script click makes
    // the browser report a "trusted" change), which must not count as the recruiter's own answer.
    await page.evaluate(() => {
      const fs = document.querySelector('input[name="eeoc_gender"]').closest('fieldset');
      fs.innerHTML = fs.innerHTML.replace(/ checked=""/g, '');
      fs.querySelectorAll('input').forEach((i) => (i.checked = false));
    });
    await page.waitForTimeout(3000);
    check(group, 'Question redrawn empty by the site is filled again', await ticked('eeoc_gender'), expect.gender);
  }
  check(group, 'Submit never clicked', await page.evaluate(() => window.__submitClicked || 0), 0);
  if (expect.screenshot) await page.screenshot({ path: path.join(tmp, 'screens', 'ashby.png'), fullPage: true });
  check(group, 'No page errors', errors, []);
  await context.close();
}
{
  const chose = JSON.parse(JSON.stringify(PROFILE));
  chose.equalOpportunity = { eeoRace: 'Asian', eeoGender: 'Male', eeoVeteran: 'I am not a protected veteran', eeoDisability: 'Decline to self-identify' };
  await ashbyCase('ashby EEO checkboxes (candidate answered)', chose, {
    gender: ['Male'],
    race: ['Asian (Not Hispanic or Latino)'],
    veteran: ['I am not a veteran'],
    disability: ['I do not want to answer'],
    screenshot: true,
    rerender: true,
  });
  await ashbyCase('ashby EEO checkboxes (candidate declines)', PROFILE, {
    gender: ['Decline to self-identify'],
    race: ['Decline to self-identify'],
    veteran: ['Decline to self-identify'],
    disability: ['I do not want to answer'],
  });
}

// --- J. JobDiva portal: fills on load, and the two-question second page is filled too ---
{
  const group = 'jobdiva portal (two-question page)';
  const { context, page, errors } = await openCase(
    'https://www1.jobdiva.com/portal/?a=ujjdnwla3quedl1culy4s1lbkd30se0468typf7ri5xf15b01ima19bd2w54rhbk#/signup?jobid=33552111',
    'jobdiva.html'
  );
  await page.waitForTimeout(2500);
  check(group, 'Fills on page load without pressing Fill Form', await val(page, '#fn'), 'Ravi');
  await fillForm(page);
  const title = await waitForPanel(page, 'Ready', 60000);
  check(group, 'Reaches "ready to submit"', title, 'Ready', 'startsWith');
  const c = await page.evaluate(() => window.__contact || {});
  check(group, 'Page 1: email', c.em, 'ravi.kumar@example.com');
  check(group, 'Page 1: resume attached', c.cv, 1);
  check(group, 'Page 1: SMS opt-in left unticked', c.sms, false);
  check(group, 'Page 1: data-storage consent ticked', c.consent, true);
  check(group, 'Page 2: immigration status (only two questions on the page)', await val(page, '#q1'), 'H-1B');
  check(group, 'Page 2: optional "anything else" left blank', await val(page, '#q2'), '');
  check(group, 'Submit never clicked', await page.evaluate(() => window.__submitClicked || 0), 0);
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- K. Two-question page on a site the engine doesn't know: nothing on load, Fill Form fills it ---
{
  const group = 'two-question page on an unknown site';
  const { context, page, errors } = await openCase('https://portal.staffing-example.com/candidate/?a=abc#/questions?jobid=77', 'jobdiva.html');
  await page.waitForTimeout(2500);
  check(group, 'Not filled on page load (unknown site)', await val(page, '#q1'), '');
  await fillForm(page);
  const title = await waitForPanel(page, 'Ready', 30000);
  check(group, 'Fill Form fills it instead of "No Application Form Found"', title, 'Ready', 'startsWith');
  check(group, 'Immigration status', await val(page, '#q1'), 'H-1B');
  check(group, 'Submit never clicked', await page.evaluate(() => window.__submitClicked || 0), 0);
  check(group, 'No page errors', errors, []);
  await context.close();
}

// --- L. Rippling phone on an en-GB page; the recruiter's own changes are left alone ---
{
  const group = 'rippling phone (en-GB page, +1 in settings) and hand edits';
  const { context, page, errors } = await openCase(
    'https://ats.rippling.com/en-GB/beazleysecurity/jobs/fd8d9c2e-efff-428f-abdd-7bf2e7adbed1/apply?jr_id=6acea32abb78de94580d76a8&jobBoardSlug=beazleysecurity&jobId=fd8d9c2e-efff-428f-abdd-7bf2e7adbed1&step=application',
    'rippling-phone.html'
  );
  await page.waitForTimeout(1500);
  await fillForm(page);
  const title = await waitForPanel(page, 'Ready', 60000);
  check(group, 'Reaches "ready to submit"', title, 'Ready', 'startsWith');
  const ccText = () => page.evaluate(() => document.getElementById('cc').textContent);
  check(group, 'Country code the site pre-set (+44) is changed to +1', await ccText(), '🇺🇸 +1');
  check(group, 'Number filled in the redrawn box, without the country code', await val(page, '#phone'), '5125550100');

  // The recruiter picks India by hand; the site redraws the number box empty
  await page.click('#cc');
  await page.click('[data-list] li:has-text("+91")');
  await page.waitForTimeout(3500);
  check(group, "Recruiter's country code is kept (+91)", await ccText(), '🇮🇳 +91');
  check(group, 'Number box is not refilled after the recruiter changed the phone', await val(page, '#phone'), '');
  await page.click('#phone');
  await page.keyboard.type('98765 43210', { delay: 30 });
  await page.waitForTimeout(3000);
  check(group, "Recruiter's number is kept", await val(page, '#phone'), '98765 43210');

  // While the recruiter edits LinkedIn, a new question appears: filled once they pause, cursor stays put
  await page.click('#li', { clickCount: 3 });
  await page.keyboard.type('https://www.linkedin.com/in/ravi-k', { delay: 20 });
  await page.evaluate(() => {
    document.getElementById('extra').innerHTML = '<div class="field"><label for="org">Current company</label><input id="org"></div>';
  });
  await page.keyboard.type('umar', { delay: 150 });
  await page.waitForTimeout(3500);
  check(group, 'New question filled after the recruiter paused', await val(page, '#org'), 'Acme Corp');
  check(group, "Recruiter's LinkedIn edit is kept", await val(page, '#li'), 'https://www.linkedin.com/in/ravi-kumar');
  check(group, 'Cursor is still in the box the recruiter was typing in', await page.evaluate(() => document.activeElement?.id), 'li');
  check(group, 'Submit never clicked', await page.evaluate(() => window.__submitClicked || 0), 0);
  await page.screenshot({ path: path.join(tmp, 'screens', 'rippling-phone.png'), fullPage: true });
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
