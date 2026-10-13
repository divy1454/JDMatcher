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

export function dismissAutoFillToast(): void {
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
  if (activeToastContainer) {
    activeToastContainer.classList.add('jdm-toast-fading');
    setTimeout(() => {
      activeToastContainer?.remove();
      activeToastContainer = null;
    }, 250);
  }
}

/**
 * Displays a glowing "Auto-filling application..." notification when filling starts.
 */
export function showAutoFillStartingToast(candidateName?: string): void {
  // If inside an iframe, relay to top window so only 1 unified toast renders
  if (window.top && window.top !== window.self) {
    try {
      window.top.postMessage(
        { type: 'JDM_TOAST_STARTING', candidateName },
        '*'
      );
    } catch {
      // Ignore cross-origin postMessage errors
    }
    return;
  }

  dismissAutoFillToast();

  const container = document.createElement('div');
  container.className = 'jdm-autofill-toast-container';
  container.id = 'jdm-autofill-toast-root';

  const toast = document.createElement('div');
  toast.className = 'jdm-autofill-toast jdm-toast-running';

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'jdm-autofill-toast-icon jdm-toast-icon-running';
  iconWrapper.innerHTML = '<span class="jdm-toast-pulse-ring"></span><span class="jdm-toast-bolt">⚡</span>';

  const textContainer = document.createElement('div');
  textContainer.className = 'jdm-autofill-toast-text';

  const title = document.createElement('span');
  title.className = 'jdm-autofill-toast-title';
  title.textContent = '⚡ Auto-filling application form...';

  const subtitle = document.createElement('span');
  subtitle.className = 'jdm-autofill-toast-subtitle';
  subtitle.textContent = candidateName
    ? `Profile: ${candidateName} • Injecting fields`
    : 'Matching candidate profile to ATS inputs';

  textContainer.appendChild(title);
  textContainer.appendChild(subtitle);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'jdm-autofill-toast-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Dismiss';
  closeBtn.onclick = () => dismissAutoFillToast();

  toast.appendChild(iconWrapper);
  toast.appendChild(textContainer);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  document.body.appendChild(container);
  activeToastContainer = container;
}

/**
 * Displays a completion notification when auto-fill finishes.
 */
export function showAutoFillCompletedToast(stats: AutoFillRunStats, candidateName?: string): void {
  // If inside an iframe, relay to top window
  if (window.top && window.top !== window.self) {
    try {
      window.top.postMessage(
        { type: 'JDM_TOAST_COMPLETED', stats, candidateName },
        '*'
      );
    } catch {
      // Ignore
    }
    return;
  }

  const filledCount = stats.tier1Filled + stats.savedFilled + stats.tier2Filled;
  if (filledCount === 0) {
    dismissAutoFillToast();
    return;
  }

  dismissAutoFillToast();

  const container = document.createElement('div');
  container.className = 'jdm-autofill-toast-container';
  container.id = 'jdm-autofill-toast-root';

  const toast = document.createElement('div');
  toast.className = 'jdm-autofill-toast jdm-toast-complete';

  const icon = document.createElement('div');
  icon.className = 'jdm-autofill-toast-icon jdm-toast-icon-complete';
  icon.textContent = '✓';

  const textContainer = document.createElement('div');
  textContainer.className = 'jdm-autofill-toast-text';

  const title = document.createElement('span');
  title.className = 'jdm-autofill-toast-title';
  title.textContent = `✓ Auto-fill complete! (${filledCount} field${filledCount > 1 ? 's' : ''} filled)`;

  const subtitle = document.createElement('span');
  subtitle.className = 'jdm-autofill-toast-subtitle';
  subtitle.textContent = `${stats.tier1Filled + stats.savedFilled} instant, ${stats.tier2Filled} AI resolved${candidateName ? ` • ${candidateName}` : ''} • Please review and submit`;

  textContainer.appendChild(title);
  textContainer.appendChild(subtitle);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'jdm-autofill-toast-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Dismiss';
  closeBtn.onclick = () => dismissAutoFillToast();

  toast.appendChild(icon);
  toast.appendChild(textContainer);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  document.body.appendChild(container);
  activeToastContainer = container;

  // Auto dismiss after 7 seconds
  toastTimeoutId = setTimeout(() => {
    dismissAutoFillToast();
  }, 7000);
}

/**
 * Displays an informational toast (e.g. for manual clicks with 0 fields).
 */
export function showAutoFillInfoToast(titleText: string, subtitleText?: string): void {
  if (window.top && window.top !== window.self) {
    try {
      window.top.postMessage(
        { type: 'JDM_TOAST_INFO', titleText, subtitleText },
        '*'
      );
    } catch {
      // Ignore
    }
    return;
  }

  dismissAutoFillToast();

  const container = document.createElement('div');
  container.className = 'jdm-autofill-toast-container';
  container.id = 'jdm-autofill-toast-root';

  const toast = document.createElement('div');
  toast.className = 'jdm-autofill-toast jdm-toast-info';

  const icon = document.createElement('div');
  icon.className = 'jdm-autofill-toast-icon jdm-toast-icon-info';
  icon.textContent = 'ℹ';

  const textContainer = document.createElement('div');
  textContainer.className = 'jdm-autofill-toast-text';

  const title = document.createElement('span');
  title.className = 'jdm-autofill-toast-title';
  title.textContent = titleText;

  textContainer.appendChild(title);

  if (subtitleText) {
    const subtitle = document.createElement('span');
    subtitle.className = 'jdm-autofill-toast-subtitle';
    subtitle.textContent = subtitleText;
    textContainer.appendChild(subtitle);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'jdm-autofill-toast-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Dismiss';
  closeBtn.onclick = () => dismissAutoFillToast();

  toast.appendChild(icon);
  toast.appendChild(textContainer);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  document.body.appendChild(container);
  activeToastContainer = container;

  toastTimeoutId = setTimeout(() => {
    dismissAutoFillToast();
  }, 4500);
}

/**
 * Backwards compatibility export
 */
export const showAutoFillToast = showAutoFillCompletedToast;

// Listen for iframe cross-frame messages in the top window
if (window.top === window.self) {
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'JDM_TOAST_STARTING') {
      showAutoFillStartingToast(event.data.candidateName);
    } else if (event.data.type === 'JDM_TOAST_COMPLETED') {
      showAutoFillCompletedToast(event.data.stats, event.data.candidateName);
    } else if (event.data.type === 'JDM_TOAST_INFO') {
      showAutoFillInfoToast(event.data.titleText, event.data.subtitleText);
    }
  });
}

