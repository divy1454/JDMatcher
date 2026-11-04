/**
 * Puts an answer into a field and checks that it actually stuck.
 *
 * Every filler returns { ok, reason, optionsSeen }. A fill is only reported as successful when the
 * page shows the chosen value afterwards, so "filled" in the stats means filled on screen.
 */
import { CandidateAutoFillProfile, AutoFillExtractedField, AutoFillFieldResult } from '../content/types';
import { normalizeText, cleanLabel } from './text-utils';
import { matchOption, isPlaceholderOption, answerToChecked, scoreOption, highestOptionIndex } from './option-matcher';
import {
  deepQueryAll,
  getByIdNear,
  isOwnUi,
  isRendered,
  simulateClick,
  pressKey,
  sleep,
  textOf,
  waitFor,
} from './dom-utils';

export interface InjectResult {
  ok: boolean;
  reason?: string;
  /** Options the engine saw while trying (sent to the AI when the profile answer did not fit). */
  optionsSeen?: string[];
}

const ok = (): InjectResult => ({ ok: true });
const fail = (reason: string, optionsSeen?: string[]): InjectResult => ({ ok: false, reason, optionsSeen });

const SUBMIT_TEXT_RE =
  /^(submit|submit application|submit my application|submit your application|apply|apply now|send|send application|finish|finish application|complete|complete application|review and submit|confirm and submit|place order|pay)\b/;

/** True for buttons that would submit the application. The engine never clicks these. */
export function isBlockedSubmitElement(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement && (element.type === 'submit' || element.type === 'image')) {
    return SUBMIT_TEXT_RE.test(normalizeText(element.value || 'submit'));
  }
  const text = normalizeText(element.innerText || element.getAttribute('value') || element.getAttribute('aria-label') || '');
  return SUBMIT_TEXT_RE.test(text);
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Framework-safe value setter for React, Angular, Vue and Workday inputs. */
export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  const previous = element.value;
  if (setter) setter.call(element, value);
  else element.value = value;
  // React compares against its value tracker; make sure it sees a change
  const tracker = (element as any)._valueTracker;
  if (tracker) tracker.setValue(previous === value ? '' : previous);
  let inputEvent: Event;
  try {
    inputEvent = new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value });
  } catch {
    inputEvent = new Event('input', { bubbles: true });
  }
  element.dispatchEvent(inputEvent);
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Slow path: types character by character for sites that ignore a direct value change. */
async function typeText(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  setNativeValue(el, '');
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true }));
    setNativeValue(el, value.slice(0, i + 1));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
    if (i % 25 === 24) await sleep(0);
  }
}

async function fillText(el: HTMLInputElement | HTMLTextAreaElement, raw: string): Promise<InjectResult> {
  let value = raw;
  const type = el instanceof HTMLInputElement ? (el.type || 'text').toLowerCase() : 'textarea';
  if (type === 'number') {
    const n = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!n) return fail('This field needs a number.');
    value = n[0];
  }
  if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail('This field needs a date.');
  if (type === 'email' && !/@/.test(value)) return fail('This field needs an email address.');
  if (el.maxLength > 0 && value.length > el.maxLength) value = value.slice(0, el.maxLength);

  try {
    el.focus({ preventScroll: true });
  } catch {
    // ignore
  }
  setNativeValue(el, value);
  await sleep(40);
  if (el.value !== value) await typeText(el, value);
  try {
    el.blur();
  } catch {
    // ignore
  }
  await sleep(20);
  return el.value.trim() ? ok() : fail('The site cleared the value.');
}

/** How to choose when the answer isn't a plain option text: the highest number, or fallbacks in order. */
interface Choice {
  pick?: 'highest';
  alternatives?: string[];
}

function choose(labels: string[], target: string, how: Choice = {}): ReturnType<typeof matchOption> {
  if (how.pick === 'highest') {
    const i = highestOptionIndex(labels);
    if (i !== null) return { option: labels[i], index: i, score: 100, ambiguous: false };
  }
  let m = matchOption(labels, target);
  for (const alt of how.alternatives || []) {
    if (m && !m.ambiguous) break;
    m = matchOption(labels, alt);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Native select
// ---------------------------------------------------------------------------

function fillSelect(sel: HTMLSelectElement, target: string, how: Choice = {}): InjectResult {
  const texts = Array.from(sel.options).map((o) => cleanLabel(o.text));
  const optionsSeen = texts.filter((t) => !isPlaceholderOption(t));
  const m = choose(texts, target, how);
  if (!m) return fail(`No option matches "${target}".`, optionsSeen);
  if (m.ambiguous) return fail(`More than one option could mean "${target}".`, optionsSeen);

  try {
    sel.focus({ preventScroll: true });
  } catch {
    // ignore
  }
  const optValue = sel.options[m.index].value;
  const valueIsUnique = Array.from(sel.options).filter((o) => o.value === optValue).length === 1;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  if (valueIsUnique && setter) setter.call(sel, optValue);
  else sel.selectedIndex = m.index;
  sel.options[m.index].selected = true;
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  try {
    sel.blur();
  } catch {
    // ignore
  }
  return sel.selectedIndex === m.index ? ok() : fail('The selection did not stick.', optionsSeen);
}

// ---------------------------------------------------------------------------
// Radios and checkboxes
// ---------------------------------------------------------------------------

function nativeCheckedSet(input: HTMLInputElement, checked: boolean): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
  if (setter) setter.call(input, checked);
  else input.checked = checked;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Sets a checkbox/radio to the wanted state with ONE real click (a click already toggles it;
 * setting `checked` first and then clicking undoes the change).
 */
async function setChecked(el: HTMLElement, desired: boolean, isAria: boolean): Promise<boolean> {
  if (isAria) {
    const state = () => el.getAttribute('aria-checked') === 'true';
    if (state() !== desired) simulateClick(el);
    return Boolean(await waitFor(() => state() === desired, 800));
  }
  const input = el as HTMLInputElement;
  if (input.checked === desired) return true;
  input.click();
  if (input.checked !== desired) {
    const label = input.labels && input.labels[0];
    if (label) label.click();
  }
  if (input.checked !== desired) nativeCheckedSet(input, desired);
  return input.checked === desired;
}

async function fillRadioGroup(field: AutoFillExtractedField, target: string, how: Choice = {}): Promise<InjectResult> {
  const options = field.optionElements || [];
  const labels = options.map((o) => o.label);
  const m = choose(labels, target, how);
  if (!m) return fail(`No option matches "${target}".`, labels);
  if (m.ambiguous) return fail(`More than one option could mean "${target}".`, labels);
  const done = await setChecked(options[m.index].element, true, Boolean(field.isAria));
  return done ? ok() : fail('The option could not be selected.', labels);
}

function splitMulti(value: string, options: string[]): string[] {
  const bySeparator = value.split(/[;|\n]/).map((s) => s.trim()).filter(Boolean);
  if (bySeparator.length > 1) return bySeparator;
  const byComma = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (byComma.length > 1 && byComma.every((part) => matchOption(options, part))) return byComma;
  return bySeparator;
}

async function fillCheckboxGroup(field: AutoFillExtractedField, result: AutoFillFieldResult): Promise<InjectResult> {
  const options = field.optionElements || [];
  const labels = options.map((o) => o.label);
  const wanted = result.values && result.values.length ? result.values : splitMulti(result.value, labels);
  const chosen = new Set<number>();
  for (const w of wanted) {
    const m = matchOption(labels, w);
    if (m && !m.ambiguous) chosen.add(m.index);
  }
  if (chosen.size === 0 && wanted.length > 0) return fail('None of the answers match the options.', labels);
  let allSet = true;
  for (let i = 0; i < options.length; i++) {
    const desired = chosen.has(i);
    const done = await setChecked(options[i].element, desired, Boolean(field.isAria));
    if (!done) allSet = false;
  }
  return allSet ? ok() : fail('Some boxes could not be changed.', labels);
}

// ---------------------------------------------------------------------------
// Listboxes (Workday dropdown buttons, ARIA comboboxes)
// ---------------------------------------------------------------------------

function visibleListboxes(): HTMLElement[] {
  return deepQueryAll<HTMLElement>('[role="listbox"], [data-automation-id="activeListContainer"]').filter(
    (b) => isRendered(b) && !isOwnUi(b)
  );
}

function optionElementsIn(container: HTMLElement): HTMLElement[] {
  const pick = (selector: string) =>
    Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((o) => isRendered(o) && textOf(o));
  let els = pick('[role="option"]');
  if (els.length === 0) els = pick('[data-automation-id="promptOption"], [data-automation-id*="menuItem"]');
  if (els.length === 0) els = pick('li');
  return els;
}

function findOpenListbox(trigger: HTMLElement, before: Set<HTMLElement>): HTMLElement | null {
  for (const attr of ['aria-controls', 'aria-owns']) {
    const id = trigger.getAttribute(attr);
    if (id) {
      const el = getByIdNear(trigger, id);
      if (el && isRendered(el)) return el;
    }
  }
  const fresh = visibleListboxes().filter((b) => !before.has(b));
  return fresh.length ? fresh[fresh.length - 1] : null;
}

async function openListbox(trigger: HTMLElement): Promise<{ listbox: HTMLElement | null; options: HTMLElement[] }> {
  const before = new Set(visibleListboxes());
  simulateClick(trigger);
  let listbox = await waitFor(() => findOpenListbox(trigger, before), 1500);
  if (!listbox) {
    // Some widgets open on keyboard only
    pressKey(trigger, 'ArrowDown');
    pressKey(trigger, 'Enter');
    listbox = await waitFor(() => findOpenListbox(trigger, before), 1000);
  }
  if (!listbox) return { listbox: null, options: [] };
  const options = (await waitFor(() => {
    const els = optionElementsIn(listbox!);
    return els.length ? els : null;
  }, 2000)) || [];
  return { listbox, options };
}

async function closeListbox(trigger: HTMLElement, listbox: HTMLElement | null): Promise<void> {
  const active = (document.activeElement as HTMLElement) || trigger;
  pressKey(active, 'Escape');
  await sleep(120);
  if (listbox && isRendered(listbox)) {
    simulateClick(trigger);
    await sleep(120);
  }
}

async function fillDropdownButton(btn: HTMLElement, target: string, how: Choice = {}): Promise<InjectResult> {
  const before = textOf(btn);
  const { listbox, options } = await openListbox(btn);
  if (!listbox) return fail('The dropdown did not open.');
  const texts = options.map((o) => textOf(o));
  const m = choose(texts, target, how);
  if (!m || m.ambiguous) {
    await closeListbox(btn, listbox);
    return fail(m ? `More than one option could mean "${target}".` : `No option matches "${target}".`, texts);
  }
  const optionEl = options[m.index];
  const inner = optionEl.querySelector<HTMLElement>('[data-automation-id="promptOption"]');
  simulateClick(inner || optionEl);
  const changed = await waitFor(() => {
    const now = textOf(btn);
    return (now !== before && now !== '') || !isRendered(listbox);
  }, 1500);
  const shown = textOf(btn);
  if (changed && scoreOption(m.option, shown) >= 70) return ok();
  if (changed && !isRendered(listbox) && shown !== before) return ok();
  await closeListbox(btn, listbox);
  return fail('The selection did not stick.', texts);
}

// ---------------------------------------------------------------------------
// Input comboboxes (React-Select, typeahead location fields)
// ---------------------------------------------------------------------------

interface SeenOption {
  el: HTMLElement;
  text: string;
}

function comboboxControl(input: HTMLElement): HTMLElement {
  return (
    (input.closest('.select__control, [class*="select__control"], [class*="-control"], .select2-selection') as HTMLElement) ||
    input
  );
}

function comboboxOptions(input: HTMLElement): SeenOption[] {
  const toSeen = (els: HTMLElement[]) => els.map((el) => ({ el, text: textOf(el) })).filter((o) => o.text);
  for (const attr of ['aria-controls', 'aria-owns']) {
    const id = input.getAttribute(attr);
    if (id) {
      const lb = getByIdNear(input, id);
      if (lb && isRendered(lb)) {
        const els = optionElementsIn(lb);
        if (els.length) return toSeen(els);
      }
    }
  }
  const container = input.closest('.select__container, [class*="-container"], .select-shell, [class*="select"]');
  if (container) {
    const els = Array.from(container.querySelectorAll<HTMLElement>('.select__option, [class*="-option"], [role="option"]')).filter((o) => isRendered(o));
    if (els.length) return toSeen(els);
  }
  return toSeen(deepQueryAll<HTMLElement>('[role="option"]').filter((o) => isRendered(o) && !isOwnUi(o)));
}

function comboboxDisplay(input: HTMLInputElement): string {
  const control = comboboxControl(input);
  const single = control.querySelector('.select__single-value, [class*="singleValue"], [class*="single-value"]');
  if (single && textOf(single)) return textOf(single);
  return input.value || '';
}

/** What to type into a search box: the first part of the answer ("Austin, Texas" -> "Austin"). */
function searchQuery(target: string): string {
  const head = cleanLabel(target).split(',')[0];
  return head.split(/\s+/).filter(Boolean).slice(0, 3).join(' ').slice(0, 30);
}

async function openCombobox(input: HTMLInputElement): Promise<SeenOption[]> {
  try {
    input.focus({ preventScroll: true });
  } catch {
    // ignore
  }
  const control = comboboxControl(input);
  control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  pressKey(input, 'ArrowDown');
  return (await waitFor(() => {
    const opts = comboboxOptions(input);
    return opts.length ? opts : null;
  }, 900)) || [];
}

async function closeCombobox(input: HTMLInputElement): Promise<void> {
  pressKey(input, 'Escape');
  await sleep(60);
  try {
    input.blur();
  } catch {
    // ignore
  }
}

async function fillCombobox(input: HTMLInputElement, target: string, how: Choice = {}): Promise<InjectResult> {
  let options = await openCombobox(input);
  let m = options.length ? choose(options.map((o) => o.text), target, how) : null;

  if (!m || m.ambiguous) {
    // Long or async lists: type part of the answer to search
    const typed = searchQuery(target);
    setNativeValue(input, typed);
    const settled = await waitFor(() => {
      const opts = comboboxOptions(input);
      const best = opts.length ? matchOption(opts.map((o) => o.text), target) : null;
      return best && !best.ambiguous ? { opts, best } : null;
    }, 3500, 120);
    if (settled) {
      options = settled.opts;
      m = settled.best;
    } else {
      options = comboboxOptions(input);
      m = null;
    }
  }

  if (!m || m.ambiguous) {
    const seen = options.map((o) => o.text);
    setNativeValue(input, '');
    await closeCombobox(input);
    return fail(`No option matches "${target}".`, seen);
  }

  simulateClick(options[m.index].el);
  await sleep(180);
  const shown = comboboxDisplay(input);
  if (shown && scoreOption(m.option, shown) >= 70) return ok();
  if (!comboboxOptions(input).length && shown) return ok();
  return fail('The selection did not stick.', options.map((o) => o.text));
}

// ---------------------------------------------------------------------------
// Resume upload
// ---------------------------------------------------------------------------

/** Converts the stored base64 resume to a File and attaches it to an <input type="file">. */
export function injectResumeFile(element: HTMLInputElement, profile: CandidateAutoFillProfile): boolean {
  if (!profile.resumeFileBase64) return false;
  if (element.files && element.files.length > 0) {
    element.setAttribute('data-jdm-file-injected', 'true');
    return true;
  }
  if (element.getAttribute('data-jdm-file-injected') === 'true') return true;
  try {
    const base64Data = profile.resumeFileBase64.includes(',') ? profile.resumeFileBase64.split(',')[1] : profile.resumeFileBase64;
    const binary = window.atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const mimeType = profile.resumeMimeType || 'application/pdf';
    const fileName = profile.resumeFileName || `${profile.fullName.replace(/\s+/g, '_')}_Resume.pdf`;
    const file = new File([bytes], fileName, { type: mimeType });
    const dt = new DataTransfer();
    dt.items.add(file);
    element.files = dt.files;
    element.setAttribute('data-jdm-file-injected', 'true');
    element.setAttribute('data-jdm-autofilled', 'true');
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return Boolean(element.files && element.files.length > 0);
  } catch (err) {
    console.error('JDMatcher Auto-Fill: Failed to inject resume file:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Fills one field with a resolved answer and verifies it. */
export async function injectField(
  field: AutoFillExtractedField,
  result: Pick<AutoFillFieldResult, 'value' | 'values' | 'pick' | 'alternatives'>,
  profile: CandidateAutoFillProfile
): Promise<InjectResult> {
  const el = field.element;
  if (!el) return fail('Field is gone from the page.');
  if (!el.isConnected) return fail('Field is gone from the page.');
  const value = (result.value || '').trim();
  const how: Choice = { pick: result.pick, alternatives: result.alternatives };

  switch (field.type) {
    case 'text':
    case 'textarea':
      if (!value) return fail('Empty answer.');
      return fillText(el as HTMLInputElement | HTMLTextAreaElement, value);
    case 'select':
      return fillSelect(el as HTMLSelectElement, value, how);
    case 'radio_group':
      return fillRadioGroup(field, value, how);
    case 'checkbox_group':
      return fillCheckboxGroup(field, { ...result, value } as AutoFillFieldResult);
    case 'checkbox': {
      const desired = answerToChecked(value);
      if (desired === null) return fail(`"${value}" is not a yes/no answer for a checkbox.`);
      const done = await setChecked(el, desired, Boolean(field.isAria));
      return done ? ok() : fail('The checkbox could not be changed.');
    }
    case 'dropdown_button':
      return fillDropdownButton(el, value, how);
    case 'combobox':
      return fillCombobox(el as HTMLInputElement, value, how);
    case 'file':
      if (value !== '__RESUME_FILE__') return fail('Only the resume is uploaded automatically.');
      return injectResumeFile(el as HTMLInputElement, profile) ? ok() : fail('The resume could not be attached.');
    default:
      return fail('Unsupported field type.');
  }
}

/** Opens a dropdown/combobox just long enough to read its options (for the AI). */
export async function readLazyOptions(field: AutoFillExtractedField): Promise<string[]> {
  const el = field.element;
  if (!el || !el.isConnected) return [];
  if (field.type === 'dropdown_button') {
    const { listbox, options } = await openListbox(el);
    const texts = options.map((o) => textOf(o)).filter((t) => t && !isPlaceholderOption(t));
    await closeListbox(el, listbox);
    return texts;
  }
  if (field.type === 'combobox') {
    const options = await openCombobox(el as HTMLInputElement);
    await closeCombobox(el as HTMLInputElement);
    return options.map((o) => o.text).filter((t) => t && !isPlaceholderOption(t));
  }
  return field.options || [];
}

/** True when the answer can be checked against options before filling. */
export function answerFitsOptions(options: string[] | undefined, value: string): boolean {
  if (!options || options.length === 0) return true;
  const m = matchOption(options, value);
  return Boolean(m && !m.ambiguous);
}
