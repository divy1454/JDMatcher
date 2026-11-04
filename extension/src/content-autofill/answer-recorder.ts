/**
 * Learns from what the recruiter actually submits.
 *
 * Screening answers filled from saved answers or AI are remembered per page (as they look when the
 * page is left, including any edits the recruiter made). When the recruiter clicks the final Submit
 * button themselves, the answers are sent to the backend and saved as confirmed answers for the
 * candidate. AI suggestions are never saved on their own any more.
 */
import { AutoFillExtractedField } from '../content/types';
import { readFieldValue } from './form-detector';
import { normalizeText } from './text-utils';
import { isBlockedSubmitElement } from './dom-injector';

const STORAGE_KEY = 'jdm_answer_log_v1';
const MAX_ANSWERS = 60;

interface LoggedAnswer {
  question: string;
  answer: string;
  fieldType: string;
}

const tracked = new Map<HTMLElement, AutoFillExtractedField>();

/** Answers that only make sense for one job (never reused on the next application). */
const JOB_SPECIFIC_RE = /\b(why|tell us|describe|explain|cover letter|motivat\w*|interest(ed)? in|our (company|team|mission|product))\b/;
const THIS_JOB_RE = /\bthis (role|position|job|company|opportunity|team)\b/;
const SOURCE_QUESTION_RE = /\b(hear|heard|find|found|learn|learned) (out )?about\b|\bsource\b|\breferr/;
const EEO_RE = /\b(gender|sex|race|racial|ethnicity|ethnic|hispanic|latino|veteran|disability|disabled|orientation|pronoun|transgender)\b/;

function isLearnable(field: AutoFillExtractedField, companyName?: string): boolean {
  const q = field.question || '';
  if (!q || q.length > 300) return false;
  if (field.type === 'file' || field.type === 'textarea') return false;
  const n = normalizeText(q);
  if (JOB_SPECIFIC_RE.test(n) || EEO_RE.test(n)) return false;
  if (THIS_JOB_RE.test(n) && !SOURCE_QUESTION_RE.test(n)) return false;
  const company = normalizeText(companyName);
  if (company && company.length > 2 && n.includes(company)) return false;
  return true;
}

function load(): Record<string, LoggedAnswer> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LoggedAnswer>) : {};
  } catch {
    return {};
  }
}

function save(log: Record<string, LoggedAnswer>): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // storage may be blocked; learning is best-effort
  }
}

/** Remember this field so its final answer can be learned. */
export function trackForLearning(field: AutoFillExtractedField, companyName?: string): void {
  if (!field.element || !isLearnable(field, companyName)) return;
  tracked.set(field.element, field);
}

/** Copies the current values of tracked fields into the per-tab log (call before leaving a page). */
export function snapshotTrackedAnswers(): void {
  const log = load();
  for (const [el, field] of tracked) {
    if (!el.isConnected) continue;
    const value = readFieldValue(field).trim();
    if (!value || value.length > 500) continue;
    log[normalizeText(field.question)] = { question: field.question || '', answer: value, fieldType: field.type };
  }
  const keys = Object.keys(log);
  if (keys.length > MAX_ANSWERS) keys.slice(0, keys.length - MAX_ANSWERS).forEach((k) => delete log[k]);
  save(log);
}

function flushAnswers(candidateId: string): void {
  snapshotTrackedAnswers();
  const answers = Object.values(load());
  if (answers.length === 0) return;
  try {
    chrome.runtime.sendMessage({ type: 'AUTOFILL_CONFIRM', payload: { candidateId, answers } });
  } catch {
    // extension reloaded; nothing to do
  }
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  tracked.clear();
}

const NEXT_LIKE_RE = /^(next|continue|save and continue|save continue|proceed)\b/;

/** Watches the recruiter's own clicks: Next saves the page's answers, Submit sends them. */
export function installAnswerRecorder(getCandidateId: () => string | null): void {
  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted) return; // only real clicks by the recruiter
      const target = event.target as HTMLElement | null;
      const btn = target?.closest?.('button, input[type="submit"], input[type="button"], [role="button"], a') as HTMLElement | null;
      if (!btn) return;
      const text = normalizeText(btn.innerText || (btn as HTMLInputElement).value || btn.getAttribute('aria-label') || '');
      if (isBlockedSubmitElement(btn)) {
        const id = getCandidateId();
        if (id) flushAnswers(id);
      } else if (NEXT_LIKE_RE.test(text)) {
        snapshotTrackedAnswers();
      }
    },
    { capture: true }
  );
}
