/* Checks for the auto-fill helpers (run: npm run test:autofill-helpers). */
import { cityStateFromResume } from '../services/resumeLocation.js';
import { parseModelList, salvageObjects } from '../services/aiJson.js';

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, pass, detail: pass ? undefined : `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}` });
}

// --- Location from the top of the resume ---
check('Contact line "Charlotte, NC | phone | email"', cityStateFromResume('Vikram Sharma\nCharlotte, NC | (704) 555-0142 | vikram@example.com\nSUMMARY\nJava developer'), { city: 'Charlotte', state: 'NC' });
check('Full state name and ZIP', cityStateFromResume('ASHA RAO\nJersey City, New Jersey 07302 · asha@example.com'), { city: 'Jersey City', state: 'NJ' });
check('"St. Louis, MO"', cityStateFromResume('Name\nSt. Louis, MO\n'), { city: 'St. Louis', state: 'MO' });
check('Dated job line is not the candidate\'s location', cityStateFromResume('Name\nSenior Java Developer, Acme Corp, Dallas, TX  2019 - Present'), null);
check('Location further down (an employer) is ignored', cityStateFromResume('Name\nemail@example.com\nSUMMARY\nLine\nLine\nLine\nLine\nLine\nWells Fargo, Charlotte, NC'), null);
check('No location at all', cityStateFromResume('Name\nemail@example.com\nJava, Spring Boot'), null);
check('"Professional Summary, ..." is not a city', cityStateFromResume('Professional Summary, CA'), null);

// --- Reading the AI's JSON ---
const good = '{"resolvedFields":[{"fieldId":"a","value":"Yes"},{"fieldId":"b","value":"No"}]}';
check('Clean JSON', parseModelList(good, 'resolvedFields')?.items.length, 2);
check('JSON in ``` fences', parseModelList('```json\n' + good + '\n```', 'resolvedFields')?.items.length, 2);
check('JSON with a sentence before it', parseModelList('Here are the answers:\n' + good, 'resolvedFields')?.items.length, 2);
check('Trailing comma', parseModelList('{"resolvedFields":[{"fieldId":"a","value":"Yes"},]}', 'resolvedFields')?.items.length, 1);
check('Top-level array', parseModelList('[{"fieldId":"a","value":"Yes"}]', 'resolvedFields')?.items.length, 1);
const cut = '{"resolvedFields":[{"fieldId":"a","value":"Charlotte, NC"},{"fieldId":"b","value":"I have 9 years of Ja';
check('Cut-off reply: the complete answers are kept', parseModelList(cut, 'resolvedFields'), { items: [{ fieldId: 'a', value: 'Charlotte, NC' }], complete: false });
check('Braces inside strings do not confuse the reader', salvageObjects('{"resolvedFields":[{"fieldId":"a","value":"use {curly} and \\"quotes\\""}', 'resolvedFields'), [{ fieldId: 'a', value: 'use {curly} and "quotes"' }]);
check('Empty reply -> nothing', parseModelList('', 'resolvedFields'), null);
check('Garbage -> nothing', parseModelList('Sorry, I cannot help with that.', 'resolvedFields'), null);

let failed = 0;
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `\n        ${r.detail}`}`);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
