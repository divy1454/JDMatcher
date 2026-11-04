/**
 * Finds every question on the page that the engine can answer.
 *
 * - Radio buttons that share a name become ONE question with options (radio_group).
 * - Checkboxes that share a name (or sit in a named group) become ONE multi-select question.
 * - Workday-style dropdown buttons, ARIA radios/checkboxes and comboboxes are detected too.
 * - Open shadow roots are searched; JDMatcher's own widget is always skipped.
 */
import { AutoFillExtractedField, AutoFillFieldType } from '../content/types';
import {
  collectSearchRoots,
  composedClosest,
  isOwnUi,
  isRendered,
  isPerceivable,
  isDisabled,
  commonAncestor,
  textOf,
  textWithoutControls,
  SearchRoot,
} from './dom-utils';
import { extractQuestionForElement, extractGroupQuestion, extractOptionLabel } from './label-extractor';
import { isPlaceholderOption } from './option-matcher';
import { cleanLabel } from './text-utils';
import { knownAtsSite } from './ats-sites';

/** The ATS behind the form ("greenhouse", "workday", "jobdiva", ...), or 'generic' for any other site. */
export type SupportedATS = string;

export interface FormDetectionResult {
  isJobApplication: boolean;
  platform: SupportedATS;
  formElement: HTMLElement | null;
  fields: AutoFillExtractedField[];
}

export interface ScanOptions {
  /**
   * Accept a page with only one or two questions. Used when the recruiter pressed Fill Form, and on
   * later pages of a run, where a short page ("immigration status" + "anything else?") is still the form.
   */
  lenient?: boolean;
}

/** Identifies the ATS platform hosting the application form. */
export function detectPlatform(): SupportedATS {
  const url = window.location.href.toLowerCase();

  // Forms embedded on company career sites carry their ATS markup with them
  if (url.includes('gh_jid') || document.querySelector('#application_form, [data-mapped-application-form]')) return 'greenhouse';
  if (document.querySelector('.application-form, .postings-btn-wrapper')) return 'lever';
  if (document.querySelector('[data-automation-id="workdayApplication"], [data-automation-id="applicationPage"]')) return 'workday';
  if (document.querySelector('.jobs-easy-apply-modal, .jobs-apply-form')) return 'linkedin';
  if (document.querySelector('[data-cy="apply-button"], #applyJob')) return 'dice';
  if (document.querySelector('.iCIMS_JobsTable, .iCIMS_JobContent')) return 'icims';
  return knownAtsSite() || 'generic';
}

/**
 * Field names that must NEVER be filled: security fields, payment fields, site search bars and
 * honeypot traps. Patterns use separators so normal words ("php_years") are not caught.
 */
const BLOCKED_NAME_PATTERNS = [
  /password/i,
  /captcha/i,
  /recaptcha/i,
  /turnstile/i,
  /csrf/i,
  /(^|[_\-.])token($|[_\-.])/i,
  /^q$/i,
  /^query$/i,
  /^search$/i,
  /(^|[_\-.\s])search($|[_\-.\s])/i,
  /card_?number/i,
  /\bcvv\b|(^|[_\-])cvv($|[_\-])/i,
  /(^|[_\-])cc_/i,
  /billing/i,
  /(^|[_\-])otp($|[_\-])/i,
  /auth_code/i,
  // Honeypot traps
  /honey_?pot/i,
  /(^|[_\-])hp($|[_\-])/i,
  /bot_?field/i,
  /bot_?trap/i,
  /fake_?field/i,
  /decoy/i,
];

function isBlockedControl(el: HTMLElement): boolean {
  const type = ((el as HTMLInputElement).type || '').toLowerCase();
  if (type === 'password' || type === 'search') return true;
  if (composedClosest(el, '[role="search"]')) return true;
  const name = el.getAttribute('name') || el.id || '';
  const autocomplete = el.getAttribute('autocomplete') || '';
  const placeholder = el.getAttribute('placeholder') || '';
  // Workday multi-selects use a search box inside a labelled form field; those are real questions.
  const isQuestionSearchBox =
    Boolean(el.closest('[data-automation-id*="formField"]')) ||
    el.getAttribute('role') === 'combobox' ||
    el.getAttribute('aria-autocomplete') === 'list';
  return BLOCKED_NAME_PATTERNS.some((pat) => {
    if (isQuestionSearchBox && pat.source.includes('search')) return false;
    return pat.test(name) || pat.test(placeholder) || pat.test(autocomplete);
  });
}

/**
 * Anti-honeypot visibility check for single controls. Invisible, off-screen or transparent text
 * fields are skipped so hidden traps cannot harvest candidate data. File inputs are often hidden
 * behind a styled upload button, so they are allowed.
 */
export function isElementVisible(el: HTMLElement): boolean {
  const isFileInput = el instanceof HTMLInputElement && el.type === 'file';
  if (isFileInput) return el.isConnected && !composedClosest(el, '[hidden]');
  if (el instanceof HTMLSelectElement && !isPerceivable(el)) {
    // select2/chosen hide the real <select> next to a visible widget
    const widget = el.nextElementSibling;
    return Boolean(widget && widget.matches('.select2, .select2-container, .chosen-container') && isRendered(widget));
  }
  return isPerceivable(el);
}

/** A radio/checkbox counts as visible when it or its label is on screen (custom-styled inputs hide the box). */
function isOptionVisible(el: HTMLElement): boolean {
  if (isRendered(el)) return true;
  const labels = (el as HTMLInputElement).labels;
  return Boolean(labels && Array.from(labels).some((l) => isRendered(l)));
}

const DROPDOWN_PLACEHOLDER_RE = /^(select( one)?|select\.\.\.|choose( one)?|please select|--+|none)$/i;

const keyIds = new WeakMap<object, number>();
let keyCounter = 0;
function keyOf(obj: object): number {
  let id = keyIds.get(obj);
  if (id === undefined) {
    id = ++keyCounter;
    keyIds.set(obj, id);
  }
  return id;
}

function isRequiredControl(el: HTMLElement, container?: Element | null): boolean {
  if ((el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true') return true;
  const labels = (el as HTMLInputElement).labels;
  if (labels && Array.from(labels).some((l) => /\*|\brequired\b/i.test(l.textContent || ''))) return true;
  const scope = container || el.closest('[data-automation-id*="formField"], .field, .form-group, .application-question, fieldset');
  if (scope) {
    if (scope.getAttribute('aria-required') === 'true') return true;
    if (scope.querySelector('[aria-required="true"], abbr[title*="required" i], .required, [class*="required"]')) return true;
    const lead = textWithoutControls(scope.querySelector('legend, label, [data-automation-id*="formLabel"]'));
    if (/\*/.test(lead)) return true;
  }
  return false;
}

function isComboboxInput(el: HTMLInputElement): boolean {
  const role = el.getAttribute('role');
  const autocomplete = el.getAttribute('aria-autocomplete');
  return (
    role === 'combobox' ||
    autocomplete === 'list' ||
    autocomplete === 'both' ||
    el.classList.contains('select__input') ||
    /^react-select-.*-input$/.test(el.id) ||
    Boolean(el.closest('.select__control, [class*="select__control"], .select2-search'))
  );
}

function textInputType(el: HTMLInputElement): AutoFillFieldType {
  return isComboboxInput(el) ? 'combobox' : 'text';
}

/** Reads what the field currently holds as display text ('' when empty). */
export function readFieldValue(field: AutoFillExtractedField): string {
  const el = field.element;
  if (!el) return '';
  switch (field.type) {
    case 'radio_group': {
      const chosen = (field.optionElements || []).find((o) =>
        field.isAria ? o.element.getAttribute('aria-checked') === 'true' : (o.element as HTMLInputElement).checked
      );
      return chosen ? chosen.label : '';
    }
    case 'checkbox_group':
      return (field.optionElements || [])
        .filter((o) => (field.isAria ? o.element.getAttribute('aria-checked') === 'true' : (o.element as HTMLInputElement).checked))
        .map((o) => o.label)
        .join('; ');
    case 'checkbox':
      if (field.isAria) return el.getAttribute('aria-checked') === 'true' ? 'checked' : '';
      return (el as HTMLInputElement).checked ? 'checked' : '';
    case 'select': {
      const sel = el as HTMLSelectElement;
      const opt = sel.options[sel.selectedIndex];
      return opt && !isPlaceholderOption(opt.text) ? cleanLabel(opt.text) : '';
    }
    case 'dropdown_button': {
      const txt = textOf(el);
      return txt && !DROPDOWN_PLACEHOLDER_RE.test(txt) ? txt : '';
    }
    case 'combobox': {
      const control = el.closest('.select__control, [class*="select__control"], [class*="-control"]');
      const single = control?.querySelector('.select__single-value, [class*="singleValue"], [class*="single-value"]');
      if (single && textOf(single)) return textOf(single);
      const multi = control?.querySelectorAll('.select__multi-value__label, [class*="multiValue"] [class*="label"]');
      if (multi && multi.length) return Array.from(multi).map((m) => textOf(m)).join('; ');
      return (el as HTMLInputElement).value || '';
    }
    case 'file': {
      const input = el as HTMLInputElement;
      return input.files && input.files.length > 0 ? input.files[0].name : '';
    }
    default:
      return (el as HTMLInputElement).value || '';
  }
}

export function isFieldFilled(field: AutoFillExtractedField): boolean {
  if (field.type === 'checkbox') return false; // an unchecked box can be a valid answer
  return readFieldValue(field).trim().length > 0;
}

interface PendingGroup {
  kind: 'radio' | 'checkbox' | 'aria-radio';
  key: string;
  name: string;
  elements: HTMLElement[];
}

const CANDIDATE_SELECTOR = [
  'input',
  'select',
  'textarea',
  '[role="radio"]',
  '[role="checkbox"]',
  'button[aria-haspopup="listbox"]',
  '[role="button"][aria-haspopup="listbox"]',
  '[role="combobox"]',
].join(', ');

/** Scans the current document/frame (including open shadow roots) for application questions. */
export function scanApplicationForm(root: Document | HTMLElement = document, opts: ScanOptions = {}): FormDetectionResult {
  const platform = detectPlatform();
  const roots: Array<SearchRoot | HTMLElement> = root instanceof Document ? collectSearchRoots(root) : [root];
  const fields: AutoFillExtractedField[] = [];
  let index = 0;

  roots.forEach((searchRoot, rootIndex) => {
    // Ordered list of entries: single controls or groups (created at first sighting)
    const entries: Array<HTMLElement | PendingGroup> = [];
    const groups = new Map<string, PendingGroup>();

    const addToGroup = (kind: PendingGroup['kind'], key: string, name: string, el: HTMLElement) => {
      let g = groups.get(key);
      if (!g) {
        g = { kind, key, name, elements: [] };
        groups.set(key, g);
        entries.push(g);
      }
      g.elements.push(el);
    };

    const candidates = Array.from(searchRoot.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR));
    for (const el of candidates) {
      if (isOwnUi(el) || isDisabled(el)) continue;

      if (el instanceof HTMLInputElement) {
        const type = (el.type || 'text').toLowerCase();
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
        if (isBlockedControl(el)) continue;
        const formKey = el.form ? `f${keyOf(el.form)}` : 'nf';
        if (type === 'radio') {
          const groupBox = el.closest('fieldset, [role="radiogroup"]') || el.parentElement?.parentElement || el.parentElement;
          const key = el.name ? `r${rootIndex}|${formKey}|radio|${el.name}` : `r${rootIndex}|radio|box${keyOf(groupBox || el)}`;
          addToGroup('radio', key, el.name, el);
          continue;
        }
        if (type === 'checkbox') {
          const named = el.name && el.name.trim() !== '';
          const box = el.closest('fieldset, [role="group"]');
          const key = named ? `r${rootIndex}|${formKey}|cb|${el.name}` : box ? `r${rootIndex}|cb|box${keyOf(box)}` : `r${rootIndex}|cb|single${keyOf(el)}`;
          addToGroup('checkbox', key, el.name, el);
          continue;
        }
        if (el.readOnly && type !== 'file') continue;
        entries.push(el);
        continue;
      }

      if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        if (isBlockedControl(el)) continue;
        if (el instanceof HTMLTextAreaElement && el.readOnly) continue;
        entries.push(el);
        continue;
      }

      const role = el.getAttribute('role');
      if (role === 'radio') {
        const box = el.closest('[role="radiogroup"]') || el.parentElement;
        addToGroup('aria-radio', `r${rootIndex}|aria|${keyOf(box || el)}`, '', el);
        continue;
      }
      if (role === 'checkbox') {
        entries.push(el);
        continue;
      }
      // Dropdown buttons and non-input comboboxes (Workday "Select One")
      if (el.getAttribute('aria-haspopup') === 'listbox' || (role === 'combobox' && !el.querySelector('input'))) {
        entries.push(el);
      }
    }

    // A named checkbox "group" with a single box is really a single checkbox
    for (const entry of entries) {
      if (entry instanceof HTMLElement) {
        const field = buildSingleField(entry, index);
        if (field) {
          fields.push(field);
          index++;
        }
        continue;
      }
      if (entry.kind === 'checkbox' && entry.elements.length === 1) {
        const field = buildSingleField(entry.elements[0], index);
        if (field) {
          fields.push(field);
          index++;
        }
        continue;
      }
      const field = buildGroupField(entry, index);
      if (field) {
        fields.push(field);
        index++;
      }
    }
  });

  const formElement =
    (root instanceof Document ? root : root.ownerDocument || document).querySelector<HTMLElement>(
      'form, #application_form, .application-form, [data-automation-id="workdayApplication"], .jobs-easy-apply-modal, .jobs-apply-form, main, [role="main"]'
    ) || (root instanceof Document ? root.body : root);

  const hasFileInput = fields.some((f) => f.type === 'file');
  const hasAppSignals = fields.length >= 3 || platform !== 'generic';
  const isJobApplication = fields.length > 0 && (Boolean(opts.lenient) || hasFileInput || hasAppSignals);

  return { isJobApplication, platform, formElement, fields };
}

function buildSingleField(el: HTMLElement, index: number): AutoFillExtractedField | null {
  let type: AutoFillFieldType;
  let options: string[] | undefined;
  let isAria = false;
  const role = el.getAttribute('role');

  if (el instanceof HTMLTextAreaElement) {
    type = 'textarea';
  } else if (el instanceof HTMLSelectElement) {
    type = 'select';
    options = Array.from(el.options)
      .map((o) => cleanLabel(o.text))
      .filter((t) => !isPlaceholderOption(t));
  } else if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase();
    if (t === 'file') type = 'file';
    else if (t === 'checkbox') type = 'checkbox';
    else type = textInputType(el);
  } else if (role === 'checkbox') {
    type = 'checkbox';
    isAria = true;
  } else {
    type = 'dropdown_button';
  }

  // Visibility / honeypot checks
  if (type === 'checkbox' && !isAria) {
    if (!isOptionVisible(el)) return null;
  } else if (type === 'dropdown_button' || isAria) {
    if (!isRendered(el)) return null;
  } else if (!isElementVisible(el)) {
    return null;
  }

  let question: string;
  if (type === 'checkbox') {
    // A lone box labelled "Yes" needs the question above it to make sense
    const boxLabel = extractOptionLabel(el);
    const short = boxLabel.split(/\s+/).filter(Boolean).length <= 3;
    const context = short ? extractGroupQuestion([el], [boxLabel]) : '';
    question = context ? `${context} (${boxLabel})` : boxLabel || extractQuestionForElement(el);
    options = boxLabel ? [boxLabel] : undefined;
  } else {
    question = extractQuestionForElement(el);
  }
  if (type === 'dropdown_button' && !question) return null; // unlabeled menus are site navigation, not questions

  const input = el as HTMLInputElement;
  const field: AutoFillExtractedField = {
    id: el.id || el.getAttribute('name') || `jdm_field_${index}`,
    elementIndex: index,
    name: el.getAttribute('name') || el.id || '',
    label: question,
    question,
    type,
    options,
    placeholder: el.getAttribute('placeholder') || '',
    isRequired: isRequiredControl(el),
    currentValue: '',
    element: el,
    container: (el.closest('[data-automation-id*="formField"], .field, .form-group, .application-question') as HTMLElement) || el,
    isAria,
    inputType: el instanceof HTMLInputElement ? (el.type || 'text').toLowerCase() : undefined,
    maxLength: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? (input.maxLength > 0 ? input.maxLength : undefined) : undefined,
    autocomplete: el.getAttribute('autocomplete') || undefined,
  };
  field.currentValue = readFieldValue(field);
  return field;
}

function buildGroupField(group: PendingGroup, index: number): AutoFillExtractedField | null {
  const els = group.elements;
  if (!els.some((e) => isOptionVisible(e))) return null;

  const optionLabels = els.map((e) => extractOptionLabel(e));
  const question = extractGroupQuestion(els, optionLabels);
  const container =
    (els[0].closest('fieldset, [role="radiogroup"], [role="group"]') as HTMLElement | null) ||
    commonAncestor(els) ||
    els[0];
  const isAria = group.kind === 'aria-radio';
  const type: AutoFillFieldType = group.kind === 'checkbox' ? 'checkbox_group' : 'radio_group';

  const field: AutoFillExtractedField = {
    id: `group:${group.name || els[0].id || index}`,
    elementIndex: index,
    name: group.name,
    label: question,
    question,
    type,
    options: optionLabels,
    optionElements: els.map((element, i) => ({ label: optionLabels[i], element })),
    placeholder: '',
    isRequired: els.some((e) => isRequiredControl(e, container)),
    currentValue: '',
    element: els[0],
    container,
    isAria,
  };
  field.currentValue = readFieldValue(field);
  return field;
}
