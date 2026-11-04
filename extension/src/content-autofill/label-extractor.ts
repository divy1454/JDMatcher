/**
 * Finds the human-readable question for a form control or a group of controls.
 *
 * For radio and checkbox groups the question is the group's legend/heading, never the
 * option label ("Yes"/"No"). Using the option label as the question was the root cause of
 * Yes/No questions being answered wrongly.
 */
import { cleanLabel, normalizeText } from './text-utils';
import { getByIdNear, textOf, textWithoutControls, commonAncestor } from './dom-utils';

export interface ExtractedLabelInfo {
  rawLabel: string;
  normalizedLabel: string;
  questionContext?: string;
}

/** Lowercase, trimmed, required asterisks and colons stripped. */
export function normalizeLabelText(text: string): string {
  return text
    .replace(/[*:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Removes required markers and trailing colons so the question reads cleanly. */
export function tidyQuestion(text: string): string {
  return cleanLabel(
    text
      .replace(/\(\s*required\s*\)/gi, '')
      .replace(/[*✱∗]+/g, '')
      // Workday-style aria-labels: "Country Select One Required"
      .replace(/\s+select one\b/gi, '')
      .replace(/\s+required\s*$/i, '')
      .replace(/\s*:\s*$/, '')
  );
}

const MAX_QUESTION_LENGTH = 400;

/**
 * Text that a dropdown or search box shows before anything is chosen ("Select", "Choose an option",
 * "Type to search"). It is never the question: a field labelled this way (seen on Rippling) was sent
 * to the AI as the question "Select".
 */
const GENERIC_TEXT =
  /^(please )?(select|choose|pick)( one| an option| an answer| option| your answer| from the list| here)?$|^(search|search here|type to search|start typing|type here|enter here|none selected|your answer)$/;

export function isGenericLabel(text: string | null | undefined): boolean {
  const norm = normalizeText(text);
  return !norm || GENERIC_TEXT.test(norm);
}

function usable(text: string): boolean {
  return text.length > 0 && text.length <= MAX_QUESTION_LENGTH && !/^[*\s]+$/.test(text) && !isGenericLabel(text);
}

function textFromIdRefs(el: Element, attr: string): string {
  const ids = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
  return cleanLabel(ids.map((id) => textWithoutControls(getByIdNear(el, id))).filter(Boolean).join(' '));
}

/** Label text from <label for>, a wrapping <label>, aria-labelledby or aria-label. */
function directLabel(el: HTMLElement): string {
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    const txt = cleanLabel(Array.from(labels).map((l) => textWithoutControls(l)).join(' '));
    if (usable(txt)) return txt;
  }
  if (el.id) {
    try {
      const root = el.getRootNode() as Document | ShadowRoot;
      const lbl = root.querySelector?.(`label[for="${CSS.escape(el.id)}"]`);
      const txt = textWithoutControls(lbl);
      if (usable(txt)) return txt;
    } catch {
      // ignore invalid ids
    }
  }
  const byRef = textFromIdRefs(el, 'aria-labelledby');
  if (usable(byRef)) return byRef;
  const aria = cleanLabel(el.getAttribute('aria-label'));
  if (usable(aria)) return aria;
  return '';
}

const QUESTION_CONTAINER_SELECTOR = [
  '[data-automation-id^="formField"]',
  '[data-automation-id*="formField"]',
  '.field',
  '.form-field',
  '.form-group',
  '.input-group',
  '.application-question',
  '.application-field',
  '.question',
  '[data-field]',
  'li',
].join(', ');

const CONTROL_SELECTOR =
  'input:not([type="hidden"]), select, textarea, button[aria-haspopup="listbox"], [role="radio"], [role="checkbox"], [role="combobox"]';

const STRONG_TEXT_SELECTOR =
  'legend, label, [data-automation-id*="formLabel"], [data-automation-id*="richText"], .label, .field-label, .question-text, .application-label, [class*="label"], [class*="Label"], h1, h2, h3, h4, h5, h6';
const WEAK_TEXT_SELECTOR = 'p, span, div, strong, b';

const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/**
 * The nearest text inside `container` that comes before `first` with no other form control
 * in between (so it cannot belong to a different question).
 */
function precedingTextInContainer(container: Element, group: Element[], exclude: Set<string>): string {
  const first = group[0];
  const otherControls = Array.from(container.querySelectorAll(CONTROL_SELECTOR)).filter(
    (c) => !group.some((g) => g === c || g.contains(c) || c.contains(g))
  );
  const pick = (selector: string): string => {
    let best = '';
    for (const node of Array.from(container.querySelectorAll(selector))) {
      if (node.contains(first) || !follows(node, first)) continue;
      if (node.querySelector('input, select, textarea, [role="radio"], [role="checkbox"]')) continue;
      if (otherControls.some((c) => follows(node, c) && follows(c, first))) continue;
      const txt = textWithoutControls(node);
      if (!usable(txt) || exclude.has(txt.toLowerCase())) continue;
      best = txt; // keep the nearest one
    }
    return best;
  };
  return pick(STRONG_TEXT_SELECTOR) || pick(WEAK_TEXT_SELECTOR);
}

/** Walks up from the control(s) and returns the nearest question-like text. */
function nearbyQuestion(group: HTMLElement[], exclude: Set<string> = new Set()): string {
  const first = group[0];
  let container: Element | null = first.closest(QUESTION_CONTAINER_SELECTOR) || first.parentElement;
  for (let depth = 0; container && depth < 4; depth++) {
    const txt = precedingTextInContainer(container, group, exclude);
    if (txt) return txt;
    if (container === document.body) break;
    container = container.parentElement;
  }
  return '';
}

/** Question text for a single control (text input, select, textarea, single checkbox, dropdown button). */
export function extractQuestionForElement(element: HTMLElement): string {
  const direct = directLabel(element);
  if (direct) return tidyQuestion(direct);

  const fieldset = element.closest('fieldset');
  const legendText = textWithoutControls(fieldset?.querySelector('legend'));
  if (usable(legendText) && fieldset!.querySelectorAll(CONTROL_SELECTOR).length === 1) return tidyQuestion(legendText);

  const near = nearbyQuestion([element]);
  if (near) return tidyQuestion(near);

  const placeholder = cleanLabel(element.getAttribute('placeholder'));
  if (placeholder && !isGenericLabel(placeholder)) return tidyQuestion(placeholder);

  const title = cleanLabel(element.getAttribute('title'));
  if (title && !isGenericLabel(title)) return tidyQuestion(title);

  return '';
}

/** Label of one option inside a radio/checkbox group ("Yes", "No", "Kubernetes"). */
export function extractOptionLabel(el: HTMLElement): string {
  const direct = directLabel(el);
  if (direct) return direct;
  if (el.getAttribute('role')) {
    const txt = textOf(el);
    if (usable(txt)) return txt;
  }
  // <input type="radio"> Yes   (text right after the input)
  let next: ChildNode | null = el.nextSibling;
  while (next) {
    const txt = cleanLabel(next.textContent);
    if (txt) return txt;
    next = next.nextSibling;
  }
  const value = cleanLabel((el as HTMLInputElement).value);
  if (value && value !== 'on') return value;
  return '';
}

/** Question text for a group of radios/checkboxes. */
export function extractGroupQuestion(elements: HTMLElement[], optionLabels: string[]): string {
  const exclude = new Set(optionLabels.map((o) => o.toLowerCase()));
  const first = elements[0];
  if (!first) return '';

  // 1. <fieldset><legend>
  const fieldset = first.closest('fieldset');
  if (fieldset && elements.every((e) => fieldset.contains(e))) {
    const legendText = textWithoutControls(fieldset.querySelector('legend'));
    if (usable(legendText)) return tidyQuestion(legendText);
  }

  // 2. role="radiogroup"/"group" with an accessible name
  const group = first.closest('[role="radiogroup"], [role="group"]');
  if (group && elements.every((e) => group.contains(e))) {
    const named = textFromIdRefs(group, 'aria-labelledby') || cleanLabel(group.getAttribute('aria-label'));
    if (usable(named)) return tidyQuestion(named);
  }

  // 3. Nearest text before the first option, inside the shared container or its parents
  let container: HTMLElement | null = commonAncestor(elements);
  for (let depth = 0; container && depth < 5; depth++) {
    const txt = precedingTextInContainer(container, elements, exclude);
    if (txt) return tidyQuestion(txt);
    if (container === document.body) break;
    container = container.parentElement;
  }
  return '';
}

/**
 * Backwards-compatible helper used by older callers.
 * For radios and checkboxes inside a fieldset the legend is returned as questionContext.
 */
export function extractElementLabel(element: HTMLElement): ExtractedLabelInfo {
  const question = extractQuestionForElement(element);
  let labelText = question;
  if (!labelText) {
    const nameAttr = element.getAttribute('name') || element.id || '';
    labelText = nameAttr
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-.[\]]+/g, ' ')
      .trim();
  }
  const legend = textWithoutControls(element.closest('fieldset')?.querySelector('legend'));
  return {
    rawLabel: labelText,
    normalizedLabel: normalizeLabelText(labelText),
    questionContext: legend ? normalizeLabelText(legend) : undefined,
  };
}
