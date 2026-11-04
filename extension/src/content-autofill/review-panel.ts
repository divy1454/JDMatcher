/**
 * Review flags and the floating review panel.
 *
 * Flagged answers get a dashed amber outline and a tooltip with the reason. The panel lists them so
 * the recruiter knows exactly what to check before moving on or submitting.
 */
import { AutoFillReviewItem } from '../content/types';

export type PanelMode = 'paused' | 'ready' | 'errors' | 'review' | 'stopped' | 'linkedin';

const PANEL_ID = 'jdm-review-panel';

export function markElementNeedsReview(el: HTMLElement, reason: string): void {
  el.classList.remove('jdm-autofilled-tier1', 'jdm-autofilled-saved', 'jdm-autofilled-tier2');
  el.classList.add('jdm-needs-review');
  el.setAttribute('data-jdm-review-reason', reason);
  el.title = `JDMatcher: check this answer. ${reason}`;
}

export function clearReviewMark(el: HTMLElement): void {
  el.classList.remove('jdm-needs-review');
  el.removeAttribute('data-jdm-review-reason');
}

const TITLES: Record<PanelMode, string> = {
  paused: 'Paused: this page needs you',
  ready: 'Ready for you to submit',
  errors: 'The form reported a problem',
  review: 'Filled. Please check these answers',
  stopped: 'Auto-fill stopped',
  linkedin: 'Filled. Click Next yourself on LinkedIn',
};

const SUBTITLES: Record<PanelMode, string> = {
  paused: 'Fix the highlighted answers, then press Continue.',
  ready: 'Check the answers below, then click Submit yourself. JDMatcher never submits.',
  errors: 'Fix what the site is asking for, then press Continue.',
  review: 'Highlighted answers were guessed, missing or need the candidate.',
  stopped: '',
  linkedin: "LinkedIn doesn't allow automated clicking, so page changes are up to you. JDMatcher fills each new page.",
};

const STYLE = `
:host { all: initial; }
.card { position: fixed; right: 24px; bottom: 84px; z-index: 2147483646; width: min(360px, calc(100vw - 32px));
  max-height: min(60vh, 520px); display: flex; flex-direction: column; background: rgba(15, 23, 42, 0.97);
  color: #f8fafc; border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 14px;
  box-shadow: 0 18px 40px -10px rgba(0,0,0,.55); font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.card.paused, .card.errors { border-color: rgba(245, 158, 11, 0.6); }
.card.ready { border-color: rgba(16, 185, 129, 0.6); }
.head { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px 8px; }
.dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 5px; flex: none; background: #f59e0b; }
.ready .dot { background: #10b981; }
.title { font-weight: 650; font-size: 13.5px; }
.sub { color: #cbd5e1; font-size: 12px; margin-top: 2px; }
.close { margin-left: auto; background: none; border: 0; color: #94a3b8; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
.close:hover { color: #f8fafc; }
ul { list-style: none; margin: 0; padding: 0 8px 4px; overflow: auto; }
li { padding: 7px 8px; border-radius: 8px; cursor: default; }
li.link { cursor: pointer; }
li.link:hover { background: rgba(148, 163, 184, 0.12); }
.q { font-weight: 560; color: #f1f5f9; }
.r { color: #fca5a5; font-size: 12px; margin-top: 1px; }
.r.info { color: #93c5fd; }
.foot { display: flex; gap: 8px; justify-content: flex-end; padding: 8px 14px 12px; }
button.primary { background: #10b981; color: #052e1f; border: 0; border-radius: 8px; padding: 7px 12px; font-weight: 650; cursor: pointer; font-size: 12.5px; }
button.primary:hover { background: #34d399; }
`;

let onContinue: (() => void) | null = null;
let shownMode: PanelMode | null = null;

export function dismissReviewPanel(): void {
  document.getElementById(PANEL_ID)?.remove();
  shownMode = null;
}

/** The kind of panel showing in this frame right now, or null. */
export function shownPanelMode(): PanelMode | null {
  return document.getElementById(PANEL_ID) ? shownMode : null;
}

/**
 * Shows the panel in the top frame. Calls from iframes are relayed to the top frame
 * (items are sent as text only; "Continue" is routed back through the extension).
 */
export function showReviewPanel(mode: PanelMode, items: AutoFillReviewItem[], continueHandler?: () => void): void {
  if (window.top && window.top !== window.self) {
    try {
      window.top.postMessage(
        {
          type: 'JDM_REVIEW_PANEL',
          mode,
          items: items.map((i) => ({ question: i.question, reason: i.reason })),
          canContinue: Boolean(continueHandler),
        },
        '*'
      );
    } catch {
      // ignore cross-origin errors
    }
    onContinue = continueHandler || null;
    return;
  }
  renderPanel(mode, items, continueHandler || null);
}

function renderPanel(mode: PanelMode, items: AutoFillReviewItem[], continueHandler: (() => void) | null): void {
  dismissReviewPanel();
  shownMode = mode;
  onContinue = continueHandler;
  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.setAttribute('data-jdm-ignore', 'true');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.appendChild(style);

  const card = document.createElement('div');
  card.className = `card ${mode}`;
  card.setAttribute('role', 'status');

  const head = document.createElement('div');
  head.className = 'head';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const textWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = items.length && mode !== 'ready' && mode !== 'linkedin' ? `${TITLES[mode]} (${items.length})` : TITLES[mode];
  const sub = document.createElement('div');
  sub.className = 'sub';
  sub.textContent =
    mode === 'ready' && items.length === 0
      ? 'Check the review page, then click Submit yourself. JDMatcher never submits.'
      : SUBTITLES[mode];
  textWrap.append(title, sub);
  const close = document.createElement('button');
  close.className = 'close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.onclick = () => dismissReviewPanel();
  head.append(dot, textWrap, close);
  card.appendChild(head);

  if (items.length > 0) {
    const list = document.createElement('ul');
    for (const item of items.slice(0, 12)) {
      const li = document.createElement('li');
      const q = document.createElement('div');
      q.className = 'q';
      q.textContent = item.question.length > 110 ? `${item.question.slice(0, 107)}...` : item.question;
      const r = document.createElement('div');
      // AI answers listed for a final glance are information, not problems
      r.className = item.reason.startsWith('Answered by AI') ? 'r info' : 'r';
      r.textContent = item.reason;
      li.append(q, r);
      if (item.element && item.element.isConnected) {
        li.className = 'link';
        li.onclick = () => {
          item.element!.scrollIntoView({ block: 'center', behavior: 'smooth' });
          const focusable = item.element!.matches('input, select, textarea, button')
            ? item.element!
            : (item.element!.querySelector('input, select, textarea, button') as HTMLElement | null);
          focusable?.focus({ preventScroll: true });
        };
      }
      list.appendChild(li);
    }
    card.appendChild(list);
  }

  if (continueHandler) {
    const foot = document.createElement('div');
    foot.className = 'foot';
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = 'Continue';
    btn.onclick = () => {
      dismissReviewPanel();
      continueHandler();
    };
    foot.appendChild(btn);
    card.appendChild(foot);
  }

  shadow.appendChild(card);
  (document.body || document.documentElement).appendChild(host);
}

/** Resumes a paused session in this frame (used when the Continue button lives in another frame). */
export function triggerFrameContinue(): boolean {
  if (!onContinue) return false;
  const fn = onContinue;
  onContinue = null;
  fn();
  return true;
}

// Top frame: render panels requested by iframes; route Continue back through the extension.
if (window.top === window.self) {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'JDM_REVIEW_PANEL') return;
    const items: AutoFillReviewItem[] = Array.isArray(data.items)
      ? data.items.slice(0, 12).map((i: any) => ({ question: String(i?.question || ''), reason: String(i?.reason || '') }))
      : [];
    const mode: PanelMode = (Object.keys(TITLES) as PanelMode[]).includes(data.mode) ? data.mode : 'review';
    renderPanel(
      mode,
      items,
      data.canContinue
        ? () => {
            try {
              chrome.runtime.sendMessage({ type: 'RESUME_AUTOFILL' });
            } catch {
              // ignore
            }
          }
        : null
    );
  });
}
