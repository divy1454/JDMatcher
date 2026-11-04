/**
 * Picks the right option for an answer from a dropdown, radio group or checkbox group.
 *
 * Rules, in order:
 *  - placeholders ("--", "Select one", empty) are never picked
 *  - Yes/No answers only match options with the same meaning ("No" never matches "Notice" or "None")
 *  - "decline to answer" answers only match decline options, and vice versa
 *  - countries, US states and degrees are compared by their canonical name (USA = United States, TX = Texas)
 *  - numbers are matched to ranges ("7" -> "6-10 years")
 *  - otherwise whole-word overlap, with a penalty when one side is negated and the other is not
 * If the two best options score the same, the match is reported as ambiguous so the caller can ask the AI.
 */
import {
  normalizeText,
  tokenize,
  stem,
  tokenOverlap,
  diceCoefficient,
  hasNegation,
  hasWord,
} from './text-utils';

export interface OptionMatch {
  option: string;
  index: number;
  score: number;
  ambiguous: boolean;
}

export const DEFAULT_MIN_OPTION_SCORE = 70;

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^(please )?(select|choose|pick)( one| an option| an answer| option| your answer| from the list)?$/,
  /^none selected$/,
  /^select\s+\w+$/, // "Select country", "Select state"
];

/** Index of the option with the biggest number in it ("Up to 25%", "50-75%", "75%+" -> the last), or null. */
export function highestOptionIndex(options: string[]): number | null {
  let best: number | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  options.forEach((label, i) => {
    if (isPlaceholderOption(label) || isDeclineText(normalizeText(label))) return;
    const nums = (String(label).replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length) return;
    // "75%+" / "more than 50%" beat a plain "75%"
    const top = Math.max(...nums) + (/\+|\b(more than|over|above|or more|and above)\b/i.test(label) ? 0.5 : 0);
    if (top > bestValue) {
      bestValue = top;
      best = i;
    }
  });
  return best;
}

export function isPlaceholderOption(text: string | null | undefined): boolean {
  const norm = normalizeText(text);
  return PLACEHOLDER_PATTERNS.some((re) => re.test(norm));
}

const YES_WORDS = new Set(['yes', 'y', 'true', 'yeah', 'yep']);
const NO_WORDS = new Set(['no', 'n', 'false', 'nope']);

const DECLINE_RE =
  /\b(decline|declined|prefer not|dont wish|do not wish|not wish|wish not|choose not|chose not|not to (answer|disclose|say|specify|self identify|identify|provide|state)|rather not|dont want to|do not want to|not specified|not disclosed|undisclosed)\b/;

export function isDeclineText(normalized: string): boolean {
  return DECLINE_RE.test(normalized);
}

type Polarity = 'yes' | 'no' | 'decline' | null;

function answerPolarity(norm: string): Polarity {
  if (!norm) return null;
  if (isDeclineText(norm)) return 'decline';
  const first = norm.split(' ')[0];
  if (YES_WORDS.has(first)) return 'yes';
  if (NO_WORDS.has(first)) return 'no';
  return null;
}

function optionPolarity(norm: string): Polarity {
  if (!norm) return null;
  if (isDeclineText(norm)) return 'decline';
  const words = norm.split(' ');
  if (YES_WORDS.has(words[0])) return 'yes';
  if (NO_WORDS.has(words[0])) return 'no';
  // First-person statements: "I am authorized", "I am not a protected veteran", "I do not require"
  if (words[0] === 'i' || words[0] === 'im') return hasNegation(norm) ? 'no' : 'yes';
  return null;
}

// ---------------------------------------------------------------------------
// Canonical names
// ---------------------------------------------------------------------------

const COUNTRY_ALIASES: Record<string, string> = {
  'us': 'united states',
  'u s': 'united states',
  'usa': 'united states',
  'u s a': 'united states',
  'united states': 'united states',
  'united states of america': 'united states',
  'america': 'united states',
  'uk': 'united kingdom',
  'u k': 'united kingdom',
  'united kingdom': 'united kingdom',
  'great britain': 'united kingdom',
  'england': 'united kingdom',
  'india': 'india',
  'canada': 'canada',
  'mexico': 'mexico',
};

export const US_STATES: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado',
  ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho',
  il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky', la: 'louisiana',
  me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota',
  ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada',
  nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina',
  nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania',
  ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas',
  ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia',
  wi: 'wisconsin', wy: 'wyoming', dc: 'district of columbia', pr: 'puerto rico',
};

const STATE_NAMES = new Set(Object.values(US_STATES));

function canonicalCountry(norm: string): string | null {
  return COUNTRY_ALIASES[norm] || null;
}

// ---------------------------------------------------------------------------
// Phone country codes ("+44", "🇬🇧 +44", "United Kingdom (+44)", "+1 268")
// ---------------------------------------------------------------------------

/** Two-letter country codes seen in phone pickers, as canonical country names. */
const ISO_COUNTRIES: Record<string, string> = {
  us: 'united states', ca: 'canada', gb: 'united kingdom', uk: 'united kingdom', in: 'india', mx: 'mexico',
  au: 'australia', nz: 'new zealand', ie: 'ireland', de: 'germany', fr: 'france', es: 'spain', it: 'italy',
  nl: 'netherlands', pl: 'poland', pt: 'portugal', ch: 'switzerland', se: 'sweden', no: 'norway',
  dk: 'denmark', fi: 'finland', be: 'belgium', at: 'austria', br: 'brazil', ar: 'argentina', co: 'colombia',
  cn: 'china', jp: 'japan', kr: 'south korea', sg: 'singapore', ph: 'philippines', pk: 'pakistan',
  bd: 'bangladesh', lk: 'sri lanka', np: 'nepal', ae: 'united arab emirates', sa: 'saudi arabia',
  il: 'israel', za: 'south africa', ng: 'nigeria', ke: 'kenya', eg: 'egypt', tr: 'turkey', ua: 'ukraine',
  ro: 'romania', vn: 'vietnam', th: 'thailand', my: 'malaysia', id: 'indonesia', jm: 'jamaica', pr: 'puerto rico',
};

const DIAL_RE = /\+\s?(\d{1,4})(?:[\s-](\d{3})(?!\d))?/;
const FLAG_RE = /([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/u;

/** The dial code in a short phone-picker text ("+44", "🇬🇧 +44", "+1 268" -> "1268"), or null. */
export function dialCodeOf(text: string | null | undefined): string | null {
  const s = String(text || '').trim();
  if (!s || s.length > 60) return null;
  const m = s.match(DIAL_RE);
  if (!m) return null;
  return m[2] ? m[1] + m[2] : m[1];
}

/** The country named next to a dial code (by name, two-letter code or flag emoji), or null. */
function dialCountry(text: string): string | null {
  const flag = text.match(FLAG_RE);
  if (flag) {
    const iso = String.fromCharCode(flag[1].codePointAt(0)! - 0x1f1e6 + 97, flag[2].codePointAt(0)! - 0x1f1e6 + 97);
    if (ISO_COUNTRIES[iso]) return ISO_COUNTRIES[iso];
  }
  const rest = normalizeText(text.replace(DIAL_RE, ' ').replace(FLAG_RE, ' '));
  if (!rest) return null;
  return canonicalCountry(rest) || ISO_COUNTRIES[rest] || (Object.values(ISO_COUNTRIES).includes(rest) ? rest : null);
}

/** "Charlotte, NC, USA" -> { city: "charlotte", state: "north carolina" }; null without a comma. */
function cityAndState(raw: string): { city: string; state: string | null } | null {
  if (!raw.includes(',')) return null;
  const parts = raw.split(',').map((p) => normalizeText(p)).filter(Boolean);
  if (parts.length < 2) return null;
  const state = parts.slice(1).map((p) => canonicalState(p)).find(Boolean) || null;
  return { city: parts[0], state };
}

export function canonicalState(norm: string): string | null {
  if (US_STATES[norm]) return US_STATES[norm];
  if (STATE_NAMES.has(norm)) return norm;
  if (norm === 'washington dc' || norm === 'washington d c') return 'district of columbia';
  return null;
}

/** Full state name for an abbreviation ("TX" -> "Texas"), or the input unchanged. */
export function expandUsState(value: string | undefined | null): string {
  if (!value) return '';
  const canon = canonicalState(normalizeText(value));
  if (!canon) return value;
  return canon.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Visa / work-status names compared without spaces or punctuation ("H-1B" = "H1B Visa"). */
const VISA_KEYS: Array<[string, RegExp]> = [
  ['gcead', /^(gcead|greencardead)$/],
  ['uscitizen', /^(us|unitedstates|unitedstatesofamerica)?citizen(ship)?$|^usc$|^uscitizen/],
  ['greencard', /^(greencard|gc|permanentresident|lawfulpermanentresident|lpr)(holder)?$|^greencardholder/],
  ['stemopt', /^stemopt(ead|extension)?$/],
  ['opt', /^(f1)?opt(ead|visa)?$|^optionalpracticaltraining/],
  ['cpt', /^(f1)?cpt(visa)?$|^curricularpracticaltraining/],
  ['h1b', /^h1b?(visa|holder|transfer)?$/],
  ['h4ead', /^h4(visa)?ead$/],
  ['l2ead', /^l2(visa)?ead$/],
  ['tn', /^tn(visa)?$/],
  ['e3', /^e3(visa)?$/],
  ['l1', /^l1[ab]?(visa)?$/],
  ['o1', /^o1(visa)?$/],
];

export function canonicalVisa(norm: string): string | null {
  const compact = norm.replace(/ /g, '');
  if (!compact || compact.length > 40) return null;
  for (const [key, re] of VISA_KEYS) {
    if (re.test(compact)) return key;
  }
  return null;
}

function canonicalDegree(norm: string): string | null {
  if (/\b(phd|ph d|doctorate|doctoral|doctor of philosophy|dphil)\b/.test(norm)) return 'doctorate';
  if (/\b(mba|master of business administration)\b/.test(norm)) return 'mba';
  if (/\b(master|masters|ms|m s|msc|m sc|mtech|m tech|m e|meng|mca|mcs|ma|m a|graduate degree)\b/.test(norm)) return 'master';
  if (/\b(bachelor|bachelors|bs|b s|bsc|b sc|ba|b a|btech|b tech|b e|beng|bca|undergraduate degree|4 year degree|four year degree)\b/.test(norm)) return 'bachelor';
  if (/\b(associate|associates)\b/.test(norm)) return 'associate';
  if (/\b(high school|ged|secondary school)\b/.test(norm)) return 'high school';
  return null;
}

// ---------------------------------------------------------------------------
// Numbers and ranges
// ---------------------------------------------------------------------------

function parseNumber(raw: string): number | null {
  const m = String(raw).trim().match(/^\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(years?|yrs?)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  return m[2] ? n * 1000 : n;
}

function parseRange(raw: string): [number, number] | null {
  const text = String(raw).toLowerCase().replace(/,/g, '').replace(/\$/g, '');
  const num = (s: string) => {
    const v = parseFloat(s);
    return /k$/.test(s) ? v * 1000 : v;
  };
  let m = text.match(/(\d+(?:\.\d+)?k?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?k?)/);
  if (m) return [num(m[1]), num(m[2])];
  m = text.match(/(\d+(?:\.\d+)?k?)\s*\+/);
  if (m) return [num(m[1]), Number.POSITIVE_INFINITY];
  m = text.match(/(\d+(?:\.\d+)?k?)\s*(?:years?\s*)?(?:or more|and above|and up|or above|plus|or greater)/);
  if (m) return [num(m[1]), Number.POSITIVE_INFINITY];
  m = text.match(/(?:more than|over|greater than|above|at least)\s*(\d+(?:\.\d+)?k?)/);
  if (m) return [num(m[1]) + (/(at least)/.test(text) ? 0 : 0.0001), Number.POSITIVE_INFINITY];
  m = text.match(/(?:less than|under|fewer than|below|up to)\s*(\d+(?:\.\d+)?k?)/);
  if (m) return [0, num(m[1]) - (/up to/.test(text) ? 0 : 0.0001)];
  m = text.match(/^\s*(\d+(?:\.\d+)?k?)\s*(?:years?|yrs?)?\s*$/);
  if (m) return [num(m[1]), num(m[1])];
  return null;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** 0..100 score for how well `option` answers with `target`. */
/** The qualifier on standard EEO race options: "Asian (Not Hispanic or Latino)". */
const NOT_HISPANIC = /\(?\s*\b(?:not|non)[\s-]+hispanic(?:\s+or\s+latino)?\s*\)?/i;

export function scoreOption(target: string, option: string): number {
  const t = normalizeText(target);
  const o = normalizeText(option);
  if (!t || !o) return 0;
  if (t === o) return 100;
  // "Asian" means "Asian (Not Hispanic or Latino)" on Greenhouse/Ashby EEO forms; the "Not" used to read
  // as the opposite answer, so no race ever matched
  if (NOT_HISPANIC.test(option) && !/\b(hispanic|latino|latina|latinx)\b/.test(t)) {
    const bare = option.replace(NOT_HISPANIC, ' ').trim();
    if (normalizeText(bare)) return scoreOption(target, bare);
  }

  // 1. Yes / No / Decline answers
  const tp = answerPolarity(t);
  if (tp) {
    const op = optionPolarity(o);
    if (op !== tp) return 0;
    if (tp === 'decline') return 95;
    // Prefer a plain "Yes"/"No" over a long sentence; between sentences prefer the closest wording.
    if (o.split(' ').length === 1) return 96;
    const overlap = tokenOverlap(tokenize(t).map(stem), tokenize(o).map(stem));
    return 88 + Math.round(6 * overlap.coverageB);
  }
  if (isDeclineText(o)) return 0;

  // 2a. Phone country codes: the code must be the same, and so must the country when both name one
  const tDial = dialCodeOf(target);
  const oDial = dialCodeOf(option);
  if (tDial && oDial) {
    if (tDial !== oDial) return 0;
    const tc = dialCountry(target);
    const oc = dialCountry(option);
    if (tc && oc) return tc === oc ? 99 : 0;
    return 90;
  }

  // 2. Countries, states, degrees
  const tc = canonicalCountry(t);
  const oc = canonicalCountry(o);
  if (tc && oc) return tc === oc ? 97 : 0;
  const ts = canonicalState(t);
  const os = canonicalState(o);
  if (ts && os) return ts === os ? 97 : 0;
  const tVisa = canonicalVisa(t);
  const oVisa = canonicalVisa(o);
  if (tVisa && oVisa) return tVisa === oVisa ? 96 : 0;
  const td = canonicalDegree(t);
  if (td) {
    const od = canonicalDegree(o);
    if (od) return od === td ? 94 : 0;
  }

  // 2b. Places: "Charlotte, North Carolina" against location suggestions like "Charlotte, NC, USA"
  const tPlace = cityAndState(target);
  const oPlace = cityAndState(option);
  if (tPlace && oPlace && tPlace.city === oPlace.city) {
    if (tPlace.state && oPlace.state) return tPlace.state === oPlace.state ? 96 : 0;
    return 85;
  }
  if (tPlace && oPlace && tPlace.state && oPlace.state) return 0; // a different city

  // 3. Numbers against ranges ("7" -> "6-10 years")
  const tn = parseNumber(target);
  if (tn !== null) {
    const range = parseRange(option);
    if (range) return tn >= range[0] && tn <= range[1] ? 92 : 0;
  }

  // 4. Whole-word overlap
  const T = tokenize(t).map(stem);
  const O = tokenize(o).map(stem);
  const ov = tokenOverlap(T, O);
  let score: number;
  if (ov.inter === 0) {
    const dice = diceCoefficient(t, o);
    score = dice >= 0.85 ? Math.round(60 + dice * 30) : 0;
  } else if (ov.coverageA === 1 && ov.coverageB === 1) {
    score = 95;
  } else if (ov.coverageA === 1) {
    score = Math.round(72 + 18 * ov.coverageB); // option contains every word of the answer
  } else if (ov.coverageB === 1) {
    score = Math.round(68 + 18 * ov.coverageA); // answer contains every word of the option
  } else {
    score = Math.round(30 + 40 * ((2 * ov.inter) / (ov.sizeA + ov.sizeB)));
  }

  // "I am a protected veteran" must never match "I am not a protected veteran"
  if (score > 0 && hasNegation(t) !== hasNegation(o)) score = Math.min(score, 40);
  return score;
}

/**
 * Best option for `target`, or null when nothing reaches `minScore`.
 * Placeholder options are skipped.
 */
export function matchOption(
  options: string[] | undefined | null,
  target: string | undefined | null,
  minScore = DEFAULT_MIN_OPTION_SCORE
): OptionMatch | null {
  if (!options || options.length === 0 || !target || !normalizeText(target)) return null;

  const scored: OptionMatch[] = [];
  options.forEach((option, index) => {
    if (isPlaceholderOption(option)) return;
    const score = scoreOption(target, option);
    if (score > 0) scored.push({ option, index, score, ambiguous: false });
  });
  if (scored.length === 0) return null;
  // Highest score; among equals the shortest wording, then the first one
  scored.sort((a, b) => b.score - a.score || a.option.length - b.option.length || a.index - b.index);
  const result = scored[0];
  if (result.score < minScore) return null;
  // Two different options with the same score below "certain" means we cannot tell them apart.
  // The same text twice ("+1" for both the US and Canada) is not a real choice.
  const rivals = scored.filter((s) => s.score === result.score && normalizeText(s.option) !== normalizeText(result.option));
  result.ambiguous = result.score < 95 && rivals.length > 0;
  return result;
}

/** Treats an answer as a checkbox state. Returns null when the answer is not a yes/no style value. */
export function answerToChecked(value: string | undefined | null): boolean | null {
  const norm = normalizeText(value);
  if (!norm) return null;
  if (/^(yes|y|true|checked|check|agree|i agree|accept|i accept|acknowledge|i acknowledge|confirm|i confirm|1|on)$/.test(norm)) return true;
  if (/^(no|n|false|unchecked|uncheck|disagree|0|off)$/.test(norm)) return false;
  if (hasWord(norm, 'agree') || hasWord(norm, 'accept') || hasWord(norm, 'acknowledge') || hasWord(norm, 'consent')) {
    return !hasNegation(norm);
  }
  return null;
}
