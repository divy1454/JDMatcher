import { AutoFillExtractedField, AutoFillFieldType } from '../content/types';

export type SupportedATS = 'greenhouse' | 'lever' | 'workday' | 'linkedin' | 'dice' | 'icims' | 'generic';

export interface FormDetectionResult {
  isJobApplication: boolean;
  platform: SupportedATS;
  formElement: HTMLElement | null;
  fields: AutoFillExtractedField[];
}

/**
 * Identifies the ATS platform hosting the application form.
 */
export function detectPlatform(): SupportedATS {
  const url = window.location.href.toLowerCase();
  const host = window.location.hostname.toLowerCase();

  if (host.includes('greenhouse.io') || url.includes('gh_jid') || document.querySelector('#application_form, [data-mapped-application-form]')) {
    return 'greenhouse';
  }
  if (host.includes('lever.co') || document.querySelector('.application-form, .postings-btn-wrapper')) {
    return 'lever';
  }
  if (host.includes('workday.com') || host.includes('myworkdayjobs.com') || document.querySelector('[data-automation-id="workdayApplication"], [data-automation-id="applicationPage"]')) {
    return 'workday';
  }
  if (host.includes('linkedin.com') || document.querySelector('.jobs-easy-apply-modal, .jobs-apply-form')) {
    return 'linkedin';
  }
  if (host.includes('dice.com') || document.querySelector('[data-cy="apply-button"], #applyJob')) {
    return 'dice';
  }
  if (host.includes('icims.com') || document.querySelector('.iCIMS_JobsTable, .iCIMS_JobContent')) {
    return 'icims';
  }
  return 'generic';
}

/**
 * Hardcoded forbidden field patterns that must NEVER be filled.
 * Includes security fields, passwords, search bars, and known honeypot traps.
 */
const BLOCKED_NAME_PATTERNS = [
  /password/i,
  /captcha/i,
  /recaptcha/i,
  /turnstile/i,
  /token/i,
  /csrf/i,
  /search/i,
  /^q$/i,
  /^query$/i,
  /card_number/i,
  /cvv/i,
  /cc_/i,
  /billing/i,
  /otp/i,
  /auth_code/i,
  // Anti-Honeypot Decoy Traps
  /honeypot/i,
  /honey_pot/i,
  /hp_/i,
  /^hp$/i,
  /bot_field/i,
  /bot_trap/i,
  /fake_field/i,
  /decoy/i,
];

/**
 * Anti-Honeypot Visibility Check:
 * Determines if an input is visually rendered and perceptible to the user.
 * Invisible, off-screen, or zero-dimension inputs are skipped so malicious sites
 * cannot silently harvest candidate PII.
 */
export function isElementVisible(el: HTMLElement): boolean {
  // File inputs are frequently hidden behind styled custom upload buttons
  const isFileInput = el instanceof HTMLInputElement && el.type === 'file';

  // 1. Check aria-hidden attribute
  if (el.getAttribute('aria-hidden') === 'true' && !isFileInput) {
    return false;
  }

  // 2. Check layout / offsetParent
  if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) {
    return isFileInput;
  }

  // 3. Computed style check
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse' ||
    style.opacity === '0' ||
    parseFloat(style.opacity) < 0.05
  ) {
    return isFileInput;
  }

  // 4. Geometry and Off-Screen Honeypot Position Check
  const rect = el.getBoundingClientRect();
  if (!isFileInput) {
    // Zero dimensions (collapsed honeypot)
    if (rect.width === 0 || rect.height === 0 || el.offsetWidth === 0 || el.offsetHeight === 0) {
      return false;
    }
    // Offscreen coordinates (e.g., position: absolute; left: -9999px)
    if (rect.bottom < -100 || rect.right < -100 || rect.left < -500 || rect.top < -500) {
      return false;
    }
  }

  return true;
}

/**
 * Scans the current document/frame for job application form fields.
 */
export function scanApplicationForm(root: Document | HTMLElement = document): FormDetectionResult {
  const platform = detectPlatform();

  // Find candidate form container
  const formElement = root.querySelector<HTMLElement>(
    'form, #application_form, .application-form, [data-automation-id="workdayApplication"], .jobs-easy-apply-modal, .jobs-apply-form, main, [role="main"]'
  ) || (root instanceof Document ? root.body : root);

  // Collect potential input elements
  const rawElements = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea'
    )
  );

  const fields: AutoFillExtractedField[] = [];
  let index = 0;

  for (const el of rawElements) {
    // Check visibility
    if (!isElementVisible(el)) continue;

    // Check blocked attributes
    const name = el.getAttribute('name') || el.id || '';
    const autocomplete = el.getAttribute('autocomplete') || '';
    const placeholder = el.getAttribute('placeholder') || '';

    const isBlocked = BLOCKED_NAME_PATTERNS.some(
      pat => pat.test(name) || pat.test(placeholder) || pat.test(autocomplete)
    );
    if (isBlocked) continue;

    // Determine field type
    let type: AutoFillFieldType = 'text';
    if (el instanceof HTMLTextAreaElement) {
      type = 'textarea';
    } else if (el instanceof HTMLSelectElement) {
      type = 'select';
    } else if (el instanceof HTMLInputElement) {
      const inputType = el.type.toLowerCase();
      if (inputType === 'radio') type = 'radio';
      else if (inputType === 'checkbox') type = 'checkbox';
      else if (inputType === 'file') type = 'file';
      else type = 'text';
    }

    // Extract options if select or radio/checkbox
    let options: string[] | undefined;
    if (el instanceof HTMLSelectElement) {
      options = Array.from(el.options)
        .map(opt => opt.text.trim())
        .filter(text => text.length > 0 && !/^select|choose|--/i.test(text));
    }

    const fieldId = el.id || el.getAttribute('name') || `autofill_field_${index}`;

    fields.push({
      id: fieldId,
      elementIndex: index++,
      name: el.getAttribute('name') || el.id || '',
      label: '', // Populated by label-extractor
      type,
      options,
      placeholder,
      isRequired: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
      currentValue: el.value || '',
      element: el,
    });
  }

  // Assess whether this page has an application form
  // Heuristic: Has file input (resume) OR has at least 3 fields including name/email/phone
  const hasFileInput = fields.some(f => f.type === 'file');
  const hasAppSignals = fields.length >= 3 || platform !== 'generic';
  const isJobApplication = (fields.length > 0 && (hasFileInput || hasAppSignals));

  return {
    isJobApplication,
    platform,
    formElement,
    fields,
  };
}
