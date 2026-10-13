import {
  CandidateAutoFillProfile,
  AutoFillExtractedField,
  AutoFillFieldResult,
} from '../content/types';
import { extractElementLabel, normalizeLabelText } from './label-extractor';
import { matchOptionValue } from './tier1-resolver';

/**
 * Verifies that a user-supplied regex pattern does not contain catastrophic backtracking constructs (ReDoS).
 */
function isReDoSSafePattern(pattern: string): boolean {
  if (!pattern || pattern.length > 120) return false;
  // Disallow nested quantifiers like (a+)+, (.*)+, (a*)*
  if (/\((?:[^()]*[+*]){1,}\)[+*]/.test(pattern)) return false;
  // Disallow duplicate adjacent quantifiers like ++, **
  if (/[+*]{2,}/.test(pattern)) return false;
  // Disallow overlapping open wildcards
  if (/(\.\*|\.\+){2,}/.test(pattern)) return false;
  return true;
}

/**
 * Safely tests a regex pattern against target text without hanging the thread.
 */
function safeRegexMatch(pattern: string, targets: string[]): boolean {
  if (!isReDoSSafePattern(pattern)) {
    // Fall back to safe substring matching if pattern has ReDoS risk
    const cleanPattern = pattern.replace(/[\^$]/g, '').toLowerCase().trim();
    return targets.some(t => t.toLowerCase().includes(cleanPattern));
  }

  try {
    const reg = new RegExp(pattern, 'i');
    return targets.some(t => {
      // Limit target string length to 1000 characters to prevent polynomial runtime
      const capped = t.slice(0, 1000);
      return reg.test(capped);
    });
  } catch {
    return false;
  }
}

/**
 * Matches screening questions against candidate's custom saved responses.
 */
export function resolveSavedResponse(
  field: AutoFillExtractedField,
  profile: CandidateAutoFillProfile
): AutoFillFieldResult | null {
  const element = field.element;
  const labelInfo = element
    ? extractElementLabel(element)
    : { rawLabel: field.label, normalizedLabel: normalizeLabelText(field.label) };

  const normalizedTarget = `${labelInfo.normalizedLabel} ${normalizeLabelText(field.placeholder || '')}`.trim();

  // 1. Check applicationQuestions.customAnswers dictionary (exact/normalized keys)
  if (profile.applicationQuestions?.customAnswers) {
    const customAnswers = profile.applicationQuestions.customAnswers;
    for (const [qKey, answer] of Object.entries(customAnswers)) {
      const normKey = normalizeLabelText(qKey);
      if (normalizedTarget.includes(normKey) || normKey.includes(normalizedTarget)) {
        let finalValue = answer;
        if (field.type === 'select' && field.options) {
          const matched = matchOptionValue(field.options, finalValue);
          if (matched) finalValue = matched;
        }

        return {
          fieldId: field.id,
          elementIndex: field.elementIndex,
          value: finalValue,
          confidence: 0.98,
          tier: 'saved_response',
          strategy: 'saved_response:customAnswers',
        };
      }
    }
  }

  // 2. Check savedResponses array
  if (profile.savedResponses && Array.isArray(profile.savedResponses)) {
    for (const item of profile.savedResponses) {
      if (!item.questionPattern || !item.answer) continue;

      let isMatch = false;

      // Regex or keyword matching with ReDoS defense
      if (item.matchType === 'regex' || item.questionPattern.startsWith('^') || item.questionPattern.endsWith('$')) {
        isMatch = safeRegexMatch(item.questionPattern, [labelInfo.rawLabel, normalizedTarget]);
      } else {
        // Keyword / substring matching
        const normPattern = normalizeLabelText(item.questionPattern);
        isMatch = normalizedTarget.includes(normPattern) || normPattern.includes(normalizedTarget);
      }

      if (isMatch) {
        let finalValue = item.answer;
        if (field.type === 'select' && field.options) {
          const matched = matchOptionValue(field.options, finalValue);
          if (matched) finalValue = matched;
        }

        return {
          fieldId: field.id,
          elementIndex: field.elementIndex,
          value: finalValue,
          confidence: 0.95,
          tier: 'saved_response',
          strategy: `saved_response:${item.questionPattern}`,
        };
      }
    }
  }

  return null;
}
