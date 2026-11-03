/**
 * Tier "saved": answers the recruiter saved for this candidate (or that were submitted before).
 *
 * Matching is done on whole words of the real question. A saved "Notice period" answer can no
 * longer match a "No" radio button, and an unlabeled field matches nothing.
 */
import { CandidateAutoFillProfile, AutoFillExtractedField, AutoFillFieldResult, SavedResponseItem } from '../content/types';
import { normalizeText, meaningfulTokens, tokenOverlap } from './text-utils';
import { matchOption, answerToChecked } from './option-matcher';

const MIN_SCORE = 0.72;

/** Verifies that a user-supplied regex pattern does not contain catastrophic backtracking constructs (ReDoS). */
function isReDoSSafePattern(pattern: string): boolean {
  if (!pattern || pattern.length > 120) return false;
  if (/\((?:[^()]*[+*]){1,}\)[+*]/.test(pattern)) return false; // (a+)+
  if (/[+*]{2,}/.test(pattern)) return false;
  if (/(\.\*|\.\+){2,}/.test(pattern)) return false;
  return true;
}

function safeRegexMatch(pattern: string, target: string): boolean {
  if (!target) return false;
  if (!isReDoSSafePattern(pattern)) return false;
  try {
    return new RegExp(pattern, 'i').test(target.slice(0, 1000));
  } catch {
    return false;
  }
}

/** 0..1 similarity between a saved question and the question on the page. */
export function questionSimilarity(savedQuestion: string, pageQuestion: string): number {
  const a = normalizeText(savedQuestion);
  const b = normalizeText(pageQuestion);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const P = meaningfulTokens(a);
  const Q = meaningfulTokens(b);
  if (P.length === 0 || Q.length === 0) return 0;
  const ov = tokenOverlap(P, Q);
  if (ov.inter === 0) return 0;
  // Every word of the saved question appears in the page question
  if (ov.coverageA === 1) {
    if (ov.sizeA >= 2) return 0.8 + 0.2 * ov.coverageB;
    // One-word saved questions ("Salary") only match very short page questions
    return ov.sizeB <= 3 ? 0.85 : 0.4;
  }
  return ov.jaccard;
}

interface Candidate {
  question: string;
  answer: string;
  score: number;
  strategy: string;
  item?: SavedResponseItem;
}

function candidates(profile: CandidateAutoFillProfile, question: string): Candidate[] {
  const out: Candidate[] = [];
  const custom = profile.applicationQuestions?.customAnswers || {};
  for (const [q, answer] of Object.entries(custom)) {
    if (!answer) continue;
    out.push({ question: q, answer, score: questionSimilarity(q, question), strategy: 'saved_response:customAnswers' });
  }
  for (const item of profile.savedResponses || []) {
    const pattern = item.questionPattern || item.question || '';
    if (!pattern || !item.answer) continue;
    const score =
      item.matchType === 'regex' || pattern.startsWith('^') || pattern.endsWith('$')
        ? safeRegexMatch(pattern, question)
          ? 0.95
          : 0
        : questionSimilarity(pattern, question);
    out.push({ question: pattern, answer: item.answer, score, strategy: `saved_response:${pattern.slice(0, 60)}`, item });
  }
  return out.filter((c) => c.score >= MIN_SCORE).sort((x, y) => y.score - x.score);
}

/** Matches the field's question against the candidate's saved answers. */
export function resolveSavedResponse(
  field: AutoFillExtractedField,
  profile: CandidateAutoFillProfile
): AutoFillFieldResult | null {
  const question = field.question || field.label || '';
  if (!normalizeText(question)) return null;

  for (const c of candidates(profile, question)) {
    let value = c.answer;
    let values: string[] | undefined;

    if (field.type === 'select' || field.type === 'radio_group') {
      const m = matchOption(field.options, value);
      if (!m || m.ambiguous) continue; // saved answer doesn't fit these options
      value = m.option;
    } else if (field.type === 'checkbox_group') {
      const parts = value.split(/[;|\n]/).map((s) => s.trim()).filter(Boolean);
      const picked = parts
        .map((part) => matchOption(field.options, part))
        .filter((m): m is NonNullable<typeof m> => Boolean(m && !m.ambiguous))
        .map((m) => m.option);
      if (picked.length === 0) continue;
      values = Array.from(new Set(picked));
      value = values.join('; ');
    } else if (field.type === 'checkbox') {
      if (answerToChecked(value) === null) continue;
    } else if (field.type === 'file') {
      return null;
    }

    const unconfirmed = c.item?.source === 'ai';
    return {
      fieldId: field.id,
      elementIndex: field.elementIndex,
      value,
      values,
      confidence: Math.min(0.98, c.score),
      tier: 'saved_response',
      strategy: c.strategy,
      needsReview: unconfirmed || undefined,
      reason: unconfirmed ? 'Saved from an earlier AI suggestion that was never confirmed.' : undefined,
    };
  }
  return null;
}
