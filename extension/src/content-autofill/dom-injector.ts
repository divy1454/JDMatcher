import { CandidateAutoFillProfile } from '../content/types';

/**
 * Hardcoded forbidden button keywords to ensure the extension NEVER submits a form.
 */
const FORBIDDEN_SUBMIT_KEYWORDS = [
  'submit',
  'submit application',
  'apply',
  'apply now',
  'complete application',
  'send application',
  'review and submit',
  'finish',
];

/**
 * Validates whether an element is a form submission trigger that must NEVER be auto-clicked.
 */
export function isBlockedSubmitElement(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement && (element.type === 'submit' || element.type === 'image')) {
    return true;
  }
  if (element instanceof HTMLButtonElement && element.type === 'submit') {
    return true;
  }
  const text = (element.innerText || element.getAttribute('value') || element.getAttribute('aria-label') || '').toLowerCase().trim();
  return FORBIDDEN_SUBMIT_KEYWORDS.some(keyword => text === keyword || text.startsWith(keyword));
}

/**
 * Framework-safe text/textarea value setter for React 16+, Angular, Vue, and Workday.
 */
export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // 1. Prototype setter bypass to overcome React synthetic event interception
  const proto = element instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');

  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  // 2. Clear React internal value tracker if present
  const tracker = (element as any)._valueTracker;
  if (tracker) {
    tracker.setValue('');
  }

  // 3. Dispatch full lifecycle events
  element.dispatchEvent(new Event('focus', { bubbles: true }));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Selects an option in a standard HTMLSelectElement.
 */
export function setSelectValue(element: HTMLSelectElement, targetValue: string): boolean {
  const normTarget = targetValue.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (let i = 0; i < element.options.length; i++) {
    const opt = element.options[i];
    const optVal = opt.value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const optText = opt.text.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (optVal === normTarget || optText === normTarget || optText.includes(normTarget) || normTarget.includes(optText)) {
      element.selectedIndex = i;
      opt.selected = true;

      element.dispatchEvent(new Event('focus', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }
  }

  return false;
}

/**
 * Sets a radio or checkbox element to checked with synthetic clicks.
 */
export function setCheckedValue(element: HTMLInputElement, checked = true): void {
  if (element.checked !== checked) {
    element.checked = checked;
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/**
 * Converts a base64 data string to a File object and sets it on an HTMLInputElement (type=file).
 */
export function injectResumeFile(element: HTMLInputElement, profile: CandidateAutoFillProfile): boolean {
  if (!profile.resumeFileBase64) return false;

  // 1. Guard against repeat injection if element already has files
  if (element.files && element.files.length > 0) {
    element.setAttribute('data-jdm-file-injected', 'true');
    return true;
  }

  // 2. Guard against repeat injection if already stamped
  if (element.getAttribute('data-jdm-file-injected') === 'true') {
    return true;
  }

  // 3. Guard against repeat injection if parent container was already injected
  const container = element.closest('form, [data-automation-id], .application-form, div');
  if (container?.getAttribute('data-jdm-resume-container') === 'true') {
    return true;
  }

  try {
    const base64Data = profile.resumeFileBase64.includes(',')
      ? profile.resumeFileBase64.split(',')[1]
      : profile.resumeFileBase64;

    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const mimeType = profile.resumeMimeType || 'application/pdf';
    const fileName = profile.resumeFileName || `${profile.fullName.replace(/\s+/g, '_')}_Resume.pdf`;

    const file = new File([bytes], fileName, { type: mimeType });

    // Use DataTransfer to populate input.files
    const dt = new DataTransfer();
    dt.items.add(file);
    element.files = dt.files;

    // Stamp attributes on element and container
    element.setAttribute('data-jdm-file-injected', 'true');
    element.setAttribute('data-jdm-autofilled', 'true');
    if (container) {
      container.setAttribute('data-jdm-resume-container', 'true');
    }

    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (err) {
    console.error('JDMatcher Auto-Fill: Failed to inject resume file:', err);
    return false;
  }
}

/**
 * Asynchronously interacts with custom comboboxes / select portals (React-Select, Workday, Lever).
 * Clicks the combobox, waits ~130ms for the portal menu to mount, finds matching option, and clicks it.
 */
export async function injectCustomCombobox(element: HTMLElement, targetValue: string): Promise<boolean> {
  const normTarget = targetValue.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normTarget) return false;

  // 1. Focus and trigger open click sequence
  const clickableTarget = element.closest('[role="combobox"], [data-automation-id*="promptOption"], .select__control, .select2-selection') || element;

  clickableTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  clickableTarget.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  clickableTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  // If element is an input, type target value to trigger suggestions
  if (element instanceof HTMLInputElement) {
    setNativeValue(element, targetValue);
  }

  // 2. Wait 130ms for the portal or dropdown menu to mount in document
  await new Promise((resolve) => setTimeout(resolve, 130));

  // 3. Scan document / portal roots for option items
  const optionCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="option"], .select__option, .select2-results__option, [data-automation-id*="promptOption"], [data-automation-id*="menuItem"], li[role="option"], div[id*="react-select"][id*="option"]'
    )
  );

  let bestMatch: HTMLElement | null = null;

  for (const opt of optionCandidates) {
    const optText = (opt.innerText || opt.textContent || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (optText === normTarget) {
      bestMatch = opt;
      break;
    }
    if (optText.includes(normTarget) || normTarget.includes(optText)) {
      bestMatch = opt;
    }
  }

  if (bestMatch) {
    bestMatch.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    bestMatch.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    bestMatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  // If no option clicked, close menu by blurring
  element.dispatchEvent(new Event('blur', { bubbles: true }));
  return false;
}

/**
 * Universal safe injector that handles any supported form control element.
 */
export async function injectFieldValue(
  element: HTMLElement,
  value: string,
  profile?: CandidateAutoFillProfile
): Promise<boolean> {
  // Safety Guard: never interact with submit buttons
  if (isBlockedSubmitElement(element)) {
    return false;
  }

  // Check if element is a custom combobox portal (React-Select, Workday, Lever)
  const isCombobox =
    element.getAttribute('role') === 'combobox' ||
    element.getAttribute('aria-autocomplete') === 'list' ||
    Boolean(element.closest('[role="combobox"]')) ||
    element.classList.contains('select__input') ||
    element.classList.contains('select2-search__field');

  if (isCombobox && value !== '__RESUME_FILE__') {
    const customSuccess = await injectCustomCombobox(element, value);
    if (customSuccess) return true;
  }

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();

    if (type === 'file') {
      if (value === '__RESUME_FILE__' && profile) {
        return injectResumeFile(element, profile);
      }
      return false;
    }

    if (type === 'radio' || type === 'checkbox') {
      setCheckedValue(element, true);
      return true;
    }

    // Standard text, email, tel, url, number
    setNativeValue(element, value);
    return true;
  }

  if (element instanceof HTMLTextAreaElement) {
    setNativeValue(element, value);
    return true;
  }

  if (element instanceof HTMLSelectElement) {
    return setSelectValue(element, value);
  }

  return false;
}
