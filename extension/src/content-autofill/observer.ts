/**
 * MutationObserver and SPA step tracker for dynamic ATS application flows.
 */

export interface FormObserverOptions {
  debounceMs?: number;
  onFormMutated: () => void;
}

let activeObserver: MutationObserver | null = null;
let debounceTimer: any = null;
const processedElements = new WeakSet<HTMLElement>();

/**
 * Checks if an element has already been processed by the auto-fill engine.
 */
export function isElementAlreadyProcessed(element: HTMLElement): boolean {
  return processedElements.has(element);
}

/**
 * Marks an element as processed to avoid repeated filling or infinite mutation loops.
 */
export function markElementProcessed(element: HTMLElement): void {
  processedElements.add(element);
}

/**
 * Starts observing the document body for newly rendered form fields.
 */
export function startFormObserver(options: FormObserverOptions): void {
  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
  }

  const debounceMs = options.debounceMs || 350;

  activeObserver = new MutationObserver((mutations) => {
    let hasRelevantMutation = false;

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node instanceof HTMLElement) {
            // Check if node itself or any descendants are inputs/selects/textareas
            if (
              node.matches('input, select, textarea, form, fieldset, [data-automation-id]') ||
              node.querySelector('input, select, textarea')
            ) {
              hasRelevantMutation = true;
              break;
            }
          }
        }
      }
      if (hasRelevantMutation) break;
    }

    if (hasRelevantMutation) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        options.onFormMutated();
      }, debounceMs);
    }
  });

  activeObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Watch for Next / Continue buttons to trigger scan on step transition
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const btn = target.closest('button, a, input[type="button"], [role="button"]');
    if (!btn) return;

    const text = (btn.textContent || (btn as HTMLInputElement).value || '').toLowerCase().trim();
    const isStepTransition = /next|continue|save and continue|proceed|step/i.test(text);

    if (isStepTransition) {
      setTimeout(() => {
        options.onFormMutated();
      }, 500);
    }
  }, { capture: true });
}

/**
 * Disconnects the active form mutation observer.
 */
export function stopFormObserver(): void {
  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
