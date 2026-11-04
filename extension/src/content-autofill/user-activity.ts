/**
 * What the recruiter does by hand on the page.
 *
 * - A field the recruiter changed (typed in, picked an option, ticked a box) is theirs: the engine
 *   never refills or overwrites it on this page, even when the site redraws the field empty.
 * - Automatic fills (page load, new questions appearing) wait until the recruiter stops typing, never
 *   fill the box the recruiter is in, and give the cursor back afterwards.
 *
 * Only real events count (event.isTrusted); the engine's own clicks and typing are ignored.
 */
import { AutoFillExtractedField } from '../content/types';
import { isOwnUi } from './dom-utils';
import { extractQuestionForElement, isGenericLabel } from './label-extractor';
import { normalizeText } from './text-utils';
import { clearAutoFilledMark } from './visual-feedback';

const touched = new WeakSet<Element>();
/** Radio/checkbox groups the recruiter answered, by input name. */
const touchedNames = new Set<string>();
/**
 * Questions of single fields the recruiter changed. Survives the site redrawing a field, and covers every
 * box of a question: change the country code of "Phone number" and the number box is left to you too.
 */
const touchedQuestions = new Set<string>();

/**
 * Above zero while the engine itself is filling. A script's checkbox.click() makes the browser fire
 * input/change events marked as trusted, so these would otherwise look like the recruiter's own edits.
 */
let engineDepth = 0;

/** Runs a fill action of the engine; events it causes are not counted as the recruiter's. */
export async function asEngine<T>(action: () => Promise<T>): Promise<T> {
  engineDepth++;
  try {
    return await action();
  } finally {
    engineDepth--;
  }
}

let lastActivityAt = 0;
/** The control the recruiter last clicked or typed in. */
let lastPointed: Element | null = null;
/** A dropdown the recruiter opened; picking one of its options makes it theirs. */
let openedTrigger: { el: HTMLElement; at: number } | null = null;

const CONTROL_SELECTOR =
  'input, select, textarea, [role="combobox"], [role="radio"], [role="checkbox"], [role="switch"], button[aria-haspopup], [role="button"][aria-haspopup]';
const TRIGGER_SELECTOR = 'button[aria-haspopup], [role="button"][aria-haspopup], [role="combobox"]';
const OPTION_SELECTOR = '[role="option"], [role="listbox"] li, [role="menuitem"], [role="menuitemradio"], [data-automation-id="promptOption"]';
const TEXT_ENTRY_SELECTOR = 'input:not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"], [contenteditable=""]';

function originOf(event: Event): Element | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const first = (path[0] || event.target) as EventTarget | null;
  return first instanceof Element ? first : null;
}

function markTouched(el: Element): void {
  if (isOwnUi(el)) return;
  touched.add(el);
  // No longer JDMatcher's answer, so no "filled by JDMatcher" highlight
  clearAutoFilledMark(el);
  const group = el.closest('fieldset, [role="radiogroup"], [role="group"]');
  if (group) clearAutoFilledMark(group);
  const input = el as HTMLInputElement;
  const type = (input.type || '').toLowerCase();
  if ((type === 'radio' || type === 'checkbox') && input.name) {
    touchedNames.add(input.name);
    return;
  }
  if (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox') return;
  const question = extractQuestionForElement(el as HTMLElement);
  if (question && !isGenericLabel(question)) touchedQuestions.add(normalizeText(question));
}

let installed = false;

export function installUserActivityTracker(): void {
  if (installed) return;
  installed = true;

  const onValueChange = (event: Event) => {
    if (!event.isTrusted || engineDepth > 0) return;
    lastActivityAt = Date.now();
    const origin = originOf(event);
    const control = origin?.closest?.(CONTROL_SELECTOR);
    if (control) markTouched(control);
  };
  document.addEventListener('input', onValueChange, true);
  document.addEventListener('change', onValueChange, true);

  document.addEventListener(
    'keydown',
    (event) => {
      if (!event.isTrusted || engineDepth > 0) return;
      lastActivityAt = Date.now();
      const origin = originOf(event);
      if (origin && !isOwnUi(origin)) lastPointed = origin.closest?.(CONTROL_SELECTOR) || origin;
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isTrusted || engineDepth > 0) return;
      const origin = originOf(event);
      if (!origin || isOwnUi(origin)) return;
      lastActivityAt = Date.now();
      lastPointed = origin.closest?.(CONTROL_SELECTOR) || origin;
      const option = origin.closest?.(OPTION_SELECTOR);
      if (option && openedTrigger && Date.now() - openedTrigger.at < 20000) {
        // Picked an option from a dropdown the recruiter opened
        markTouched(openedTrigger.el);
        openedTrigger = null;
        return;
      }
      // React-Select and similar: the click lands on the control around the search input
      const trigger = (origin.closest?.(TRIGGER_SELECTOR) ||
        origin
          .closest?.('.select__control, [class*="select__control"], [class*="-control"]')
          ?.querySelector('input[role="combobox"], input[aria-autocomplete]')) as HTMLElement | null;
      if (trigger) openedTrigger = { el: trigger, at: Date.now() };
    },
    true
  );
}

/** True when the recruiter changed this field by hand on this page. */
export function isUserEdited(field: AutoFillExtractedField): boolean {
  const els = [field.element, ...(field.optionElements || []).map((o) => o.element)].filter(Boolean) as HTMLElement[];
  if (els.some((el) => touched.has(el))) return true;
  if ((field.type === 'radio_group' || field.type === 'checkbox_group' || field.type === 'checkbox') && field.name && touchedNames.has(field.name)) {
    return true;
  }
  const question = normalizeText(field.question || field.label);
  return Boolean(question) && touchedQuestions.has(question);
}

/** Milliseconds since the recruiter last typed, clicked or changed something on the page. */
export function msSinceUserActivity(): number {
  return lastActivityAt ? Date.now() - lastActivityAt : Number.POSITIVE_INFINITY;
}

/** The element that has the keyboard focus, looking inside shadow roots. */
export function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** The text box the recruiter is working in right now (focused, and they clicked or typed in it). */
export function userTypingTarget(): HTMLElement | null {
  const active = deepActiveElement();
  if (!active || !lastPointed || isOwnUi(active)) return null;
  if (active !== lastPointed && !active.contains(lastPointed) && !lastPointed.contains(active)) return null;
  return active.matches(TEXT_ENTRY_SELECTOR) ? (active as HTMLElement) : null;
}
