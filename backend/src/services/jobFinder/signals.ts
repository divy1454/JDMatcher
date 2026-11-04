/**
 * Reads a job posting the way a bench-sales recruiter does:
 * Is C2C allowed? W2 only? USC/GC only? Sponsorship? Clearance? Locals only? Remote? Contract length and rate?
 */
import { JobSignals, NormalizedJob } from './types.js';

const C2C_WORD = String.raw`(?:c2c|corp[\s-]*(?:to|2)[\s-]*corp)`;
const THIRD_PARTY = String.raw`(?:${C2C_WORD}|third[\s-]*part(?:y|ies)|3rd[\s-]*part(?:y|ies)|sub[\s-]*vendors?|vendors?|agencies|staffing\s+(?:firms?|agencies|companies))`;

const C2C_NOT_ALLOWED: RegExp[] = [
  new RegExp(String.raw`\bno\s+${THIRD_PARTY}`, 'i'),
  new RegExp(String.raw`\b${C2C_WORD}\s*(?:is\s*|are\s*)?(?:not\s+(?:allowed|accepted|possible|considered|an\s+option|available|entertained)|n/?a)\b`, 'i'),
  new RegExp(String.raw`\b${C2C_WORD}\s*[:\-]\s*no\b`, 'i'),
  new RegExp(String.raw`\b(?:not\s+open\s+to|cannot\s+work\s+with|can'?t\s+work\s+with|unable\s+to\s+work\s+with|will\s+not\s+work\s+with|won'?t\s+work\s+with|do\s+not\s+work\s+with|does\s+not\s+work\s+with|not\s+accepting|will\s+not\s+accept|cannot\s+accept)\s+${THIRD_PARTY}`, 'i'),
  /\b(?:direct\s+(?:hire|applicants?|candidates?)\s+only|independent\s+candidates?\s+only)\b/i,
];
const W2_ONLY: RegExp[] = [
  /\bw[\s-]?2\s*(?:only|candidates?\s+only|employees?\s+only|employment\s+only|position\s+only)\b/i,
  /\bonly\s+(?:on\s+)?w[\s-]?2\b/i,
  /\bmust\s+be\s+(?:on\s+)?(?:our\s+)?w[\s-]?2\b/i,
];
const C2C_ALLOWED: RegExp[] = [new RegExp(String.raw`\b${C2C_WORD}\b`, 'i')];

/**
 * US citizens only. Equal-opportunity text ("without regard to ... citizenship status") never matches:
 * every rule needs "only", "required", "must" or similar right next to it.
 */
const USC_ONLY: RegExp[] = [
  /\b(?:us|u\.s\.?|united\s+states)\s*citizens?(?:hip)?\s*(?:is\s+|are\s+)?(?:only|required|needed|a\s+must|mandatory)\b/i,
  /\bonly\s+(?:us|u\.s\.?|united\s+states)\s*citizens?\b/i,
  /\bmust\s+(?:be|hold|have|possess)\s+(?:a\s+)?(?:us|u\.s\.?|united\s+states)\s+citizen(?:s|ship)?\b/i,
  /\brequires?\s+(?:active\s+)?(?:us|u\.s\.?|united\s+states)\s+citizenship\b/i,
  /\b(?:usc|us\s*citizens?)\s+only\b/i,
  /\bcitizenship\s*(?:is\s+)?(?:required|mandatory)\b/i,
  // Staffing-post fields: "Citizenship: US Citizen", "Visa: USC" (a list like "USC/GC/H1B" is handled separately)
  /\b(?:visa|citizenship|work\s+authori[sz]ation|work\s+status)\s*(?:status\s*)?[:\-–]\s*(?:usc|us\s*citizens?(?:hip)?|u\.s\.?\s*citizens?(?:hip)?)\b(?!\s*(?:\/|,|&|\bor\b|\band\b))/i,
];
/** Citizens or green card holders only, including ITAR / export-control "U.S. person" rules. */
const USC_GC_ONLY: RegExp[] = [
  /\b(?:green\s*card|gc)\s*(?:holders?\s*)?only\b/i,
  /\bcitizens?(?:hip)?\s+(?:and|or|&|\/)\s+(?:us\s+|u\.s\.?\s+)?(?:green\s*card|gc|permanent\s+residen\w*|lawful\s+permanent\s+residen\w*)\s*(?:holders?\s*)?(?:status\s+)?(?:is\s+|are\s+)?(?:only|required|needed|mandatory|a\s+must)\b/i,
  /\bpermanent\s+residents?\s+only\b/i,
  /\bmust\s+(?:be|qualify\s+as)\s+(?:a\s+)?u\.?\s?s\.?\s+person\b/i,
  /\bu\.?\s?s\.?\s+persons?\b[^.\n]{0,60}\b(?:required|only|must)\b/i,
  /\b(?:itar|ear|export\s+control\w*)\b[^.\n]{0,100}\bu\.?\s?s\.?\s+persons?\b/i,
];
/** "...must be a US citizen or green card holder" is citizens-or-GC, not citizens only. */
const OR_GREEN_CARD = /^\s*(?:,|\/|or|and|&)\s*(?:a\s+)?(?:green\s*card|gc\b|permanent\s+residen|lawful\s+permanent)/i;
/** Same sentence lets green card holders in: "only US citizens, naturalized citizens or US Permanent Residents". */
const GREEN_CARD_IN_SENTENCE = /\b(?:green\s*cards?|permanent\s+residen(?:ts?|cy)|lawful\s+permanent)\b/i;
const GREEN_CARD_EXCLUDED =
  /\b(?:green\s*cards?|permanent\s+residents?)\s*(?:holders?\s*)?(?:are\s+|is\s+|will\s+)?(?:not|ineligible|excluded)\b|\b(?:no|not|excluding|except)\s+(?:for\s+)?(?:green\s*cards?|permanent\s+residents?)\b/i;

/** The sentence around text[start..end]. "U.S." and similar abbreviations don't end a sentence. */
function sentenceAround(text: string, start: number, end: number): string {
  const ends = /[a-z0-9)\]][.!?](?=\s+[A-Z(])|\n/g;
  let from = 0;
  let to = text.length;
  let m: RegExpExecArray | null;
  while ((m = ends.exec(text))) {
    const stop = m.index + m[0].length;
    if (stop <= start) from = stop;
    else if (stop >= end) {
      to = stop;
      break;
    }
  }
  return text.slice(from, to);
}
const NO_SPONSORSHIP: RegExp[] = [
  /\b(?:no|not|unable\s+to|cannot|can'?t|will\s+not|won'?t|does\s+not|do\s+not|doesn'?t|don'?t|(?:is|are)\s+not\s+able\s+to)\s+(?:provide\s+|offer\s+|support\s+|consider\s+)?(?:any\s+)?(?:visa\s+|h[\s-]?1b\s+|employment\s+|immigration\s+)?(?:sponsorship|sponsor)\b/i,
  /\bsponsorship\s+(?:is\s+)?(?:not|un)\s*(?:available|offered|provided|possible|supported)\b/i,
  /\b(?:not\s+eligible|ineligible)\s+for\s+(?:visa\s+|immigration\s+|employment\s+)?sponsorship\b/i,
  /\bwithout\s+(?:the\s+need\s+for\s+|requiring\s+|needing\s+)?(?:current\s+or\s+future\s+|any\s+)?(?:visa\s+|employer\s+)?sponsorship\b/i,
  /\bno\s+h[\s-]?1\s?b\b|\bno\s+h1\b|\bno\s+visa\s+(?:holders?|candidates?|transfers?)\b/i,
  /\bh[\s-]?1\s?b\s+(?:candidates?\s+|holders?\s+|transfers?\s+)?(?:are\s+|is\s+)?not\s+(?:accepted|considered|eligible|allowed)\b/i,
];

/** Visa words that may appear in a "Visa: USC/GC/H1B" list. */
const VISA_TOKEN = String.raw`(?:usc|us\s*citizens?|citizens?|gc[\s-]?ead|gc|green\s*card(?:\s*holders?)?|h[\s-]?1\s?b|h1|h[\s-]?4[\s-]?ead|h4|l[\s-]?2[\s-]?ead|l2|opt(?:[\s-]?ead)?|stem\s*opt|cpt|ead|tn|e[\s-]?3)\b`;
const VISA_LIST = new RegExp(String.raw`\b(${VISA_TOKEN}(?:\s*(?:/|,|&|\bor\b|\band\b)\s*${VISA_TOKEN})+)\s*(only|required)?`, 'gi');

/** Security clearance, most specific first. "Able to obtain a clearance" counts: it needs US citizenship too. */
const CLEARANCE_RULES: Array<[RegExp, string]> = [
  [/\bts\s*\/\s*sci\b/i, 'TS/SCI'],
  [/\btop\s+secret\b/i, 'Top Secret'],
  [/\b(?:full[\s-]*scope|ci|counter[\s-]?intelligence)\s+poly(?:graph)?\b|\bpolygraph\b/i, 'Polygraph'],
  [/\b(?:active|current|interim)\s+secret\b|\bsecret\s+(?:security\s+|level\s+)?clearance\b/i, 'Secret'],
  [/\b(?:q|l|doe)\s+clearance\b/i, 'DOE clearance'],
  [/\b(?:obtain|active|hold|maintain|eligib\w*|current)\s+(?:a\s+|an\s+)?public\s+trust\b|\bpublic\s+trust\s+(?:clearance|position|level|background|suitability|investigation)\b/i, 'Public Trust'],
  [
    /\b(?:ability|able|eligible|eligibility)\s+to\s+(?:obtain|get|acquire|receive)\s+(?:and\s+maintain\s+)?(?:an?\s+)?(?:active\s+)?(?:(?:dod|government|federal|security|secret|ts)\s+)*clearance\b|\bclearable\b/i,
    'Must be able to get a clearance',
  ],
  [/\b(?:active|current)\s+(?:(?:dod|government|federal|security)\s+)?clearance\b|\b(?:security|government|federal|dod|dhs)\s+clearance\b|\bclearance\s+(?:is\s+)?required\b/i, 'Security clearance'],
];

function findClearance(text: string): { label: string; quote: string } | null {
  for (const [re, label] of CLEARANCE_RULES) {
    const hit = firstRealMatch(text, [re]);
    if (hit) return { label, quote: hit.quote };
  }
  return null;
}
const LOCAL_ONLY =
  /\b(locals?\s+only|local\s+candidates?\s+only|only\s+locals?|must\s+be\s+local|local\s+to\s+[a-z .,]{2,40}?\s+(?:only|required)|no\s+relocation|relocation\s+(?:is\s+)?not\s+(?:provided|offered|available))\b/i;
const ONSITE =
  /\b(?:on[\s-]?site\s+(?:only|required|from\s+day\s+(?:1|one)|5\s+days)|100%\s+on[\s-]?site|fully\s+on[\s-]?site|no\s+remote(?![\s-]*(?:only|first|friendly))|not\s+(?:a\s+)?remote(?![\s-]*(?:only|first|friendly|eligible))|remote\s+(?:work\s+)?(?:is\s+)?not\s+(?:available|an\s+option|possible))\b/i;
const HYBRID_TEXT =
  /\bhybrid\s+(?:role|position|work|schedule|model|setting|working|arrangement|opportunity|onsite|on-site)\b|\b\d\s*(?:-\s*\d\s*)?days?\s+(?:a|per)\s+week\s+(?:on[\s-]?site|in[\s-]?(?:the\s+)?office)\b|\(hybrid\)|-\s*hybrid\b/i;
const REMOTE_TEXT =
  /\b(?:100%\s+remote|fully\s+remote|remote\s+(?:position|role|work|opportunity|job|first|-\s*us|us|within\s+the\s+us)|work\s+from\s+home|wfh)\b/i;
const CONTRACT_TEXT =
  /\b(?:contract\s+(?:role|position|opportunity|job|assignment|to\s+hire)|c2c|1099|c2h|contract[\s-]*to[\s-]*hire|w2\s+contract|contract\s+duration|duration\s*:|long[\s-]term\s+contract)\b/i;
const RATE = /\$\s?\d{2,3}(?:\.\d{1,2})?\s*(?:(?:-|–|to)\s*\$?\s?\d{2,3}(?:\.\d{1,2})?\s*)?(?:\/\s*|per\s+)(?:hr|hour)\b/i;
const DURATIONS: RegExp[] = [
  /\b(?:duration|contract\s+(?:length|duration|term)|length\s+of\s+(?:contract|assignment)|term)\s*[:\-]?\s*(\d{1,2})\s*\+?\s*(months?|mos?|years?|yrs?)\b/i,
  /\b(\d{1,2})\s*\+?\s*(months?|mos?)\s*(?:\+\s*)?(?:long[\s-]term\s+)?(?:contract|project|assignment|engagement|duration|w2|c2c|extendable|with\s+(?:possible\s+)?extension)\b/i,
  /\b(\d{1,2})\s*(years?|yrs?)\s+(?:contract|project|assignment|engagement)\b/i,
];

function quote(text: string, re: RegExp): string | null {
  const flags = re.flags.replace('g', '');
  const m = new RegExp(re.source, flags).exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 30);
  const end = Math.min(text.length, m.index + m[0].length + 30);
  return `…${text.slice(start, end).replace(/\s+/g, ' ').trim()}…`;
}

function firstMatch(text: string, list: RegExp[]): RegExp | null {
  for (const re of list) if (re.test(text)) return re;
  return null;
}

/** "No clearance required", "does not require US citizenship", "citizenship is not required" */
const NEGATED_BEFORE = /\b(?:no|not|non|without|never)\b[\s-]*(?:\w+[\s-]+){0,2}$/i;
const NEGATED_AFTER = /^\s*(?:is\s+|are\s+)?not\s+(?:required|needed|necessary|mandatory)/i;

/** First match that isn't negated, with a short quote around it. */
function firstRealMatch(text: string, list: RegExp[]): { re: RegExp; quote: string } | null {
  for (const re of list) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      if (!m[0]) {
        g.lastIndex++;
        continue;
      }
      const before = text.slice(Math.max(0, m.index - 25), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
      if (NEGATED_BEFORE.test(before) || NEGATED_AFTER.test(after)) continue;
      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + m[0].length + 30);
      return { re, quote: `…${text.slice(start, end).replace(/\s+/g, ' ').trim()}…` };
    }
  }
  return null;
}

/** "No H1B, OPT, CPT" / "except OPT and CPT" / "H1B, OPT not accepted": a list of visas that are NOT taken. */
const LIST_NEGATED_BEFORE = /\b(?:no|not|except|excluding|without|nor)\b[\s:,-]*$/i;
const LIST_NEGATED_AFTER = /^\s*(?:candidates?\s+|holders?\s+)?(?:are\s+|is\s+|will\s+)?(?:not\s+(?:be\s+)?(?:accepted|eligible|considered|allowed|entertained)|ineligible)\b/i;

interface VisaListResult {
  restricted: boolean;
  citizensOnly: boolean;
  accepted: string[];
  excluded: string[];
  quote: string | null;
}

function visaList(text: string): VisaListResult {
  const out: VisaListResult = { restricted: false, citizensOnly: false, accepted: [], excluded: [], quote: null };
  VISA_LIST.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VISA_LIST.exec(text))) {
    const items = m[1]
      .toLowerCase()
      .split(/\s*(?:\/|,|&|\bor\b|\band\b)\s*/)
      .map((s) => s.replace(/[\s-]+/g, ''))
      .filter(Boolean);
    if (items.length < 2) continue;
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    const quote = `…${text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 15).replace(/\s+/g, ' ').trim()}…`;
    if (LIST_NEGATED_BEFORE.test(before) || LIST_NEGATED_AFTER.test(after)) {
      if (!out.excluded.length) out.excluded = items;
      if (!out.quote) out.quote = quote;
      continue;
    }
    if (out.accepted.length) continue;
    const citizen = (s: string) => /^(usc|uscitizens?|citizens?)$/.test(s);
    const permanent = (s: string) => citizen(s) || /^(gc|greencard(holders?)?|gcead)$/.test(s);
    out.accepted = items;
    if (items.every(permanent)) {
      out.restricted = true;
      out.citizensOnly = items.every(citizen);
    }
    out.quote = quote;
  }
  return out;
}

/** Bench-sales signals for one posting. */
/** "8+ years of experience", "5-7 years of professional experience", "10+ yrs exp" */
const YEARS_EXPERIENCE = /\b(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?(?:years?|yrs?)\b([^.\n;]{0,40}?)\b(?:experience|exp)\b/gi;
/** "...we have 20 years of experience serving clients" is about the company, not the candidate. */
const COMPANY_YEARS = /\b(?:we|we've|we have|our|company|firm|for over|over the (?:past|last))\b[^.\n]{0,30}$/i;

/** The experience a posting asks for (largest stated minimum, capped at 20), or null. */
export function requiredYears(text: string): number | null {
  let best: number | null = null;
  YEARS_EXPERIENCE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = YEARS_EXPERIENCE.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (COMPANY_YEARS.test(before)) continue;
    const n = Number(m[1]);
    if (n >= 1 && n <= 20) best = best === null ? n : Math.max(best, n);
  }
  return best;
}

export function detectSignals(job: Pick<NormalizedJob, 'title' | 'description' | 'employmentType' | 'isRemote' | 'location'>): JobSignals {
  const text = `${job.title}\n${job.description || ''}`;
  const ev: string[] = [];
  const add = (q: string | null) => {
    if (q && !ev.includes(q)) ev.push(q);
  };

  const notAllowed = firstMatch(text, C2C_NOT_ALLOWED);
  const w2 = firstMatch(text, W2_ONLY);
  const allowed = firstMatch(text, C2C_ALLOWED);
  let c2c: JobSignals['c2c'] = 'unknown';
  if (notAllowed) {
    c2c = 'not_allowed';
    add(quote(text, notAllowed));
  } else if (allowed && !w2) {
    c2c = 'allowed';
    add(quote(text, allowed));
  }
  if (w2) add(quote(text, w2));

  const visas = visaList(text);
  let citizenship: JobSignals['citizenship'] = null;
  const usc = firstRealMatch(text, USC_ONLY);
  const gc = firstRealMatch(text, USC_GC_ONLY);
  if (usc) {
    const m = new RegExp(usc.re.source, usc.re.flags.replace('g', '')).exec(text)!;
    const sentence = sentenceAround(text, m.index, m.index + m[0].length);
    const greenCardToo =
      OR_GREEN_CARD.test(text.slice(m.index + m[0].length, m.index + m[0].length + 60)) ||
      (GREEN_CARD_IN_SENTENCE.test(sentence) && !GREEN_CARD_EXCLUDED.test(sentence));
    citizenship = greenCardToo ? 'usc_gc' : 'usc';
    add(usc.quote);
  } else if (gc) {
    citizenship = 'usc_gc';
    add(gc.quote);
  } else if (visas.restricted) {
    citizenship = visas.citizensOnly ? 'usc' : 'usc_gc';
    add(visas.quote);
  } else if (visas.quote && (visas.accepted.length || visas.excluded.length)) {
    add(visas.quote);
  }
  const citizenshipRequired = citizenship !== null;

  const acceptsH1b = visas.accepted.some((v) => /^h1b?$/.test(v));
  const sponsorRe = firstMatch(text, NO_SPONSORSHIP);
  const noSponsorship = Boolean(sponsorRe) && !acceptsH1b;
  if (sponsorRe && noSponsorship) add(quote(text, sponsorRe));

  const clearance = findClearance(text);
  const clearanceRequired = clearance ? clearance.label : null;
  if (clearance) add(clearance.quote);

  const localOnly = LOCAL_ONLY.test(text);
  if (localOnly) add(quote(text, LOCAL_ONLY));

  let workMode: JobSignals['workMode'] = 'unknown';
  const loc = String(job.location || '');
  if (ONSITE.test(text)) workMode = 'onsite';
  else if (/\bhybrid\b/i.test(loc) || HYBRID_TEXT.test(text)) workMode = 'hybrid';
  else if (job.isRemote || /\bremote\b/i.test(loc) || /\bremote\b/i.test(job.title) || REMOTE_TEXT.test(text)) workMode = 'remote';

  const contract = /contract|temp/i.test(job.employmentType || '') || CONTRACT_TEXT.test(text);
  const rateMatch = RATE.exec(text);
  let durationMonths: number | null = null;
  for (const re of DURATIONS) {
    const m = re.exec(text);
    if (m) {
      const n = Number(m[1]);
      durationMonths = /^y/i.test(m[2]) ? n * 12 : n;
      break;
    }
  }

  return {
    c2c,
    w2Only: Boolean(w2),
    citizenshipRequired,
    citizenship,
    visasAccepted: visas.accepted,
    visasExcluded: visas.excluded,
    noSponsorship,
    clearanceRequired,
    localOnly,
    workMode,
    contract,
    durationMonths,
    rate: rateMatch ? rateMatch[0].replace(/\s+/g, '') : null,
    minYears: requiredYears(job.description || ''),
    evidence: ev.slice(0, 5),
  };
}
