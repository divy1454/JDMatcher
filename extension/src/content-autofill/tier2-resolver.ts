import {
  AutoFillExtractedField,
  AutoFillResolveRequest,
  AutoFillResolveResponse,
  CandidateAutoFillProfile,
} from '../content/types';
import { injectFieldValue } from './dom-injector';
import { markElementAsAutoFilled } from './visual-feedback';
import { extractElementLabel } from './label-extractor';

// Tier-2 Anti-Drain Billing Circuit Breaker State
let trackedPageUrl = typeof window !== 'undefined' ? window.location.href : '';
let callsForCurrentUrl = 0;
let lastTier2CallTime = 0;
const MAX_CALLS_PER_PAGE_STEP = 2;
const TIER2_COOLDOWN_MS = 5000;

/**
 * Resets the Tier-2 circuit breaker counters (e.g. on manual trigger or step navigation).
 */
export function resetTier2CircuitBreaker(): void {
  callsForCurrentUrl = 0;
  lastTier2CallTime = 0;
}

/**
 * Batches and sends unresolved screening questions to the backend Gemini resolver.
 * Protected by an anti-drain circuit breaker (max 2 calls per URL/step, 5s cooldown).
 */
export async function resolveTier2Fields(
  unresolvedFields: AutoFillExtractedField[],
  profile: CandidateAutoFillProfile,
  jobContext?: { jobTitle?: string; companyName?: string; jobDescription?: string },
  isManualTrigger = false
): Promise<number> {
  if (unresolvedFields.length === 0) return 0;

  // Circuit Breaker: Check URL navigation
  const currentUrl = window.location.href;
  if (currentUrl !== trackedPageUrl) {
    trackedPageUrl = currentUrl;
    callsForCurrentUrl = 0;
  }

  // Automatic runs are strictly bounded to prevent infinite loops on re-rendering SPAs
  if (!isManualTrigger) {
    const now = Date.now();
    if (callsForCurrentUrl >= MAX_CALLS_PER_PAGE_STEP) {
      console.warn('[JDMatcher Circuit Breaker] Max 2 automatic Tier-2 calls reached for this page. Suppressed to protect wallet.');
      return 0;
    }
    if (now - lastTier2CallTime < TIER2_COOLDOWN_MS) {
      console.warn('[JDMatcher Circuit Breaker] 5-second cooldown active for automatic Tier-2 calls. Suppressed.');
      return 0;
    }
    lastTier2CallTime = now;
    callsForCurrentUrl++;
  }

  // Prepare payload for background script
  const fieldsPayload = unresolvedFields.map(field => {
    const labelInfo = field.element ? extractElementLabel(field.element) : { rawLabel: field.label, normalizedLabel: field.label };
    return {
      id: field.id,
      elementIndex: field.elementIndex,
      name: field.name,
      label: labelInfo.rawLabel || field.label,
      type: field.type,
      options: field.options,
      placeholder: field.placeholder,
      isRequired: field.isRequired,
      currentValue: field.currentValue,
    };
  });

  const request: AutoFillResolveRequest = {
    candidateId: profile.id,
    jobTitle: jobContext?.jobTitle,
    companyName: jobContext?.companyName,
    jobDescription: jobContext?.jobDescription,
    unresolvedFields: fieldsPayload,
  };

  try {
    const response: { success: boolean; data?: AutoFillResolveResponse; error?: string } = await new Promise(
      (resolve) => {
        chrome.runtime.sendMessage(
          { type: 'AUTOFILL_RESOLVE', payload: request },
          (res) => {
            if (chrome.runtime.lastError) {
              console.warn('JDMatcher: Background AUTOFILL_RESOLVE communication error:', chrome.runtime.lastError.message);
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(res || { success: false, error: 'Empty response from background' });
            }
          }
        );
      }
    );

    if (!response || !response.success || !response.data?.resolvedFields) {
      console.warn('JDMatcher: Tier 2 AI resolution skipped or failed:', response?.error);
      return 0;
    }

    let filledCount = 0;
    for (const resolved of response.data.resolvedFields) {
      const field = unresolvedFields.find(f => f.elementIndex === resolved.elementIndex || f.id === resolved.fieldId);
      if (!field || !field.element || !resolved.value) continue;

      const success = await injectFieldValue(field.element, resolved.value, profile);
      if (success) {
        markElementAsAutoFilled(field.element, 'tier2', resolved.reasoning || 'Gemini 3.5 Flash');
        filledCount++;
      }
    }

    return filledCount;
  } catch (err) {
    console.error('JDMatcher: Failed to execute Tier 2 resolver:', err);
    return 0;
  }
}
