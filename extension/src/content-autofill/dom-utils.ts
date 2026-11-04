/**
 * DOM helpers: shadow-DOM aware queries, visibility checks, realistic clicks and polling waits.
 */
import { cleanLabel } from './text-utils';

/** JDMatcher's own UI (widget host, toasts, review panel). The engine must never fill or click these. */
export const OWN_UI_SELECTOR =
  '#jdmatcher-extension-host, #jdm-autofill-toast-root, .jdm-autofill-toast-container, #jdm-review-panel, [data-jdm-ignore]';

export type SearchRoot = Document | ShadowRoot;

/** `closest()` that keeps climbing through shadow-root hosts. */
export function composedClosest(el: Element | null, selector: string): Element | null {
  let cur: Element | null = el;
  while (cur) {
    try {
      if (cur.matches(selector)) return cur;
    } catch {
      return null;
    }
    if (cur.parentElement) {
      cur = cur.parentElement;
    } else {
      const root = cur.getRootNode();
      cur = root instanceof ShadowRoot ? root.host : null;
    }
  }
  return null;
}

export function isOwnUi(el: Element | null): boolean {
  return Boolean(el && composedClosest(el, OWN_UI_SELECTOR));
}

/** The document plus every open shadow root below it (skipping JDMatcher's own widget). */
export function collectSearchRoots(start: SearchRoot = document): SearchRoot[] {
  const roots: SearchRoot[] = [start];
  const walk = (root: SearchRoot) => {
    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.shadowRoot && !el.matches(OWN_UI_SELECTOR)) {
        roots.push(el.shadowRoot);
        walk(el.shadowRoot);
      }
    }
  };
  walk(start);
  return roots;
}

/** querySelectorAll across the document and all open shadow roots. */
export function deepQueryAll<T extends Element = HTMLElement>(selector: string, start: SearchRoot = document): T[] {
  const out: T[] = [];
  for (const root of collectSearchRoots(start)) {
    root.querySelectorAll<T>(selector).forEach((el) => out.push(el));
  }
  return out;
}

/** getElementById that works inside shadow roots. */
export function getByIdNear(el: Element, id: string): HTMLElement | null {
  if (!id) return null;
  const root = el.getRootNode() as Document | ShadowRoot;
  const found = (root as any).getElementById?.(id) as HTMLElement | null;
  return found || document.getElementById(id);
}

/** Rendered and not hidden by CSS (including hidden ancestors). Opacity is NOT checked here. */
export function isRendered(el: Element | null): boolean {
  if (!el || !(el as HTMLElement).isConnected) return false;
  const anyEl = el as any;
  if (typeof anyEl.checkVisibility === 'function') {
    if (!anyEl.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) return false;
  } else {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

/** Rendered, not transparent, not pushed off-screen. Used for the honeypot check on text fields. */
export function isPerceivable(el: HTMLElement): boolean {
  if (!isRendered(el)) return false;
  const anyEl = el as any;
  if (typeof anyEl.checkVisibility === 'function') {
    if (!anyEl.checkVisibility({ opacityProperty: true, checkOpacity: true })) return false;
  } else if (parseFloat(window.getComputedStyle(el).opacity) < 0.05) {
    return false;
  }
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.bottom < -100 || rect.right < -100 || rect.left < -500 || rect.top < -500) return false;
  return true;
}

/** Visible text of an element with whitespace collapsed. */
export function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  const he = el as HTMLElement;
  return cleanLabel(he.innerText !== undefined && he.innerText !== '' ? he.innerText : he.textContent || '');
}

/** Text of a label/container without the text of form controls nested inside it. */
export function textWithoutControls(el: Element | null | undefined): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input, select, textarea, option, button, [role="listbox"], [role="option"], script, style').forEach((n) => n.remove());
  return cleanLabel(clone.textContent || '');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `check` until it returns a truthy value or the timeout passes. */
export async function waitFor<T>(
  check: () => T | null | undefined | false,
  timeoutMs = 3000,
  intervalMs = 80
): Promise<T | null> {
  const start = Date.now();
  for (;;) {
    let value: T | null | undefined | false = null;
    try {
      value = check();
    } catch {
      value = null;
    }
    if (value) return value as T;
    if (Date.now() - start >= timeoutMs) return null;
    await sleep(intervalMs);
  }
}

/** Waits until the DOM has stopped changing for `quietMs` (or `maxMs` passes). */
export function waitForDomQuiet(quietMs = 450, maxMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = () => {
      observer.disconnect();
      clearTimeout(maxTimer);
      if (timer) clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(done, quietMs);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    timer = setTimeout(done, quietMs);
    const maxTimer = setTimeout(done, maxMs);
  });
}

/** Pointer + mouse event sequence followed by a real click(), like a user tap. */
export function simulateClick(el: HTMLElement): void {
  try {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } catch {
    // ignore
  }
  const rect = el.getBoundingClientRect();
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
  };
  const pointer = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  try {
    el.dispatchEvent(new PointerEvent('pointerover', pointer));
    el.dispatchEvent(new PointerEvent('pointerenter', { ...pointer, bubbles: false }));
    el.dispatchEvent(new MouseEvent('mouseover', base));
    el.dispatchEvent(new PointerEvent('pointerdown', pointer));
    el.dispatchEvent(new MouseEvent('mousedown', base));
  } catch {
    // PointerEvent may be unavailable in some frames
  }
  try {
    el.focus({ preventScroll: true });
  } catch {
    // ignore
  }
  try {
    el.dispatchEvent(new PointerEvent('pointerup', pointer));
    el.dispatchEvent(new MouseEvent('mouseup', base));
  } catch {
    // ignore
  }
  el.click();
}

export function pressKey(el: HTMLElement, key: string, code = key): void {
  const opts = { key, code, bubbles: true, cancelable: true, composed: true };
  el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
}

/** Lowest element that contains every element in `els`. */
export function commonAncestor(els: Element[]): HTMLElement | null {
  if (els.length === 0) return null;
  let candidate: Element | null = els[0].parentElement;
  while (candidate) {
    if (els.every((e) => candidate!.contains(e))) return candidate as HTMLElement;
    candidate = candidate.parentElement;
  }
  return null;
}

export function isDisabled(el: Element): boolean {
  return (
    (el as HTMLInputElement).disabled === true ||
    el.getAttribute('aria-disabled') === 'true' ||
    Boolean(el.closest('fieldset[disabled]'))
  );
}
