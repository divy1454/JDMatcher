/**
 * JDMatcher auto-fill engine (content script, runs in every frame).
 *
 * Page load on a known ATS: fills the current page (zero-click), as before.
 * "Fill Form" in the widget: hands-free run. Fills the page, clicks Next/Continue, fills the next page,
 * and so on until the Review/Submit page. It never submits. It pauses on a page when an answer needs
 * the recruiter (missing data, a guess, a profile conflict) and shows what to check.
 */
import {
  CandidateAutoFillProfile,
  AutoFillRunStats,
  AutoFillExtractedField,
  AutoFillFieldResult,
  AutoFillReviewItem,
} from '../content/types';
import { scanApplicationForm, isFieldFilled, readFieldValue } from './form-detector';
import { resolveTier1Field, Tier1Context, isDialCodeControl, profileDialCode } from './tier1-resolver';
import { resolveSavedResponse } from './saved-response-matcher';
import { requestAiAnswers, resetTier2CircuitBreaker } from './tier2-resolver';
import { injectField, readLazyOptions, answerFitsOptions } from './dom-injector';
import { getJobContext, resetJobContextCache } from './job-context';
import {
  computeStepKey,
  findNextButton,
  clickNextAndWait,
  isFinalStep,
  isAutoAdvanceAllowedHere,
  isSafeNextButton,
  visibleErrors,
} from './step-navigator';
import {
  markElementAsAutoFilled,
  showAutoFillStartingToast,
  showAutoFillCompletedToast,
  showAutoFillInfoToast,
  dismissAutoFillToast,
} from './visual-feedback';
import { markElementNeedsReview, clearReviewMark, showReviewPanel, dismissReviewPanel, triggerFrameContinue, shownPanelMode } from './review-panel';
import { startFormObserver, isElementAlreadyProcessed, markElementProcessed } from './observer';
import { trackForLearning, snapshotTrackedAnswers, installAnswerRecorder } from './answer-recorder';
import { sleep, waitFor, waitForDomQuiet, isRendered } from './dom-utils';
import { normalizeText } from './text-utils';
import { isDeclineText, dialCodeOf } from './option-matcher';
import { isRecognizedJobPage } from './ats-sites';
import { installUserActivityTracker, isUserEdited, msSinceUserActivity, userTypingTarget, deepActiveElement } from './user-activity';
import './content-autofill.css';

console.log('[JDMatcher Enterprise] Auto-Fill Engine initialized in frame:', window.self === window.top ? 'top' : 'iframe');

let currentProfile: CandidateAutoFillProfile | null = null;
let isAutoFillEnabled = true;
const settings = { autoAdvance: true, pauseOnFlags: true };
let isExecutionInProgress = false;
let sessionRunning = false;
/** The page the recruiter already reviewed (flags there no longer pause the run). */
let acknowledgedStepKey = '';
/** The run paused on a page of THIS document (so conditional questions appearing don't count as moving on). */
let pausedInThisDocument = false;
/** The recruiter clicked Next themselves while the run was paused. */
let userAdvancedWhilePaused = false;
/** Number of answers flagged during the current fill (for deciding whether to show the panel). */
let newFlagsThisRun = 0;

const MAX_STEPS = 15;
const SESSION_KEY = 'jdm_auto_session_v1';
const SESSION_MAX_AGE_MS = 45 * 60 * 1000;

/** Automatic fills wait until the recruiter has not typed or clicked for this long. */
const USER_IDLE_MS = 1500;

/** Pages that fill on load: known ATS (see ats-sites.ts), job boards, and career/apply pages. */
export function isRecognizedJobBoardOrAts(): boolean {
  try {
    return isRecognizedJobPage() || Boolean(document.querySelector('.jobs-easy-apply-modal, .jobs-apply-form'));
  } catch {
    return false;
  }
}

/** A large frame on the page: an embedded application form probably lives in it, not in this page. */
function hasLargeFrame(): boolean {
  return Array.from(document.querySelectorAll('iframe')).some((f) => {
    const r = f.getBoundingClientRect();
    return r.width >= 300 && r.height >= 200 && isRendered(f);
  });
}

/**
 * Fill Form on a page with only one or two questions (a later step of a multi-page form, like JobDiva's
 * "immigration status" page) still fills them. Only in the top page, and only when no big frame on the
 * page could be holding the real form; frames still need the usual signs of an application form.
 */
function manualFillAcceptsShortPage(): boolean {
  return window.self === window.top && !hasLargeFrame();
}

// ---------------------------------------------------------------------------
// Stored state
// ---------------------------------------------------------------------------

async function loadStoredState(): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(
        ['autofillEnabled', 'cachedCandidateProfile', 'autofillAutoAdvance', 'autofillPauseOnFlags'],
        (res) => {
          if (res?.autofillEnabled !== undefined) isAutoFillEnabled = Boolean(res.autofillEnabled);
          if (res?.cachedCandidateProfile) currentProfile = res.cachedCandidateProfile;
          if (res?.autofillAutoAdvance !== undefined) settings.autoAdvance = Boolean(res.autofillAutoAdvance);
          if (res?.autofillPauseOnFlags !== undefined) settings.pauseOnFlags = Boolean(res.autofillPauseOnFlags);
          resolve();
        }
      );
    } catch {
      resolve();
    }
  });
}

interface StoredSession {
  candidateId: string;
  startedAt: number;
  steps: number;
  paused: boolean;
  pausedStepKey?: string;
  /** Which application this run belongs to (site + job id), so it never resumes on another job. */
  jobKey?: string;
}

/** Site plus the job id in the URL (Workday "_R123", Greenhouse/iCIMS numbers, Lever UUIDs). */
function currentJobKey(): string {
  // ADP and others carry the company id in the URL too; the job id parameter says which job this is
  const params = new URLSearchParams(window.location.search);
  for (const key of ['jobId', 'jobid', 'job_id', 'gh_jid', 'reqId', 'requisitionId']) {
    const v = params.get(key);
    if (v) return `${window.location.hostname}|${v}`;
  }
  const href = `${window.location.pathname}${window.location.search}`;
  const id = href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[_-]J?R-?\d{3,}|\d{4,}/i);
  return `${window.location.hostname}|${id ? id[0] : window.location.pathname}`;
}

function loadSession(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s || Date.now() - s.startedAt > SESSION_MAX_AGE_MS) return null;
    return s;
  } catch {
    return null;
  }
}

function saveSession(s: StoredSession | null): void {
  try {
    if (s) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore blocked storage
  }
}

// ---------------------------------------------------------------------------
// Review bookkeeping
// ---------------------------------------------------------------------------

const reviewItems = new Map<HTMLElement, AutoFillReviewItem>();
/** Fields behind each flag, and whether the engine put a value in them. */
const reviewFields = new Map<HTMLElement, { field: AutoFillExtractedField; filledByEngine: boolean }>();

function anchorOf(field: AutoFillExtractedField): HTMLElement {
  if ((field.type === 'radio_group' || field.type === 'checkbox_group') && field.container) return field.container;
  return field.element!;
}

/** Flags a question for the recruiter. `filledByEngine` = an answer was filled but should be checked. */
function flag(field: AutoFillExtractedField, reason: string, filledByEngine = false): void {
  const anchor = anchorOf(field);
  markElementNeedsReview(anchor, reason);
  if (!reviewItems.has(anchor)) newFlagsThisRun++;
  reviewItems.set(anchor, { question: field.question || field.label || 'Unlabeled field', reason, element: anchor });
  reviewFields.set(anchor, { field, filledByEngine });
}

function unflag(anchor: HTMLElement): void {
  clearReviewMark(anchor);
  reviewItems.delete(anchor);
  reviewFields.delete(anchor);
}

function markFilled(field: AutoFillExtractedField, tier: 'tier1' | 'saved_response' | 'tier2', strategy: string): void {
  const anchor = anchorOf(field);
  unflag(anchor);
  markElementAsAutoFilled(anchor, tier, strategy);
}

/** Drops flags for questions that left the page, and for empty questions the recruiter has since answered. */
function pruneReviewItems(): void {
  for (const [el] of reviewItems) {
    if (!el.isConnected) {
      reviewItems.delete(el);
      reviewFields.delete(el);
      continue;
    }
    const info = reviewFields.get(el);
    if (info && !info.filledByEngine && info.field.element?.isConnected && isAnswered(info.field)) unflag(el);
  }
}

// AI answers given during a hands-free run, listed again on the final review panel
const AI_LOG_KEY = 'jdm_ai_answers_v1';

const AI_LOG_MAX_AGE_MS = 60 * 60 * 1000;

interface AiLogEntry extends AutoFillReviewItem {
  host: string;
  t: number;
}

function logAiAnswer(question: string, answer: string): void {
  try {
    const list = JSON.parse(window.sessionStorage.getItem(AI_LOG_KEY) || '[]') as AiLogEntry[];
    const short = answer.length > 80 ? `${answer.slice(0, 77)}...` : answer;
    const entry: AiLogEntry = { question, reason: `Answered by AI: ${short}`, host: window.location.hostname, t: Date.now() };
    const next = list.filter((i) => i.question !== question).concat(entry);
    window.sessionStorage.setItem(AI_LOG_KEY, JSON.stringify(next.slice(-20)));
  } catch {
    // best effort
  }
}

/** AI answers given on this site in the last hour (this application). */
function readAiLog(): AutoFillReviewItem[] {
  try {
    const list = JSON.parse(window.sessionStorage.getItem(AI_LOG_KEY) || '[]') as AiLogEntry[];
    return list
      .filter((i) => i.host === window.location.hostname && Date.now() - i.t < AI_LOG_MAX_AGE_MS)
      .map((i) => ({ question: i.question, reason: i.reason }));
  } catch {
    return [];
  }
}

function clearAiLog(): void {
  try {
    window.sessionStorage.removeItem(AI_LOG_KEY);
  } catch {
    // ignore
  }
}

/** Items for the final "ready to submit" panel: open flags on this page plus earlier AI answers. */
function readyItems(flagged: AutoFillReviewItem[]): AutoFillReviewItem[] {
  const seen = new Set(flagged.map((f) => f.question));
  return flagged.concat(readAiLog().filter((i) => !seen.has(i.question)));
}

/**
 * A radio group whose checked option is just the page's default still gets our answer, and so does
 * a phone box holding only the country code the site typed in ("+44 ").
 */
function isAnswered(field: AutoFillExtractedField): boolean {
  if (field.type === 'radio_group' && !field.isAria) {
    const checked = (field.optionElements || []).find((o) => (o.element as HTMLInputElement).checked);
    if (checked && (checked.element as HTMLInputElement).defaultChecked) return false;
  }
  if (field.type === 'checkbox') return Boolean(readFieldValue(field));
  if (
    field.type === 'text' &&
    (field.inputType === 'tel' || /\b(phone|mobile|cell|telephone)\b/.test(normalizeText(field.question || field.label))) &&
    /^\+\s?\d{1,4}[\s-]*$/.test(readFieldValue(field).trim())
  ) {
    return false;
  }
  return isFieldFilled(field);
}

/** A country-code picker the site pre-set to another country's code (+44 on an en-GB page). */
function hasWrongDialCode(field: AutoFillExtractedField, profile: CandidateAutoFillProfile): boolean {
  if (!isDialCodeControl(field)) return false;
  const shown = dialCodeOf(readFieldValue(field));
  const wanted = profileDialCode(profile);
  return Boolean(shown && wanted && shown !== wanted);
}

function withOptions(field: AutoFillExtractedField, options?: string[]): AutoFillExtractedField {
  return options && options.length ? { ...field, options } : field;
}

function emptyStats(): AutoFillRunStats {
  return { totalFields: 0, tier1Filled: 0, savedFilled: 0, tier2Filled: 0, unfilled: 0, flagged: 0, startTime: Date.now(), durationMs: 0 };
}

interface StepResult {
  stats: AutoFillRunStats;
  stepKey: string;
  flagged: AutoFillReviewItem[];
  requiredMissing: AutoFillReviewItem[];
  fieldsFound: number;
  newFlags: number;
}

// ---------------------------------------------------------------------------
// Filling one page
// ---------------------------------------------------------------------------

interface StepOptions {
  /** Accept a page with only one or two questions (see ScanOptions.lenient). */
  lenient?: boolean;
  /** A fill nobody asked for (page load, new questions appearing): stay out of the recruiter's way. */
  automatic?: boolean;
}

async function fillCurrentStep(isManualTrigger: boolean, showToasts: boolean, opts: StepOptions = {}): Promise<StepResult | null> {
  const profile = currentProfile;
  if (!profile) return null;
  const stats = emptyStats();
  pruneReviewItems();
  newFlagsThisRun = 0;

  let scan = scanApplicationForm(document, { lenient: opts.lenient });
  if (!scan.isJobApplication || scan.fields.length === 0) {
    return { stats, stepKey: computeStepKey([]), flagged: [], requiredMissing: [], fieldsFound: 0, newFlags: 0 };
  }
  const job = await getJobContext(profile.id);

  let attempted = 0;
  const tried = new Set<HTMLElement>();
  for (let pass = 0; pass < 3; pass++) {
    if (pass > 0) {
      // Answers can reveal follow-up questions, and some sites redraw a field after a change (a new
      // phone box once the country code is picked); look again and fill those too
      await sleep(300);
      scan = scanApplicationForm(document, { lenient: true });
    }
    // Never touch what the recruiter changed by hand, or the box they are typing in right now
    const typingIn = opts.automatic ? userTypingTarget() : null;
    const todo = scan.fields.filter(
      (f) =>
        f.element &&
        f.element.isConnected &&
        !tried.has(f.element) &&
        !isElementAlreadyProcessed(f.element) &&
        !isUserEdited(f) &&
        f.element !== typingIn &&
        (!isAnswered(f) || hasWrongDialCode(f, profile))
    );
    if (todo.length === 0) break;
    if (pass === 0 && showToasts) showAutoFillStartingToast(profile.fullName);
    todo.forEach((f) => tried.add(f.element!));
    attempted += todo.length;
    const ctx: Tier1Context = {
      fileFieldCount: scan.fields.filter((f) => f.type === 'file').length,
      companyName: job.companyName,
      hasSeparateCountryCode: scan.fields.some(
        (f) => /\b(country|phone|dial(ing)?|calling) code\b/i.test(f.question || '') || isDialCodeControl(f)
      ),
    };
    await fillFields(todo, profile, job, ctx, stats, isManualTrigger, computeStepKey(scan.fields));
  }
  const stepKey = computeStepKey(scan.fields);
  stats.totalFields = scan.fields.length;

  // --- Required fields still empty ---
  const requiredMissing: AutoFillReviewItem[] = [];
  for (const field of scan.fields) {
    if (!field.isRequired || !field.element || !field.element.isConnected) continue;
    // A box the recruiter is in the middle of changing is theirs to finish; no flag pops up for it
    if (opts.automatic && isUserEdited(field)) continue;
    if (field.type === 'file' && !readFieldValue(field) && field.element.getAttribute('data-jdm-file-injected') !== 'true') {
      if (!reviewItems.has(anchorOf(field))) flag(field, 'Required upload is missing.');
      requiredMissing.push(reviewItems.get(anchorOf(field))!);
      continue;
    }
    if (field.type !== 'file' && !readFieldValue(field)) {
      if (!reviewItems.has(anchorOf(field))) flag(field, 'Required and still empty.');
      requiredMissing.push(reviewItems.get(anchorOf(field))!);
    }
  }

  const flagged = Array.from(reviewItems.values()).filter((i) => i.element?.isConnected);
  stats.flagged = flagged.length;
  stats.unfilled = Math.max(0, attempted - (stats.tier1Filled + stats.savedFilled + stats.tier2Filled));
  stats.durationMs = Date.now() - stats.startTime;
  return { stats, stepKey, flagged, requiredMissing, fieldsFound: scan.fields.length, newFlags: newFlagsThisRun };
}

/**
 * A voluntary self-identification question (pronouns, gender, race...) the candidate declines: when the
 * question is optional and has no "prefer not to say" option, leaving it blank is the same as declining,
 * so it isn't flagged. Required ones still go to the recruiter.
 */
function optionalDecline(field: AutoFillExtractedField, t1: AutoFillFieldResult): boolean {
  return !field.isRequired && /^tier1:eeo_/.test(t1.strategy || '') && (Boolean(t1.declined) || isDeclineText(normalizeText(t1.value || '')));
}

/** Answers the given questions: profile rules, then saved answers, then the AI. */
async function fillFields(
  todo: AutoFillExtractedField[],
  profile: CandidateAutoFillProfile,
  job: Awaited<ReturnType<typeof getJobContext>>,
  ctx: Tier1Context,
  stats: AutoFillRunStats,
  isManualTrigger: boolean,
  stepKey: string
): Promise<void> {
  const pending: AutoFillExtractedField[] = [];
  const optionsSeen = new Map<number, string[]>();

  // --- Tier 1 (profile) and saved answers ---
  for (const field of todo) {
    const el = field.element!;
    // Redrawn by the site while filling the fields before it; the next look at the page finds the new one
    if (!el.isConnected) continue;
    const t1 = resolveTier1Field(field, profile, ctx);
    if (t1) {
      if (t1.skip) {
        markElementProcessed(el);
        continue;
      }
      if (!t1.value && !(t1.values && t1.values.length)) {
        if (!optionalDecline(field, t1)) flag(field, t1.reason || 'This needs the recruiter.');
        markElementProcessed(el);
        continue;
      }
      const res = await injectField(field, t1, profile);
      if (res.ok) {
        stats.tier1Filled++;
        markFilled(field, 'tier1', t1.strategy);
        if (t1.needsReview) flag(field, t1.reason || 'Please check this answer.', true);
        markElementProcessed(el);
        continue;
      }
      if (!el.isConnected) continue;
      if (res.optionsSeen?.length) optionsSeen.set(field.elementIndex, res.optionsSeen);
      if (t1.final) {
        if (!optionalDecline(field, t1)) flag(field, res.reason || 'The profile answer could not be filled.');
        markElementProcessed(el);
        continue;
      }
    }

    const saved = resolveSavedResponse(withOptions(field, optionsSeen.get(field.elementIndex)), profile);
    if (saved) {
      const res = await injectField(field, saved, profile);
      if (res.ok) {
        stats.savedFilled++;
        markFilled(field, 'saved_response', saved.strategy);
        if (saved.needsReview) flag(field, saved.reason || 'Please check this saved answer.', true);
        trackForLearning(field, job.companyName);
        markElementProcessed(el);
        continue;
      }
      if (!el.isConnected) continue;
      if (res.optionsSeen?.length) optionsSeen.set(field.elementIndex, res.optionsSeen);
    }
    pending.push(field);
  }

  // --- Tier 2 (AI with resume + job description) ---
  const aiFields: AutoFillExtractedField[] = [];
  for (const field of pending) {
    const el = field.element!;
    if (!el.isConnected) continue;
    if (field.type === 'file') {
      if (field.isRequired) flag(field, 'Upload this document yourself.');
      markElementProcessed(el);
      continue;
    }
    if (field.type === 'checkbox' && !field.isRequired) {
      markElementProcessed(el); // optional boxes stay as they are
      continue;
    }
    let f = withOptions(field, optionsSeen.get(field.elementIndex));
    if ((f.type === 'dropdown_button' || f.type === 'combobox') && !(f.options && f.options.length)) {
      const opts = await readLazyOptions(f);
      if (opts.length) f = { ...f, options: opts };
    }
    aiFields.push(f);
  }
  if (aiFields.length === 0) return;

  const outcome = await requestAiAnswers(aiFields, profile, job, { isManualTrigger, stepKey });
  const answered = new Set<number>();
  for (const ans of outcome.answers) {
    const field = aiFields.find((f) => f.elementIndex === ans.elementIndex);
    if (!field || !field.element || !field.element.isConnected) continue;
    answered.add(field.elementIndex);
    const hasValue = Boolean(ans.value && ans.value.trim()) || Boolean(ans.values && ans.values.length);
    if (!hasValue) {
      // Leaving an optional question blank is fine; a required one needs the recruiter
      if (field.isRequired) {
        flag(field, ans.reasoning ? `AI: ${ans.reasoning}` : 'The resume and profile do not answer this.');
      }
      markElementProcessed(field.element);
      continue;
    }
    const choiceType = field.type === 'select' || field.type === 'radio_group' || field.type === 'dropdown_button';
    if (choiceType && field.options && field.options.length && !answerFitsOptions(field.options, ans.value)) {
      flag(field, `The AI answer "${ans.value}" doesn't match any option.`);
      markElementProcessed(field.element);
      continue;
    }
    // The recruiter may have answered it while the AI was thinking
    if (isUserEdited(field)) {
      markElementProcessed(field.element);
      continue;
    }
    const res = await injectField(field, { value: ans.value, values: ans.values }, profile);
    if (res.ok) {
      stats.tier2Filled++;
      markFilled(field, 'tier2', ans.reasoning || 'AI answer');
      if (ans.needsReview) flag(field, ans.reasoning ? `AI is unsure: ${ans.reasoning}` : 'AI is unsure about this answer.', true);
      logAiAnswer(field.question || field.label || 'Question', ans.values && ans.values.length ? ans.values.join(', ') : ans.value);
      trackForLearning(field, job.companyName);
    } else {
      flag(field, res.reason || 'The AI answer could not be filled.');
    }
    markElementProcessed(field.element);
  }
  for (const field of aiFields) {
    if (answered.has(field.elementIndex) || !field.element || !field.element.isConnected) continue;
    if (outcome.skippedReason) {
      // Not marked processed, so a later run can retry
      if (field.isRequired) flag(field, `No AI answer yet (${outcome.skippedReason}).`);
    } else {
      if (field.isRequired) flag(field, 'No answer found in the profile or resume.');
      markElementProcessed(field.element);
    }
  }
}

async function runStepLocked(isManualTrigger: boolean, showToasts: boolean, opts: StepOptions = {}): Promise<StepResult | null> {
  if (isExecutionInProgress) {
    // A page-change fill is running; wait for it instead of skipping
    const free = await waitFor(() => !isExecutionInProgress, 20000, 100);
    if (!free) return null;
  }
  isExecutionInProgress = true;
  const focusBefore = opts.automatic ? deepActiveElement() : null;
  try {
    return await fillCurrentStep(isManualTrigger, showToasts, opts);
  } catch (err) {
    console.error('[JDMatcher Auto-Fill] Error filling page:', err);
    return null;
  } finally {
    isExecutionInProgress = false;
    restoreFocus(focusBefore);
  }
}

/** Gives the cursor back to the field the recruiter was in before an automatic fill moved it. */
function restoreFocus(el: Element | null): void {
  if (!(el instanceof HTMLElement) || !el.isConnected || deepActiveElement() === el) return;
  if (!el.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    // ignore
  }
}

function finishToasts(result: StepResult, isManualTrigger: boolean): void {
  const filled = result.stats.tier1Filled + result.stats.savedFilled + result.stats.tier2Filled;
  // Everything the review list asked about has been answered since (by the recruiter or a later fill)
  if (result.flagged.length === 0 && shownPanelMode() === 'review') dismissReviewPanel();
  if (result.flagged.length > 0 && (filled > 0 || result.newFlags > 0 || isManualTrigger)) {
    dismissAutoFillToast();
    showReviewPanel('review', result.flagged);
  } else if (result.flagged.length > 0) {
    dismissAutoFillToast();
  } else if (filled > 0) {
    showAutoFillCompletedToast(result.stats, currentProfile?.fullName);
  } else if (isManualTrigger) {
    showAutoFillInfoToast('Nothing left to fill', 'All detectable application questions already have answers.');
  } else {
    dismissAutoFillToast();
  }
}

// ---------------------------------------------------------------------------
// Single fill (zero-click on page load / page changes)
// ---------------------------------------------------------------------------

/**
 * Executes a full detection and filling cycle across the current frame.
 * Zero-click runs only happen on recognized ATS / job domains.
 */
export async function executeAutoFillCycle(isManualTrigger = false): Promise<AutoFillRunStats> {
  if (!isManualTrigger && !isRecognizedJobBoardOrAts()) return emptyStats();
  if (!isAutoFillEnabled && !isManualTrigger) return emptyStats();
  if (!currentProfile) {
    await loadStoredState();
    if (!currentProfile) {
      if (isManualTrigger) showAutoFillInfoToast('No Candidate Selected', 'Please select an active candidate in the JDMatcher sidebar first.');
      return emptyStats();
    }
  }
  if (isManualTrigger) resetTier2CircuitBreaker();
  // New questions on a page the recruiter already ran Fill Form on are part of that application
  const session = loadSession();
  const inRun = Boolean(session && session.jobKey === currentJobKey());
  const result = await runStepLocked(isManualTrigger, true, {
    lenient: inRun || (isManualTrigger && manualFillAcceptsShortPage()),
    automatic: !isManualTrigger,
  });
  if (!result) return emptyStats();
  if (result.fieldsFound === 0) {
    if (isManualTrigger) showNoFormToast();
    return result.stats;
  }
  finishToasts(result, isManualTrigger);
  return result.stats;
}

/** Only the top frame of a page without form frames reports "no form" (ad/analytics iframes stay quiet). */
function showNoFormToast(): void {
  if (window.top !== window.self) return;
  if (document.querySelector('iframe')) return;
  showAutoFillInfoToast('No Application Form Found', 'No supported job application inputs detected on this page.');
}

// ---------------------------------------------------------------------------
// Hands-free run across pages
// ---------------------------------------------------------------------------

function endSession(): void {
  saveSession(null);
  acknowledgedStepKey = '';
  clearAiLog();
}

function pauseSession(stepKey: string): void {
  const s = loadSession();
  if (s) saveSession({ ...s, paused: true, pausedStepKey: stepKey });
  pausedInThisDocument = true;
  userAdvancedWhilePaused = false;
}

/** Called when the recruiter presses Continue after reviewing a paused page. */
function continueAfterReview(stepKey: string): void {
  acknowledgedStepKey = stepKey;
  pausedInThisDocument = false;
  const s = loadSession();
  if (s) saveSession({ ...s, paused: false });
  void runAutoSession(false);
}

/**
 * Fills page after page until the Review/Submit page, a page that needs the recruiter, or an error.
 * `onFirstPage` lets the caller answer the widget quickly while the run continues.
 */
async function runAutoSession(isManualTrigger: boolean, onFirstPage?: (stats: AutoFillRunStats) => void): Promise<AutoFillRunStats> {
  if (sessionRunning || !currentProfile) {
    onFirstPage?.(emptyStats());
    return emptyStats();
  }
  sessionRunning = true;
  const existing = loadSession();
  const sameRun = Boolean(existing && existing.candidateId === currentProfile.id && existing.jobKey === currentJobKey());
  // Short pages count as the form when the recruiter pressed Fill Form here, or the run is already on this application
  const shortPageOk = sameRun || (isManualTrigger && manualFillAcceptsShortPage());
  saveSession({
    candidateId: currentProfile.id,
    startedAt: sameRun ? existing!.startedAt : Date.now(),
    steps: sameRun ? existing!.steps : 0,
    paused: false,
    jobKey: currentJobKey(),
  });
  if (isManualTrigger) {
    resetTier2CircuitBreaker();
    dismissReviewPanel();
  }

  let firstStats: AutoFillRunStats | null = null;
  const report = (stats: AutoFillRunStats) => {
    if (!firstStats) {
      firstStats = stats;
      onFirstPage?.(stats);
    }
  };

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      // After clicking Next on a form, every following page is part of it, however short
      const lenient = step > 0 || shortPageOk;
      let result = await runStepLocked(isManualTrigger && step === 0, true, { lenient });
      if (result && result.fieldsFound === 0) {
        // The next page may still be loading
        await sleep(1200);
        result = await runStepLocked(false, true, { lenient });
      }
      if (!result) {
        report(emptyStats());
        break;
      }
      report(result.stats);
      if (result.fieldsFound === 0) {
        // A review page has no questions, only the final Submit button
        if (isFinalStep() && (step > 0 || loadSession()?.steps)) {
          snapshotTrackedAnswers();
          showReviewPanel('ready', readyItems([]));
        } else if (isManualTrigger && step === 0) {
          showNoFormToast();
        }
        endSession();
        break;
      }
      dismissAutoFillToast();

      if (!isAutoAdvanceAllowedHere()) {
        showReviewPanel('linkedin', result.flagged);
        endSession();
        break;
      }
      if (!settings.autoAdvance) {
        finishToasts(result, isManualTrigger);
        endSession();
        break;
      }

      const reviewed = result.stepKey === acknowledgedStepKey;
      const blocking = settings.pauseOnFlags && !reviewed ? result.flagged : result.requiredMissing;
      if (blocking.length > 0) {
        const stepKey = result.stepKey;
        pauseSession(stepKey);
        showReviewPanel('paused', blocking, () => continueAfterReview(stepKey));
        break;
      }

      if (isFinalStep()) {
        snapshotTrackedAnswers();
        showReviewPanel('ready', readyItems(result.flagged));
        endSession();
        break;
      }

      const next = findNextButton();
      if (!next) {
        finishToasts(result, isManualTrigger);
        endSession();
        break;
      }
      if (!isSafeNextButton(next, (loadSession()?.steps || 0) > 0)) {
        const label = (next.innerText || (next as HTMLInputElement).value || 'Continue').trim().slice(0, 40);
        showReviewPanel(
          'stopped',
          readyItems(result.flagged).concat({
            question: `"${label}" might submit the application.`,
            reason: 'Check the page, then click it yourself.',
          })
        );
        endSession();
        break;
      }

      snapshotTrackedAnswers();
      const s = loadSession();
      if (s) saveSession({ ...s, steps: s.steps + 1 });
      if ((s?.steps || 0) + 1 > MAX_STEPS) {
        showReviewPanel('stopped', [{ question: 'Stopped after many pages.', reason: 'Check the form and continue by hand.' }]);
        endSession();
        break;
      }

      const outcome = await clickNextAndWait(next, result.stepKey, () => computeStepKey(scanApplicationForm(document).fields));
      if (outcome === 'advanced') continue;

      const stepKey = result.stepKey;
      pauseSession(stepKey);
      if (outcome === 'errors') {
        const errors = visibleErrors().map((e) => ({ question: e, reason: 'Shown by the site after clicking Next.' }));
        showReviewPanel('errors', errors, () => continueAfterReview(stepKey));
      } else {
        showReviewPanel(
          'stopped',
          [{ question: 'The page did not change after clicking Next.', reason: 'Check the page, then press Continue.' }],
          () => continueAfterReview(stepKey)
        );
      }
      break;
    }
  } finally {
    sessionRunning = false;
  }
  return firstStats || emptyStats();
}

/**
 * Carries on with a run after a full page load, or after the recruiter clicked Next themselves on a
 * paused page. New questions appearing on the paused page (follow-ups) do NOT resume the run.
 */
async function maybeResumeSession(): Promise<boolean> {
  const s = loadSession();
  if (!s || !currentProfile || s.candidateId !== currentProfile.id || sessionRunning) return false;
  if (s.jobKey && s.jobKey !== currentJobKey()) {
    // A different job: the old run is over
    endSession();
    return false;
  }
  if (!s.paused) {
    if (pausedInThisDocument) return false;
    void runAutoSession(false);
    return true;
  }
  const currentKey = () => computeStepKey(scanApplicationForm(document).fields);
  if (pausedInThisDocument) {
    if (!userAdvancedWhilePaused) return false;
    userAdvancedWhilePaused = false;
    const moved = await waitFor(() => currentKey() !== s.pausedStepKey, 10000, 300);
    if (!moved) return false;
    await waitForDomQuiet(500, 4000);
  } else if (currentKey() === s.pausedStepKey) {
    return false; // same page reloaded: stay paused
  }
  pausedInThisDocument = false;
  saveSession({ ...s, paused: false });
  void runAutoSession(false);
  return true;
}

const NEXT_CLICK_RE = /^(next|continue|save and continue|save continue|proceed)\b/;

/** Notices the recruiter's own Next click while a run is paused. */
function installPausedNextListener(): void {
  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted || !pausedInThisDocument) return;
      const btn = (event.target as HTMLElement | null)?.closest?.('button, [role="button"], input[type="button"], input[type="submit"], a') as HTMLElement | null;
      if (!btn) return;
      const text = normalizeText(btn.innerText || (btn as HTMLInputElement).value || btn.getAttribute('aria-label') || '');
      if (NEXT_CLICK_RE.test(text)) userAdvancedWhilePaused = true;
    },
    { capture: true }
  );
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

let automaticFillTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Page-load and new-question fills (and carrying on a paused run). They wait until the recruiter has
 * stopped typing and clicking, so the engine never fills a box while the recruiter is working in the form.
 */
function scheduleAutomaticFill(delayMs = 0): void {
  if (automaticFillTimer) clearTimeout(automaticFillTimer);
  automaticFillTimer = setTimeout(() => {
    automaticFillTimer = null;
    if (sessionRunning) return;
    const idle = msSinceUserActivity();
    if (idle < USER_IDLE_MS || isExecutionInProgress) {
      scheduleAutomaticFill(Math.max(250, USER_IDLE_MS - idle + 50));
      return;
    }
    void maybeResumeSession().then((resumed) => {
      if (!resumed && isAutoFillEnabled) void executeAutoFillCycle(false);
    });
  }, delayMs);
}

async function initialize(): Promise<void> {
  await loadStoredState();
  installAnswerRecorder(() => currentProfile?.id || null);
  installUserActivityTracker();
  installPausedNextListener();

  startFormObserver({
    debounceMs: 400,
    onFormMutated: () => {
      if (sessionRunning || isExecutionInProgress) return;
      scheduleAutomaticFill();
    },
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // "⚡ Fill Form" works on any site and starts the hands-free run
    if (message.type === 'TRIGGER_AUTOFILL' || message.type === 'EXECUTE_AUTOFILL') {
      (async () => {
        if (!currentProfile) await loadStoredState();
        if (!currentProfile) {
          showAutoFillInfoToast('No Candidate Selected', 'Please select an active candidate in the JDMatcher sidebar first.');
          sendResponse({ success: false, stats: emptyStats() });
          return;
        }
        acknowledgedStepKey = '';
        pausedInThisDocument = false;
        let responded = false;
        const respond = (stats: AutoFillRunStats) => {
          if (responded) return;
          responded = true;
          // Frames without a form answer late so the frame that has the form reports first
          const filled = stats.tier1Filled + stats.savedFilled + stats.tier2Filled;
          if (stats.totalFields === 0 && filled === 0) setTimeout(() => sendResponse({ success: true, stats }), 2500);
          else sendResponse({ success: true, stats });
        };
        await runAutoSession(true, respond);
        respond(emptyStats());
      })();
      return true;
    }

    if (message.type === 'TOGGLE_AUTOFILL') {
      isAutoFillEnabled = Boolean(message.enabled);
      chrome.storage.local.set({ autofillEnabled: isAutoFillEnabled });
      if (isAutoFillEnabled) void executeAutoFillCycle();
      else endSession();
      sendResponse({ success: true, enabled: isAutoFillEnabled });
      return true;
    }

    if (message.type === 'SET_AUTOFILL_SETTINGS') {
      if (message.autoAdvance !== undefined) settings.autoAdvance = Boolean(message.autoAdvance);
      if (message.pauseOnFlags !== undefined) settings.pauseOnFlags = Boolean(message.pauseOnFlags);
      sendResponse({ success: true, settings });
      return true;
    }

    if (message.type === 'RESUME_AUTOFILL') {
      sendResponse({ success: triggerFrameContinue() });
      return true;
    }

    if (message.type === 'PROFILE_UPDATED') {
      if (message.profile) {
        const changed = currentProfile?.id !== message.profile.id;
        currentProfile = message.profile;
        resetJobContextCache();
        if (changed) endSession();
        if (isAutoFillEnabled) void executeAutoFillCycle();
      }
      sendResponse({ success: true });
      return true;
    }
    return false;
  });

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.autofillAutoAdvance) settings.autoAdvance = changes.autofillAutoAdvance.newValue !== false;
    if (changes.autofillPauseOnFlags) settings.pauseOnFlags = changes.autofillPauseOnFlags.newValue !== false;
    if (changes.cachedCandidateProfile?.newValue) currentProfile = changes.cachedCandidateProfile.newValue;
  });

  if (currentProfile) {
    // Let the ATS finish rendering, then continue a run that was in progress or do a normal fill
    scheduleAutomaticFill(900);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initialize());
} else {
  void initialize();
}
