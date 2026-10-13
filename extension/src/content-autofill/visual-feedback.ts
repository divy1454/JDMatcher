import { AutoFillRunStats } from '../content/types';

/**
 * Highlights a form element according to its resolution tier.
 */
export function markElementAsAutoFilled(
  element: HTMLElement,
  tier: 'tier1' | 'saved_response' | 'tier2',
  strategy: string
): void {
  // Clear any existing class
  element.classList.remove('jdm-autofilled-tier1', 'jdm-autofilled-saved', 'jdm-autofilled-tier2');

  if (tier === 'tier1') {
    element.classList.add('jdm-autofilled-tier1');
    element.title = `JDMatcher: Auto-filled from profile (${strategy})`;
  } else if (tier === 'saved_response') {
    element.classList.add('jdm-autofilled-saved');
    element.title = `JDMatcher: Auto-filled from saved responses (${strategy})`;
  } else if (tier === 'tier2') {
    element.classList.add('jdm-autofilled-tier2');
    element.title = `JDMatcher: AI Resolved question (${strategy})`;
  }
}

let activeToastContainer: HTMLElement | null = null;
let toastTimeoutId: any = null;

/**
 * Displays a non-intrusive floating toast pill in the bottom-right corner.
 */
export function showAutoFillToast(stats: AutoFillRunStats, candidateName?: string): void {
  // Only display toast in the top frame to prevent duplication across iframes
  if (window.top !== window.self) {
    return;
  }

  // Remove existing toast if any
  if (activeToastContainer) {
    activeToastContainer.remove();
    activeToastContainer = null;
    if (toastTimeoutId) clearTimeout(toastTimeoutId);
  }

  const filledCount = stats.tier1Filled + stats.savedFilled + stats.tier2Filled;
  if (filledCount === 0) return;

  const container = document.createElement('div');
  container.className = 'jdm-autofill-toast-container';
  container.id = 'jdm-autofill-toast-root';

  const toast = document.createElement('div');
  toast.className = 'jdm-autofill-toast';

  const icon = document.createElement('div');
  icon.className = 'jdm-autofill-toast-icon';
  icon.textContent = '✓'; // Checkmark

  const textContainer = document.createElement('div');
  textContainer.className = 'jdm-autofill-toast-text';

  const title = document.createElement('span');
  title.className = 'jdm-autofill-toast-title';
  title.textContent = `${filledCount} field${filledCount > 1 ? 's' : ''} auto-filled${candidateName ? ` for ${candidateName}` : ''}`;

  const subtitle = document.createElement('span');
  subtitle.className = 'jdm-autofill-toast-subtitle';
  subtitle.textContent = `${stats.tier1Filled + stats.savedFilled} instant, ${stats.tier2Filled} AI resolved • Please review and submit`;

  textContainer.appendChild(title);
  textContainer.appendChild(subtitle);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'jdm-autofill-toast-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Dismiss';
  closeBtn.onclick = () => {
    container.remove();
    activeToastContainer = null;
  };

  toast.appendChild(icon);
  toast.appendChild(textContainer);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  document.body.appendChild(container);
  activeToastContainer = container;

  // Auto fade out after 8 seconds
  toastTimeoutId = setTimeout(() => {
    if (activeToastContainer) {
      activeToastContainer.remove();
      activeToastContainer = null;
    }
  }, 8000);
}
