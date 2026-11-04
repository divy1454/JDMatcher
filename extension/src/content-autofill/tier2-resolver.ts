/**
 * Tier 2: asks the backend AI for questions the profile and saved answers could not cover.
 *
 * - Sends the real question text, the options, and the job description (title, company, JD).
 * - The AI may answer "needs review" instead of guessing; such answers are flagged, not trusted.
 * - Cost guard: at most 2 automatic calls per form page (keyed by the page's questions, not the URL,
 *   so multi-page forms that keep the same URL still get AI help on every page) and 25 per page load.
 *   Calls inside the cool-down wait instead of being dropped.
 */
import {
  AutoFillExtractedField,
  AutoFillResolveFieldPayload,
  AutoFillResolveRequest,
  AutoFillResolveResponse,
  CandidateAutoFillProfile,
} from '../content/types';
import { JobContext } from './job-context';
import { sleep } from './dom-utils';

export interface Tier2Answer {
  fieldId: string;
  elementIndex: number;
  value: string;
  values?: string[];
  confidence: number;
  needsReview: boolean;
  reasoning?: string;
}

export interface Tier2Outcome {
  answers: Tier2Answer[];
  /** Why the AI was not called, when it was not. */
  skippedReason?: string;
}

const MAX_AUTO_CALLS_PER_STEP = 2;
const MAX_AUTO_CALLS_PER_PAGE_LOAD = 25;
const COOLDOWN_MS = 2500;
const MAX_FIELDS_PER_REQUEST = 40;

const callsPerStep = new Map<string, number>();
let callsThisPageLoad = 0;
let lastCallAt = 0;

/** Resets the cost guard (e.g. after the recruiter presses Fill Form). */
export function resetTier2CircuitBreaker(): void {
  callsPerStep.clear();
  callsThisPageLoad = 0;
  lastCallAt = 0;
}

function aiFieldType(field: AutoFillExtractedField): string {
  switch (field.type) {
    case 'radio_group':
      return 'radio';
    case 'checkbox_group':
      return 'checkbox_multi';
    case 'dropdown_button':
      return 'select';
    case 'combobox':
      return field.options && field.options.length ? 'select' : 'text';
    case 'text':
      return field.inputType && field.inputType !== 'text' ? field.inputType : 'text';
    default:
      return field.type;
  }
}

function toPayload(field: AutoFillExtractedField): AutoFillResolveFieldPayload {
  const question = (field.question || field.label || field.name || '').slice(0, 1000);
  return {
    id: field.id.slice(0, 255),
    elementIndex: field.elementIndex,
    name: (field.name || '').slice(0, 255),
    label: question,
    question,
    type: aiFieldType(field),
    options: field.options && field.options.length ? field.options.slice(0, 300).map((o) => o.slice(0, 300)) : undefined,
    placeholder: field.placeholder ? field.placeholder.slice(0, 500) : undefined,
    isRequired: Boolean(field.isRequired),
    currentValue: undefined,
    maxLength: field.maxLength,
  };
}

function normalizeConfidence(c: unknown): number {
  if (typeof c === 'number' && Number.isFinite(c)) return c > 1 ? c / 100 : c;
  const s = String(c || '').toUpperCase();
  if (s === 'HIGH') return 0.9;
  if (s === 'MEDIUM') return 0.7;
  if (s === 'LOW') return 0.4;
  return 0.5;
}

function sendToBackground(request: AutoFillResolveRequest): Promise<{ success: boolean; data?: AutoFillResolveResponse; error?: string }> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'AUTOFILL_RESOLVE', payload: request }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { success: false, error: 'Empty response from background' });
        }
      });
    } catch (err: any) {
      resolve({ success: false, error: err?.message || 'Extension context unavailable' });
    }
  });
}

/** Asks the AI to answer `fields`. Returns one answer per field it answered. */
export async function requestAiAnswers(
  fields: AutoFillExtractedField[],
  profile: CandidateAutoFillProfile,
  job: JobContext | null,
  opts: { isManualTrigger: boolean; stepKey: string }
): Promise<Tier2Outcome> {
  if (fields.length === 0) return { answers: [] };

  if (!opts.isManualTrigger) {
    const used = callsPerStep.get(opts.stepKey) || 0;
    if (used >= MAX_AUTO_CALLS_PER_STEP) return { answers: [], skippedReason: 'AI limit reached for this page' };
    if (callsThisPageLoad >= MAX_AUTO_CALLS_PER_PAGE_LOAD) return { answers: [], skippedReason: 'AI limit reached for this tab' };
  }
  const wait = COOLDOWN_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);

  const answers: Tier2Answer[] = [];
  let firstError: string | undefined;
  for (let i = 0; i < fields.length; i += MAX_FIELDS_PER_REQUEST) {
    const batch = fields.slice(i, i + MAX_FIELDS_PER_REQUEST);
    const request: AutoFillResolveRequest = {
      candidateId: profile.id,
      jobTitle: job?.jobTitle?.slice(0, 255),
      companyName: job?.companyName?.slice(0, 255),
      jobDescription: job?.jobDescription?.slice(0, 20000),
      unresolvedFields: batch.map(toPayload),
    };
    lastCallAt = Date.now();
    callsThisPageLoad++;
    callsPerStep.set(opts.stepKey, (callsPerStep.get(opts.stepKey) || 0) + 1);

    const response = await sendToBackground(request);
    if (!response.success || !response.data?.resolvedFields) {
      firstError = firstError || response.error || 'AI request failed';
      continue;
    }
    for (const r of response.data.resolvedFields) {
      const field = batch.find((f) => f.elementIndex === r.elementIndex) || batch.find((f) => f.id === r.fieldId);
      if (!field) continue;
      const confidence = normalizeConfidence(r.confidence);
      const values = Array.isArray(r.values) ? r.values.map((v) => String(v)).filter(Boolean) : undefined;
      answers.push({
        fieldId: field.id,
        elementIndex: field.elementIndex,
        value: typeof r.value === 'string' ? r.value : r.value === undefined || r.value === null ? '' : String(r.value),
        values,
        confidence,
        needsReview: Boolean(r.needsReview) || confidence < 0.7,
        reasoning: r.reasoning,
      });
    }
  }
  return { answers, skippedReason: answers.length === 0 ? firstError : undefined };
}
