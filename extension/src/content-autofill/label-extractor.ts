/**
 * Extracts human-readable labels and contextual questions for form elements.
 */

export interface ExtractedLabelInfo {
  rawLabel: string;
  normalizedLabel: string;
  questionContext?: string;
}

/**
 * Normalizes a label string for regex and keyword matching:
 * lowercase, trimmed, special punctuation and required asterisks stripped.
 */
export function normalizeLabelText(text: string): string {
  return text
    .replace(/[\*:]/g, '') // Remove asterisks and colons
    .replace(/\s+/g, ' ')   // Collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Extracts the label text associated with an HTML input/select/textarea element.
 */
export function extractElementLabel(element: HTMLElement): ExtractedLabelInfo {
  let labelText = '';
  let questionContext = '';

  // 1. Explicit HTML <label for="elementId">
  if (element.id) {
    // Escape CSS selector special characters in ID
    const escapedId = CSS.escape(element.id);
    const labelEl = document.querySelector<HTMLLabelElement>(`label[for="${escapedId}"]`);
    if (labelEl && labelEl.innerText.trim()) {
      labelText = labelEl.innerText.trim();
    }
  }

  // 2. Ancestor <label> wrapper
  if (!labelText) {
    const parentLabel = element.closest('label');
    if (parentLabel && parentLabel.innerText.trim()) {
      // Clone label and remove element's own value text to avoid repetition
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      const childInput = clone.querySelector('input, select, textarea');
      if (childInput) childInput.remove();
      labelText = clone.innerText.trim();
    }
  }

  // 3. aria-labelledby
  if (!labelText) {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map(id => {
        const el = document.getElementById(id);
        return el ? el.innerText.trim() : '';
      }).filter(Boolean);
      if (parts.length > 0) {
        labelText = parts.join(' ');
      }
    }
  }

  // 4. aria-label attribute
  if (!labelText) {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      labelText = ariaLabel.trim();
    }
  }

  // 5. Workday-specific label extraction: [data-automation-id*="formLabel"]
  if (!labelText) {
    const workdayContainer = element.closest('[data-automation-id*="formField"], [data-automation-id*="formGroup"]');
    if (workdayContainer) {
      const wdLabel = workdayContainer.querySelector<HTMLElement>('[data-automation-id*="formLabel"], label');
      if (wdLabel && wdLabel.innerText.trim()) {
        labelText = wdLabel.innerText.trim();
      }
    }
  }

  // 6. Fieldset and Legend (especially for Radio / Checkbox groups)
  const fieldset = element.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend && legend.innerText.trim()) {
      questionContext = legend.innerText.trim();
      // If no direct label found yet, use legend
      if (!labelText) {
        labelText = questionContext;
      }
    }
  }

  // 7. Closest preceding sibling or container heading
  if (!labelText) {
    const prevSibling = element.previousElementSibling;
    if (prevSibling instanceof HTMLElement && (
      prevSibling.tagName === 'LABEL' ||
      prevSibling.classList.contains('label') ||
      prevSibling.classList.contains('field-label')
    )) {
      labelText = prevSibling.innerText.trim();
    }
  }

  // 8. Workday / Generic parent question container
  if (!labelText) {
    const questionParent = element.closest('.field, .form-group, .input-group, .application-question, [data-field]');
    if (questionParent) {
      const headerOrLabel = questionParent.querySelector<HTMLElement>('label, .label, .field-label, h3, h4, span.title');
      if (headerOrLabel && headerOrLabel !== element && headerOrLabel.innerText.trim()) {
        labelText = headerOrLabel.innerText.trim();
      }
    }
  }

  // 9. Fallback to placeholder or name/id attribute
  if (!labelText) {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) {
      labelText = placeholder.trim();
    } else {
      const nameAttr = element.getAttribute('name') || element.id || '';
      // Turn snake_case or camelCase into spaced words: "first_name" -> "first name", "firstName" -> "first name"
      labelText = nameAttr
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_\-\.]+/g, ' ')
        .trim();
    }
  }

  return {
    rawLabel: labelText,
    normalizedLabel: normalizeLabelText(labelText),
    questionContext: questionContext ? normalizeLabelText(questionContext) : undefined,
  };
}
