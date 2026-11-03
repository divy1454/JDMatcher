/**
 * Moves through multi-page application forms: finds the Next/Continue button, clicks it, and waits
 * for the next page. It never clicks Submit/Apply; the review page is where it stops.
 */
import { AutoFillExtractedField } from '../content/types';
import { normalizeText } from './text-utils';
import { deepQueryAll, isOwnUi, isRendered, isDisabled, simulateClick, sleep, textOf, composedClosest } from './dom-utils';
import { isBlockedSubmitElement } from './dom-injector';

/** Sites whose rules forbid automated clicking. Filling still works; moving between pages is manual. */
const NO_AUTO_ADVANCE_HOSTS = ['linkedin.com'];

export function isAutoAdvanceAllowedHere(): boolean {
  const host = window.location.hostname.toLowerCase();
  return !NO_AUTO_ADVANCE_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

const NEXT_TEXT_RE =
  /^(next|next step|next page|continue|continue to next step|continue application|save and continue|save continue|save and next|save next|proceed|go to next step)\b/;

const NEXT_AUTOMATION_IDS = ['bottom-navigation-next-button', 'pageFooterNextButton', 'wd-CommandButton_next'];

const CLICKABLE_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"], a[role="button"], a.button, a.btn';

const EXCLUDED_CONTAINERS =
  '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], #onetrust-banner-sdk, [aria-label*="cookie" i], header nav, [role="navigation"]';

function buttonText(el: HTMLElement): string {
  return normalizeText(
    (el instanceof HTMLInputElement ? el.value : textOf(el)) || el.getAttribute('aria-label') || el.getAttribute('title') || ''
  );
}

function usableButton(el: HTMLElement): boolean {
  return isRendered(el) && !isDisabled(el) && !isOwnUi(el) && !composedClosest(el, EXCLUDED_CONTAINERS);
}

/** The visible Next/Continue button, or null. Submit-like buttons are never returned. */
export function findNextButton(): HTMLElement | null {
  const candidates = deepQueryAll<HTMLElement>(CLICKABLE_SELECTOR).filter(usableButton);
  const matches = candidates.filter((el) => {
    if (isBlockedSubmitElement(el)) return false;
    const text = buttonText(el);
    const automationId = el.getAttribute('data-automation-id') || '';
    if (NEXT_AUTOMATION_IDS.includes(automationId)) return NEXT_TEXT_RE.test(text) || text === '';
    return NEXT_TEXT_RE.test(text);
  });
  // The last one in page order is usually the form's own footer button
  return matches.length ? matches[matches.length - 1] : null;
}

/** Texts that only ever mean "go to the next page". */
const CERTAIN_NEXT_RE = /^(next|next step|next page|save and continue|save continue|save and next|save next|continue to next step|go to next step)\b/;

/** Progress bars, "Step 2 of 5" and similar signs that the form has several pages. */
export function hasStepIndicator(): boolean {
  if (
    document.querySelector(
      '[role="progressbar"], [aria-current="step"], [data-automation-id*="progressBar"], [class*="stepper"], [class*="progress-step"], [class*="wizard"], .progress-bar'
    )
  ) {
    return true;
  }
  const text = (document.body?.innerText || '').slice(0, 20000);
  return /\b(step|page)\s+\d+\s+(of|\/)\s+\d+\b/i.test(text);
}

/**
 * A plain "Continue"/"Proceed" can be the final submit button on a one-page form, so it is only
 * clicked when the form clearly has several pages.
 */
export function isSafeNextButton(button: HTMLElement, alreadyAdvanced: boolean): boolean {
  const automationId = button.getAttribute('data-automation-id') || '';
  if (NEXT_AUTOMATION_IDS.includes(automationId)) return true;
  if (CERTAIN_NEXT_RE.test(buttonText(button))) return true;
  return alreadyAdvanced || hasStepIndicator();
}

/** The visible final Submit/Apply button, or null. */
export function findSubmitButton(): HTMLElement | null {
  const candidates = deepQueryAll<HTMLElement>(CLICKABLE_SELECTOR).filter(usableButton).filter((el) => isBlockedSubmitElement(el));
  // Ignore "Apply" buttons that only open the application (job pages have those)
  const real = candidates.filter((el) => {
    const text = buttonText(el);
    return !/^apply( now)?$/.test(text) || Boolean(el.closest('form'));
  });
  return real.length ? real[real.length - 1] : null;
}

/** Visible validation messages on the page. */
export function visibleErrors(): string[] {
  const selector = [
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[data-automation-id="errorMessage"]',
    '[data-automation-id*="errorBanner"]',
    '.error-message',
    '.field-error',
    '.invalid-feedback',
    '.error:not(input):not(select):not(textarea)',
    '[id$="-error"]',
    '[class*="errorMessage"]',
  ].join(', ');
  const texts = deepQueryAll<HTMLElement>(selector)
    .filter((el) => isRendered(el) && !isOwnUi(el))
    .map((el) => textOf(el))
    .filter((t) => t && t.length <= 300);
  return Array.from(new Set(texts)).slice(0, 8);
}

/** Identifies the current form page by its questions, so a new page can be detected without a URL change. */
export function computeStepKey(fields: AutoFillExtractedField[]): string {
  const questions = fields
    .map((f) => normalizeText(f.question || f.label || f.name).slice(0, 80))
    .filter(Boolean)
    .sort()
    .join('|');
  let hash = 0;
  const source = `${window.location.pathname}#${questions}`;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) | 0;
  return `${window.location.pathname}:${(hash >>> 0).toString(36)}`;
}

export type AdvanceOutcome = 'advanced' | 'errors' | 'no_change';

/**
 * Clicks Next and waits for the next page. `currentKey` reads the step key of whatever is on screen.
 */
export async function clickNextAndWait(button: HTMLElement, previousKey: string, currentKey: () => string): Promise<AdvanceOutcome> {
  if (isBlockedSubmitElement(button)) return 'no_change';
  const startUrl = window.location.href;
  const errorsBefore = new Set(visibleErrors());
  simulateClick(button);

  const deadline = Date.now() + 12000;
  let stableKey = '';
  let stableSince = 0;
  while (Date.now() < deadline) {
    await sleep(250);
    const newErrors = visibleErrors().filter((e) => !errorsBefore.has(e));
    const key = currentKey();
    if (key !== previousKey || window.location.href !== startUrl) {
      // Wait until the new page stops changing before filling it
      if (key !== stableKey) {
        stableKey = key;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= 600) {
        return 'advanced';
      }
      continue;
    }
    if (newErrors.length > 0 && Date.now() - (deadline - 12000) > 800) return 'errors';
  }
  return visibleErrors().length > errorsBefore.size ? 'errors' : 'no_change';
}

/** True when the page shows a final Submit button and no way forward. */
export function isFinalStep(): boolean {
  return Boolean(findSubmitButton()) && !findNextButton();
}
