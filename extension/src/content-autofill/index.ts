import { CandidateAutoFillProfile, AutoFillRunStats, AutoFillExtractedField } from '../content/types';
import { scanApplicationForm } from './form-detector';
import { resolveTier1Field } from './tier1-resolver';
import { resolveSavedResponse } from './saved-response-matcher';
import { resolveTier2Fields } from './tier2-resolver';
import { injectFieldValue } from './dom-injector';
import {
  markElementAsAutoFilled,
  showAutoFillStartingToast,
  showAutoFillCompletedToast,
  showAutoFillInfoToast,
  dismissAutoFillToast,
} from './visual-feedback';
import { startFormObserver, isElementAlreadyProcessed, markElementProcessed } from './observer';
import './content-autofill.css';

console.log('[JDMatcher Enterprise] Auto-Fill Engine initialized in frame:', window.self === window.top ? 'top' : 'iframe');

let currentProfile: CandidateAutoFillProfile | null = null;
let isAutoFillEnabled = true;
let isExecutionInProgress = false;
let lastProcessedUrl = '';
let hasResumeBeenInjectedOnPage = false;

const RECOGNIZED_ATS_DOMAINS = [
  'linkedin.com',
  'dice.com',
  'greenhouse.io',
  'lever.co',
  'myworkdayjobs.com',
  'workday.com',
  'icims.com',
  'ashbyhq.com',
  'smartrecruiters.com',
  'bamboohr.com',
  'monster.com',
  'indeed.com',
];

/**
 * Validates if current page is on an established ATS or job board domain/path.
 */
export function isRecognizedJobBoardOrAts(): boolean {
  try {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    const href = window.location.href.toLowerCase();

    const matchesDomain = RECOGNIZED_ATS_DOMAINS.some(d => host === d || host.endsWith('.' + d));
    const matchesPath =
      path.includes('/apply') ||
      path.includes('/careers') ||
      path.includes('/jobs') ||
      href.includes('gh_jid=') ||
      href.includes('lever.co/');

    return matchesDomain || matchesPath;
  } catch {
    return false;
  }
}

/**
 * Loads current candidate profile and settings from chrome.storage.local.
 */
async function loadStoredState(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['autofillEnabled', 'cachedCandidateProfile', 'selectedCandidateId'], (res) => {
      if (res.autofillEnabled !== undefined) {
        isAutoFillEnabled = Boolean(res.autofillEnabled);
      }
      if (res.cachedCandidateProfile) {
        currentProfile = res.cachedCandidateProfile;
      }
      resolve();
    });
  });
}

/**
 * Executes a full detection and filling cycle across the current frame.
 * Enforces Zero-Click Domain Guard unless explicitly triggered manually.
 */
export async function executeAutoFillCycle(isManualTrigger = false): Promise<AutoFillRunStats> {
  const stats: AutoFillRunStats = {
    totalFields: 0,
    tier1Filled: 0,
    savedFilled: 0,
    tier2Filled: 0,
    unfilled: 0,
    startTime: Date.now(),
    durationMs: 0,
  };

  // Reset file injection lock when URL changes or user clicks manual trigger
  const currentHref = window.location.href;
  if (currentHref !== lastProcessedUrl) {
    lastProcessedUrl = currentHref;
    hasResumeBeenInjectedOnPage = false;
  }
  if (isManualTrigger) {
    hasResumeBeenInjectedOnPage = false;
  }

  // Zero-Click Domain Guard: automatic zero-click only activates on recognized ATS / job domains
  if (!isManualTrigger && !isRecognizedJobBoardOrAts()) {
    return stats;
  }

  if (!isAutoFillEnabled && !isManualTrigger) {
    return stats;
  }

  if (!currentProfile) {
    // Try reloading profile once from storage
    await loadStoredState();
    if (!currentProfile) {
      if (isManualTrigger) {
        showAutoFillInfoToast('No Candidate Selected', 'Please select an active candidate in the JDMatcher sidebar first.');
      }
      return stats;
    }
  }

  if (isExecutionInProgress) {
    return stats;
  }

  isExecutionInProgress = true;

  try {
    const scan = scanApplicationForm(document);
    if (!scan.isJobApplication || scan.fields.length === 0) {
      isExecutionInProgress = false;
      if (isManualTrigger) {
        showAutoFillInfoToast('No Application Form Found', 'No supported job application inputs detected on this page.');
      }
      return stats;
    }

    // Trigger visual pop-up notification that auto-fill is RUNNING
    showAutoFillStartingToast(currentProfile.fullName);

    stats.totalFields = scan.fields.length;
    const unresolvedFields: AutoFillExtractedField[] = [];

    // --- PHASE 1 & 2: Local Heuristic (Tier 1) & Saved Responses ---
    for (const field of scan.fields) {
      if (!field.element) continue;

      // Skip elements that have already been filled or have user values
      if (isElementAlreadyProcessed(field.element)) {
        continue;
      }

      // Guard file input fields against duplicate/infinite injection loops
      if (field.type === 'file') {
        const fileInput = field.element as HTMLInputElement;

        // 1. If already injected on this page or step, skip!
        if (hasResumeBeenInjectedOnPage && !isManualTrigger) {
          markElementProcessed(field.element);
          continue;
        }

        // 2. If file input already has a file selected, skip!
        if (fileInput.files && fileInput.files.length > 0) {
          hasResumeBeenInjectedOnPage = true;
          markElementProcessed(field.element);
          continue;
        }

        // 3. If file input or its container was stamped as injected, skip!
        if (
          fileInput.getAttribute('data-jdm-file-injected') === 'true' ||
          fileInput.closest('[data-jdm-file-injected="true"], [data-jdm-resume-container="true"]')
        ) {
          hasResumeBeenInjectedOnPage = true;
          markElementProcessed(field.element);
          continue;
        }

        // 4. If ATS already displays an uploaded resume chip/badge nearby
        const hasExistingResumeBadge = Boolean(
          document.querySelector(
            '[data-automation-id*="file-upload-item"], .file-upload-preview, .uploaded-file, [data-qa*="resume-uploaded"], .resume-upload-success, .resume-preview, [data-mapped-resume-uploaded]'
          )
        );
        if (hasExistingResumeBadge && !isManualTrigger) {
          hasResumeBeenInjectedOnPage = true;
          markElementProcessed(field.element);
          continue;
        }
      }

      // If text input already has non-empty text, don't overwrite
      if (
        (field.type === 'text' || field.type === 'textarea') &&
        field.currentValue &&
        field.currentValue.trim().length > 0
      ) {
        markElementProcessed(field.element);
        continue;
      }

      // 1. Try Tier 1 Instant Local Heuristics
      const tier1Result = resolveTier1Field(field, currentProfile);
      if (tier1Result) {
        const injected = await injectFieldValue(field.element, tier1Result.value, currentProfile);
        if (injected) {
          if (field.type === 'file') {
            hasResumeBeenInjectedOnPage = true;
          }
          markElementAsAutoFilled(field.element, 'tier1', tier1Result.strategy);
          markElementProcessed(field.element);
          stats.tier1Filled++;
          continue;
        }
      }

      // 2. Try Saved Responses Matcher
      const savedResult = resolveSavedResponse(field, currentProfile);
      if (savedResult) {
        const injected = await injectFieldValue(field.element, savedResult.value, currentProfile);
        if (injected) {
          markElementAsAutoFilled(field.element, 'saved_response', savedResult.strategy);
          markElementProcessed(field.element);
          stats.savedFilled++;
          continue;
        }
      }

      // If unresolved, queue for Tier 2 AI fallback
      unresolvedFields.push(field);
    }

    // --- PHASE 3: Tier 2 AI Gemini Fallback ---
    if (unresolvedFields.length > 0) {
      const tier2Count = await resolveTier2Fields(unresolvedFields, currentProfile, undefined, isManualTrigger);
      stats.tier2Filled = tier2Count;
    }

    stats.unfilled = stats.totalFields - (stats.tier1Filled + stats.savedFilled + stats.tier2Filled);
    stats.durationMs = Date.now() - stats.startTime;

    // Trigger visual pop-up notification that auto-fill is COMPLETE
    if (stats.tier1Filled > 0 || stats.savedFilled > 0 || stats.tier2Filled > 0) {
      showAutoFillCompletedToast(stats, currentProfile.fullName);
    } else if (isManualTrigger) {
      showAutoFillInfoToast('Fields Already Populated', 'All detectable application inputs are already completed.');
    } else {
      dismissAutoFillToast();
    }

    return stats;
  } catch (err) {
    console.error('[JDMatcher Auto-Fill] Error executing cycle:', err);
    dismissAutoFillToast();
    return stats;
  } finally {
    isExecutionInProgress = false;
  }
}

/**
 * Initialize auto-fill listener and observer.
 */
async function initialize(): Promise<void> {
  await loadStoredState();

  // Watch for dynamic DOM changes (Workday steps, LinkedIn Easy Apply modals)
  startFormObserver({
    debounceMs: 400,
    onFormMutated: () => {
      executeAutoFillCycle(false);
    },
  });

  // Listen for background / dock messages
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Manual "⚡ Fill Form" button works universally on ANY site
    if (message.type === 'TRIGGER_AUTOFILL' || message.type === 'EXECUTE_AUTOFILL') {
      executeAutoFillCycle(true).then(stats => sendResponse({ success: true, stats }));
      return true;
    }

    if (message.type === 'TOGGLE_AUTOFILL') {
      isAutoFillEnabled = Boolean(message.enabled);
      chrome.storage.local.set({ autofillEnabled: isAutoFillEnabled });
      if (isAutoFillEnabled) {
        executeAutoFillCycle();
      }
      sendResponse({ success: true, enabled: isAutoFillEnabled });
      return true;
    }

    if (message.type === 'PROFILE_UPDATED') {
      if (message.profile) {
        currentProfile = message.profile;
        hasResumeBeenInjectedOnPage = false;
        if (isAutoFillEnabled) {
          executeAutoFillCycle();
        }
      }
      sendResponse({ success: true });
      return true;
    }
  });

  // Initial scan if profile already cached
  if (currentProfile && isAutoFillEnabled) {
    // Delay slightly to let ATS hydration finish
    setTimeout(() => {
      executeAutoFillCycle();
    }, 800);
  }
}

// Auto-run initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
