/**
 * Tier 1: answers that come straight from the candidate profile, with no AI.
 *
 * Accuracy rules:
 *  - Questions are matched on the real question text (group legend for radios), never on an option label.
 *  - Long questions are checked against question rules first, so "relocate to another state?" is not
 *    answered with the candidate's state.
 *  - Missing data is never invented. No default years, degree, major or veteran/disability answers.
 *    Unknown -> the field goes to saved answers / AI, or is flagged for the recruiter.
 *  - Sponsorship answers are checked against the visa type; a conflict is flagged instead of filled.
 */
import {
  CandidateAutoFillProfile,
  AutoFillExtractedField,
  AutoFillFieldResult,
  AutoFillFieldType,
} from '../content/types';
import { normalizeText, wordCount, hasWord, meaningfulTokens } from './text-utils';
import { matchOption, isDeclineText, expandUsState, answerToChecked, canonicalVisa, highestOptionIndex } from './option-matcher';

export interface Tier1Context {
  /** Number of file inputs on the page (one unlabeled upload is the resume). */
  fileFieldCount: number;
  /** Company the candidate is applying to, when known. */
  companyName?: string;
  /** The page has a separate phone country-code field. */
  hasSeparateCountryCode?: boolean;
}

interface Answer {
  value: string;
  values?: string[];
  needsReview?: boolean;
  reason?: string;
  skip?: boolean;
  /** Do not hand this question to saved answers or AI. */
  final?: boolean;
  /** Choose the option with the biggest number (travel percentage). */
  pick?: 'highest';
  /** Tried in order when `value` matches no option. */
  alternatives?: string[];
}

interface Q {
  /** Question as shown. */
  raw: string;
  /** Normalised question (or field name when there is no label). */
  norm: string;
  words: number;
  /** Looks like a field name ("First Name") rather than a sentence. */
  isShort: boolean;
  autocomplete: string;
  /** Option labels, normalised. */
  options: string[];
}

type Profile = CandidateAutoFillProfile;

interface Rule {
  name: string;
  /** Only for short field-name labels. */
  shortOnly?: boolean;
  kinds?: AutoFillFieldType[];
  /** Never let saved answers or AI answer this question type (EEO, legal). */
  sensitive?: boolean;
  test: (q: Q, f: AutoFillExtractedField) => boolean;
  answer: (p: Profile, q: Q, f: AutoFillExtractedField, ctx: Tier1Context) => Answer | null;
}

const DECLINE = 'Decline to self-identify';

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');

function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const n = normalizeText(v);
    if (/^(yes|y|true|1)$/.test(n)) return true;
    if (/^(no|n|false|0)$/.test(n)) return false;
  }
  return null;
}

function present(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function isAssumed(p: Profile, key: string): boolean {
  return Array.isArray(p.screening?.assumed) && p.screening!.assumed!.includes(key);
}

function assumedReview(p: Profile, key: string, label: string): Partial<Answer> {
  return isAssumed(p, key)
    ? { needsReview: true, reason: `${label} is not set in the candidate profile, so the default was used.` }
    : {};
}

function isYesNoQuestion(q: Q): boolean {
  if (q.options.length > 0 && q.options.length <= 4 && q.options.some((o) => /^(yes|no)\b/.test(o))) return true;
  return /^(do|does|are|is|have|has|will|would|can|could|did|were|was)\b/.test(q.norm);
}

// ---------------------------------------------------------------------------
// Visa / sponsorship knowledge
// ---------------------------------------------------------------------------

function visaType(p: Profile): string {
  return present(p.screening?.currentSponsorshipType) || present(p.personal?.citizenshipStatus) || '';
}

/** true = needs sponsorship now or later, false = never, null = unknown */
function visaNeedsSponsorship(visa: string): boolean | null {
  const key = canonicalVisa(normalizeText(visa));
  if (!key) return null;
  if (key === 'uscitizen' || key === 'greencard' || key === 'gcead') return false;
  return true;
}

/** Visas that allow working for any employer today (EAD-based or permanent). */
function unrestrictedToday(visa: string): boolean | null {
  const key = canonicalVisa(normalizeText(visa));
  if (!key) return null;
  return ['uscitizen', 'greencard', 'gcead', 'opt', 'stemopt', 'h4ead', 'l2ead'].includes(key);
}

function isEadVisa(visa: string): boolean {
  const key = canonicalVisa(normalizeText(visa));
  return key === 'opt' || key === 'stemopt' || key === 'h4ead' || key === 'l2ead';
}

function sponsorshipNeed(p: Profile): { value: boolean | null; conflict?: string } {
  const visa = visaType(p);
  const explicit = toBool(p.screening?.requireSponsorship);
  const fromVisa = visaNeedsSponsorship(visa);
  if (explicit === false && fromVisa === true) {
    return { value: null, conflict: `Profile says no sponsorship is needed, but the visa is ${visa}. Fix the candidate profile.` };
  }
  if (explicit === true && fromVisa === false) {
    return { value: null, conflict: `Profile says sponsorship is needed, but the status is ${visa}. Fix the candidate profile.` };
  }
  if (explicit !== null) return { value: explicit };
  return { value: fromVisa };
}

const OTHER_COUNTRY_RE =
  /\b(canada|canadian|united kingdom|uk|britain|india|europe|european union|eu|australia|germany|mexico|singapore|ireland|netherlands|philippines)\b/;

// ---------------------------------------------------------------------------
// Experience helpers
// ---------------------------------------------------------------------------

const YEARS_FILLER = new Set([
  'year', 'yr', 'experience', 'total', 'overall', 'professional', 'work', 'working', 'industry',
  'it', 'field', 'career', 'number', 'many', 'much', 'paid', 'full', 'time', 'fulltime', 'post',
  'graduation',
]);

/** Questions about another person (referrer, manager, emergency contact) must not get the candidate's details. */
const SOMEONE_ELSE_RE = /\b(referr\w*|reference|recruiter|hiring manager|manager|supervisor|emergency|spouse|parent|guardian|friend)\b/;

/** "How many years of experience do you have?" -> generic. "...with Kubernetes?" -> skill specific. */
function isSkillSpecificYears(q: Q): boolean {
  const rest = meaningfulTokens(q.raw).filter((t) => !YEARS_FILLER.has(t) && !/^\d+$/.test(t));
  // "relevant" experience depends on the job, so the AI should answer it with the JD
  return rest.length > 0 || hasWord(q.norm, 'relevant');
}

function totalYears(p: Profile): number | null {
  const direct = Number(p.totalYearsExperience);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const fromHistory = Number(p.workHistory?.[0]?.totalYearsExperience);
  if (Number.isFinite(fromHistory) && fromHistory > 0) return fromHistory;
  return null;
}

function weeksFromProfile(p: Profile): number | null {
  const raw = present(p.screening?.noticePeriodWeeks);
  if (raw === null) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isoDateAfterWeeks(weeks: number): string {
  const d = new Date(Date.now() + weeks * 7 * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function salaryValue(p: Profile): string | null {
  return present(p.screening?.desiredSalaryUsd) || present(p.screening?.desiredSalary);
}

function parseMoney(v: string): number | null {
  const m = v.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] ? n * 1000 : n;
}

// ---------------------------------------------------------------------------
// Consent checkboxes
// ---------------------------------------------------------------------------

const MARKETING_RE =
  /\b(subscribe|newsletter|marketing|promotional|job alerts?|alerts|updates about|future (openings|opportunities|jobs|roles)|keep me (informed|updated)|text messages?|sms|whatsapp|talent (community|network|pool)|contact me about (other|future)|similar (jobs|roles|opportunities))\b/;
const CERTIFY_RE =
  /\b(certify|attest|information (i have )?(provided|given|submitted) (is|are) (true|accurate|correct|complete)|true and (complete|correct|accurate)|electronic signature|e signature|signature)\b/;
const BACKGROUND_RE = /\b(background (check|screening|investigation)|drug (test|screen)|consumer report)\b/;
const CONSENT_RE = /\b(agree|consent|acknowledge|accept|have read|read and understood|understand)\b/;
const POLICY_RE =
  /\b(privacy|terms|policy|data|personal information|processing|notice|conditions|gdpr|ccpa|retention|statement|disclosure)\b/;

function consentAnswer(text: string): Answer | null {
  const n = normalizeText(text);
  if (MARKETING_RE.test(n)) return { value: 'No', final: true };
  if (CERTIFY_RE.test(n)) {
    return { value: 'Yes', needsReview: true, reason: "Certification signed on the candidate's behalf. Confirm they approved it.", final: true };
  }
  if (BACKGROUND_RE.test(n) && CONSENT_RE.test(n)) {
    return { value: 'Yes', needsReview: true, reason: 'Background-check consent. Confirm the candidate agreed to it.', final: true };
  }
  if (CONSENT_RE.test(n) && POLICY_RE.test(n)) return { value: 'Yes', final: true };
  return null;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const EEO_KINDS: AutoFillFieldType[] = ['select', 'radio_group', 'dropdown_button', 'combobox', 'checkbox_group'];
const CHOICE_KINDS: AutoFillFieldType[] = ['select', 'radio_group', 'dropdown_button', 'combobox', 'text', 'checkbox'];

const QUESTION_RULES: Rule[] = [
  // ---- Files: upload the resume only where a resume is asked for; never as a cover letter ----
  {
    name: 'file_upload',
    kinds: ['file'],
    test: () => true,
    answer: (p, q, _f, ctx) => {
      const isResume = /\b(resume|cv|curriculum)\b/.test(q.norm);
      const isOtherDocument =
        /\b(cover|letter|transcript|portfolio|sample|certific\w*|reference|photo|picture|passport|license|id|document|offer)\b/.test(q.norm);
      const onlyUpload = ctx.fileFieldCount === 1 && !isOtherDocument;
      if ((isResume || onlyUpload) && p.resumeFileBase64) {
        // The backend makes a .txt copy from resume text when no real file was uploaded
        if (p.resumeMimeType === 'text/plain') {
          return {
            value: '__RESUME_FILE__',
            final: true,
            needsReview: true,
            reason: 'Only a plain-text copy of the resume is on file. Upload the real resume (PDF or Word) in the portal.',
          };
        }
        return { value: '__RESUME_FILE__', final: true };
      }
      return { value: '', skip: true };
    },
  },

  // ---- Consent / marketing / certification checkboxes ----
  {
    name: 'consent_checkbox',
    kinds: ['checkbox'],
    test: (q) => consentAnswer(q.raw) !== null,
    answer: (_p, q) => consentAnswer(q.raw),
  },
  {
    name: 'consent_group',
    kinds: ['checkbox_group'],
    // Long options read like consents, but EEO answers are long too ("No, I do not have a disability")
    test: (q) =>
      q.options.length > 0 &&
      q.options.every((o) => o.split(' ').length >= 5) &&
      !/\b(disability|disabilities|disabled|veteran|gender|race|ethnicity|hispanic|latino|pronouns?|orientation)\b/.test(q.norm),
    answer: (_p, _q, f) => {
      const values: string[] = [];
      let review: Answer | null = null;
      for (const label of f.options || []) {
        const a = consentAnswer(label);
        if (!a) return null;
        if (a.value === 'Yes') values.push(label);
        if (a.needsReview) review = a;
      }
      return { value: values.join('; '), values, final: true, needsReview: review?.needsReview, reason: review?.reason };
    },
  },

  // ---- Work authorization ----
  {
    name: 'visa_type',
    kinds: CHOICE_KINDS,
    test: (q) =>
      /\b(visa|immigration|citizenship|work authori[sz]ation|work permit|employment authori[sz]ation)\s+(status|type|category)\b|\bwhat (is your|type of) (current )?(visa|work authori[sz]ation|immigration)\b|\bcurrent (visa|immigration)\b|\bwhich (visa|work authori[sz]ation)\b/.test(q.norm) &&
      !/\b(require|need)\b.*\bsponsor/.test(q.norm),
    answer: (p) => {
      const v = visaType(p);
      return v ? { value: v } : null;
    },
  },
  {
    name: 'sponsorship',
    sensitive: true,
    test: (q) => /\bsponsor/.test(q.norm),
    answer: (p, q) => {
      if (OTHER_COUNTRY_RE.test(q.norm)) return null;
      const need = sponsorshipNeed(p);
      if (need.conflict) return { value: '', needsReview: true, reason: need.conflict, final: true };
      if (need.value === null) {
        return { value: '', needsReview: true, reason: 'Sponsorship need is not set in the candidate profile.', final: true };
      }
      const inverted =
        /\bwithout (requiring |needing |the need for |need for |any )?(visa |employment |employer |work |immigration )?sponsor|\bnot (require|need)\b.*\bsponsor|\bno sponsorship\b/.test(q.norm);
      const answer: Answer = { value: yesNo(inverted ? !need.value : need.value), final: true };
      const currentOnly = /\b(currently|now|at this time|today|presently)\b/.test(q.norm) && !/\bfuture\b/.test(q.norm);
      if (currentOnly && need.value && isEadVisa(visaType(p))) {
        answer.needsReview = true;
        answer.reason = 'This asks only about sponsorship now. EAD-based visas (OPT, H4-EAD, L2-EAD) usually do not need it today.';
      }
      return answer;
    },
  },
  {
    name: 'authorized_any_employer',
    sensitive: true,
    test: (q) => /\b(any employer|unrestricted|without (any )?restriction)\b/.test(q.norm) && /\bwork\b/.test(q.norm),
    answer: (p, q) => {
      if (OTHER_COUNTRY_RE.test(q.norm)) return null;
      const v = unrestrictedToday(visaType(p));
      return v === null ? null : { value: yesNo(v), final: true };
    },
  },
  {
    name: 'authorized_to_work',
    sensitive: true,
    test: (q) =>
      /\b(legally )?(authori[sz]ed|eligible|permitted|allowed|entitled)\b.{0,60}\b(work|employment|employed)\b/.test(q.norm) ||
      /\bright to work\b|\bwork authori[sz]ation\b|\bauthori[sz]ation to work\b/.test(q.norm),
    answer: (p, q) => {
      if (OTHER_COUNTRY_RE.test(q.norm)) return null;
      const auth = toBool(p.screening?.authorizedToWorkInUS);
      if (auth === null) {
        return { value: '', needsReview: true, reason: 'Work authorization is not set in the candidate profile.', final: true };
      }
      return { value: yesNo(auth), final: true, ...assumedReview(p, 'authorizedToWorkInUS', 'Work authorization') };
    },
  },

  // ---- Other screening ----
  {
    name: 'security_clearance',
    test: (q) => /\b(security )?clearance\b/.test(q.norm) && !/\bbackground\b/.test(q.norm),
    answer: (p, q) => {
      const level = present(p.screening?.securityClearanceLevel);
      if (!level) return null;
      const has = !/^(none|no|n a|na|not applicable)$/.test(normalizeText(level));
      return isYesNoQuestion(q) ? { value: yesNo(has) } : { value: level };
    },
  },
  {
    name: 'relocate',
    test: (q) => /\brelocat/.test(q.norm),
    answer: (p) => {
      const v = toBool(p.screening?.willingToRelocate);
      return v === null ? null : { value: yesNo(v), ...assumedReview(p, 'willingToRelocate', 'Willingness to relocate') };
    },
  },
  {
    // Recruiter's standing answer: always willing to travel, and the highest percentage when one is asked.
    // A percentage saved on the candidate wins.
    name: 'travel',
    test: (q) =>
      (/\btravel\b/.test(q.norm) && /\b(willing|able|open|comfortable|percent|percentage|how much|available|availability|if required|required)\b/.test(q.norm)) ||
      /^(travel|travel percentage|percentage of travel|travel requirements?)$/.test(q.norm),
    answer: (p, q) => {
      const asksPercent = /\b(percent|percentage|how much|what portion|amount)\b/.test(q.norm) || /%/.test(q.raw) || q.options.some((o) => /\d/.test(o));
      const pct = present(p.screening?.willingToTravelPercentage);
      if (pct) {
        const n = parseFloat(pct);
        if (!asksPercent) return Number.isFinite(n) ? { value: yesNo(n > 0) } : null;
        return { value: /%$/.test(pct) ? pct : `${pct}%` };
      }
      if (asksPercent) return { value: '100%', pick: 'highest' };
      // Yes/no wording; if the options turn out to be percentages, the highest one
      return { value: 'Yes', pick: 'highest' };
    },
  },
  {
    // Recruiter's standing answer: never related to (or knows) anyone at the employer
    name: 'related_to_employee',
    test: (q) =>
      /\b(are you|is anyone|do you have|have you)\b.{0,15}\b(related|relatives?|family members?)\b|\brelated to (anyone|someone|any (current )?employees?)\b|\b(relatives?|family members?)\b.{0,40}\b(work|works|working|employ\w*)\b|\b(know|acquainted with)\b.{0,15}\b(anyone|someone|any (current )?employees?)\b.{0,40}\b(work|works|working|employ\w*)\b/.test(q.norm),
    answer: () => ({ value: 'No' }),
  },
  {
    // Recruiter's standing answer: the job was found on LinkedIn (or the closest option)
    name: 'job_source',
    test: (q) =>
      /\bhow did you (hear|learn|find out|find|come across|discover)\b|\bwhere did you (hear|find|see|learn|come across|discover)\b|^(source|job source|application source|referral source|lead source|how did you hear about us)$/.test(q.norm),
    answer: () => ({
      value: 'LinkedIn',
      alternatives: ['Social media', 'Social network', 'Job board', 'Online job board', 'Job posting', 'Job site', 'Internet', 'Online', 'Other'],
    }),
  },
  {
    name: 'age_18',
    test: (q) => /\b(18|eighteen)\b/.test(q.norm) && /\b(age|years old|older|over)\b/.test(q.norm),
    answer: () => ({ value: 'Yes' }),
  },
  {
    name: 'previously_employed_here',
    test: (q) =>
      /\b(previously|ever|formerly|before|in the past)\b.{0,30}\b(employed|worked)\b.{0,12}\b(for|at|by|here|us)\b|\b(former|current|ex) employee\b|\bworked (here|for us)\b/.test(q.norm) &&
      !/\bworked with\b/.test(q.norm),
    answer: (p, _q, _f, ctx) => {
      const company = normalizeText(ctx.companyName);
      if (!company || !p.workHistory || p.workHistory.length === 0) return null;
      const worked = p.workHistory.some((w) => {
        const c = normalizeText(w.companyName);
        return Boolean(c) && (c.includes(company) || company.includes(c));
      });
      return { value: yesNo(worked) };
    },
  },
  {
    name: 'currently_employed',
    test: (q) => /^are you currently employed\b/.test(q.norm) && !/\b(by|at|with)\b/.test(q.norm),
    answer: (p) => {
      const current = p.workHistory?.[0]?.isCurrentRole;
      return typeof current === 'boolean' ? { value: yesNo(current) } : null;
    },
  },
  {
    name: 'start_date',
    test: (q) =>
      /\b(notice period|how soon (can|could) you (start|join)|earliest (possible |available )?start|when (can|could|would) you (start|begin|join)|available to start|availability to start|start date|date available|available start|joining date|availability date)\b/.test(q.norm),
    answer: (p, q, f) => {
      const weeks = weeksFromProfile(p);
      if (weeks === null) return null;
      if (f.inputType === 'date') {
        return { value: isoDateAfterWeeks(weeks), needsReview: true, reason: 'Start date was calculated from the notice period.' };
      }
      if (isYesNoQuestion(q)) return null; // "Can you start immediately?" needs judgement
      const value = weeks === 0 ? 'Immediately' : `${weeks} week${weeks === 1 ? '' : 's'}`;
      return { value, ...assumedReview(p, 'noticePeriodWeeks', 'Notice period') };
    },
  },
  {
    name: 'desired_pay',
    test: (q) =>
      /\b(salary|compensation|pay rate|hourly rate|bill rate|rate expectation|expected rate|desired rate|ctc|expected pay|desired pay|wage|pay expectation)\b/.test(q.norm) &&
      !/\b(current|present|previous|last)\b.{0,15}\b(salary|ctc|compensation|pay|rate)\b/.test(q.norm),
    answer: (p, q) => {
      const v = salaryValue(p);
      if (!v) return null;
      const n = parseMoney(v);
      const hourly = /\b(hour|hourly|per hr|hr|rate)\b/.test(q.norm) && !/\bsalary\b/.test(q.norm);
      const annual = /\b(annual|annually|yearly|per year|salary|ctc|base)\b/.test(q.norm);
      if (n !== null && hourly && n > 1000) return null; // stored value is annual, question wants hourly
      if (n !== null && annual && !hourly && n < 1000) return null; // stored value is hourly
      return { value: v };
    },
  },
  {
    name: 'total_years_experience',
    test: (q) =>
      /\b(years?|yrs?) of (\w+ ){0,3}experience\b|\bhow many years\b|\btotal experience\b|\boverall experience\b|\byears experience\b/.test(q.norm),
    answer: (p, q) => {
      if (isSkillSpecificYears(q)) return null; // the AI answers this from the resume
      const years = totalYears(p);
      return years === null ? null : { value: String(Math.round(years)) };
    },
  },

  // ---- Voluntary self-identification (never guessed) ----
  {
    name: 'eeo_orientation_pronouns',
    kinds: EEO_KINDS,
    sensitive: true,
    test: (q) => /\b(sexual orientation|pronoun|pronouns|transgender|lgbt|lgbtq)\b/.test(q.norm),
    answer: () => ({ value: DECLINE, final: true }),
  },
  {
    name: 'eeo_gender',
    kinds: EEO_KINDS,
    sensitive: true,
    test: (q) => /\b(gender|sex)\b/.test(q.norm),
    answer: (p) => ({ value: present(p.equalOpportunity?.eeoGender) || present(p.personal?.gender) || DECLINE, final: true }),
  },
  {
    // "Are you Hispanic/Latino?" is a yes/no question asked before a separate race question (Rippling,
    // many US forms). It used to get the race ("Asian"), which matches no option.
    name: 'eeo_hispanic',
    kinds: EEO_KINDS,
    sensitive: true,
    // Also the "Ethnicity" question whose options are "Hispanic or Latino" / "Not Hispanic or Latino"
    test: (q) => {
      if (/\brace\b/.test(q.norm)) return false;
      const aboutHispanic = /\b(hispanic|latino|latina|latinx|latine)\b/.test(q.norm);
      return (aboutHispanic && isYesNoQuestion(q)) || q.options.some((o) => /\b(not|non) hispanic\b/.test(o));
    },
    answer: (p, q) => {
      const race = present(p.equalOpportunity?.eeoRace) || present(p.personal?.raceEthnicity);
      if (!race) return { value: DECLINE, final: true };
      const n = normalizeText(race);
      if (isDeclineText(n)) return { value: DECLINE, final: true };
      // The portal's race list uses the EEO-1 categories: every race other than "Hispanic or Latino"
      // means not Hispanic or Latino
      const hispanic = !/\b(not|non) hispanic\b/.test(n) && /\b(hispanic|latino|latina|latinx|latine)\b/.test(n);
      if (q.options.some((o) => /\b(not|non) hispanic\b/.test(o))) {
        return { value: hispanic ? 'Hispanic or Latino' : 'Not Hispanic or Latino', final: true };
      }
      return { value: hispanic ? 'Yes' : 'No', final: true };
    },
  },
  {
    name: 'eeo_race',
    kinds: EEO_KINDS,
    sensitive: true,
    test: (q) => /\b(race|racial|ethnicity|ethnic|hispanic|latino|latinx)\b/.test(q.norm),
    answer: (p) => ({ value: present(p.equalOpportunity?.eeoRace) || present(p.personal?.raceEthnicity) || DECLINE, final: true }),
  },
  {
    name: 'eeo_veteran',
    kinds: EEO_KINDS,
    sensitive: true,
    test: (q) => /\b(veteran|veterans|military service|armed forces)\b/.test(q.norm),
    answer: (p) => ({ value: present(p.equalOpportunity?.eeoVeteran) || present(p.personal?.veteranStatus) || DECLINE, final: true }),
  },
  {
    name: 'eeo_disability',
    kinds: EEO_KINDS,
    sensitive: true,
    test: (q) => /\b(disability|disabilities|disabled|handicap)\b/.test(q.norm),
    answer: (p) => ({ value: present(p.equalOpportunity?.eeoDisability) || present(p.personal?.disabilityStatus) || DECLINE, final: true }),
  },
];

const TEXTISH: AutoFillFieldType[] = ['text', 'textarea', 'combobox'];
const LOCATION_KINDS: AutoFillFieldType[] = ['text', 'select', 'dropdown_button', 'combobox'];

const FIELD_RULES: Rule[] = [
  { name: 'middle_name', test: (q) => /\bmiddle (name|initial)\b/.test(q.norm), answer: () => ({ value: '', skip: true }) },
  { name: 'name_suffix_prefix', test: (q) => /^(name )?(suffix|prefix|salutation|title prefix)$/.test(q.norm), answer: () => ({ value: '', skip: true }) },
  { name: 'someone_else', test: (q) => SOMEONE_ELSE_RE.test(q.norm), answer: () => null },
  {
    name: 'preferred_name',
    kinds: TEXTISH,
    test: (q) => /\b(preferred|nick) ?name\b/.test(q.norm),
    answer: (p) => (present(p.personal?.firstName) ? { value: p.personal.firstName } : null),
  },
  {
    name: 'first_name',
    kinds: TEXTISH,
    test: (q) => /\b(first|given|fore) ?name\b|^first$/.test(q.norm),
    answer: (p) => {
      const v = present(p.personal?.firstName) || present(p.personal?.fullName?.split(' ')[0]);
      return v ? { value: v } : null;
    },
  },
  {
    name: 'last_name',
    kinds: TEXTISH,
    test: (q) => /\b(last|family|sur) ?name\b|^surname$|^last$/.test(q.norm),
    answer: (p) => {
      const v = present(p.personal?.lastName) || present(p.personal?.fullName?.split(' ').slice(1).join(' '));
      return v ? { value: v } : null;
    },
  },
  {
    name: 'full_name',
    kinds: TEXTISH,
    test: (q) => /^(your |full |legal |applicant |candidate )?(full )?name$|\bfull name\b|\blegal name\b/.test(q.norm),
    answer: (p) => {
      const v = present(p.personal?.fullName) || present(`${p.personal?.firstName || ''} ${p.personal?.lastName || ''}`);
      return v ? { value: v } : null;
    },
  },
  {
    name: 'email',
    kinds: TEXTISH,
    test: (q) => /\be ?mail\b/.test(q.norm),
    answer: (p) => (present(p.personal?.email) ? { value: p.personal.email } : null),
  },
  {
    name: 'phone_device_type',
    kinds: ['select', 'dropdown_button', 'radio_group', 'combobox'],
    test: (q) => /\b(phone (device )?type|type of phone|phone category)\b/.test(q.norm),
    answer: () => ({ value: 'Mobile' }),
  },
  { name: 'phone_extension', test: (q) => /\b(phone )?extension\b|^ext$/.test(q.norm), answer: () => ({ value: '', skip: true }) },
  {
    name: 'phone_country_code',
    test: (q) => /\b(country|phone|calling|dial|dialing) code\b|\bcountry phone code\b/.test(q.norm),
    answer: (p) => {
      const code = (present(p.personal?.phoneCountryCode) || '+1').replace(/[^\d+]/g, '');
      const country = present(p.personal?.country) || 'United States';
      return { value: `${country} (${code.startsWith('+') ? code : '+' + code})` };
    },
  },
  {
    name: 'phone',
    kinds: TEXTISH,
    test: (q) =>
      /\b(phone|telephone|contact number|cell phone|mobile (phone|number|no)|cell (number|no)|phone number)\b|^(mobile|cell)$/.test(q.norm),
    answer: (p, _q, f, ctx) => {
      const phone = present(p.personal?.phone);
      if (!phone) return null;
      const digits = phone.replace(/\D/g, '');
      if ((ctx.hasSeparateCountryCode || f.maxLength === 10) && digits.length === 11 && digits.startsWith('1')) {
        return { value: digits.slice(1) };
      }
      if (f.maxLength && phone.length > f.maxLength) return { value: digits.slice(-f.maxLength) };
      return { value: phone };
    },
  },
  {
    name: 'address_line_2',
    test: (q) => /\baddress (line )?2\b|\b(apt|apartment|suite|unit)\b/.test(q.norm),
    answer: () => ({ value: '', skip: true }),
  },
  {
    name: 'address_line_1',
    kinds: TEXTISH,
    test: (q) =>
      (/^(street |mailing |home |residential )?address( line)?( 1| one)?$|\bstreet\b|\baddress line 1\b/.test(q.norm)) &&
      !/\b(email|e mail|ip|web)\b/.test(q.norm),
    answer: (p) => (present(p.personal?.address) ? { value: p.personal.address! } : null),
  },
  {
    name: 'location',
    kinds: LOCATION_KINDS,
    test: (q) => /^(current )?location$|\bcity.{0,3}state\b|\bwhere are you (currently )?(located|based)\b|^location city$/.test(q.norm),
    answer: (p) => {
      const city = present(p.personal?.city);
      if (!city) return null;
      const state = expandUsState(p.personal?.state);
      return { value: state ? `${city}, ${state}` : city };
    },
  },
  {
    name: 'city',
    kinds: LOCATION_KINDS,
    test: (q) => /^(current )?(city|town)( of residence)?$|^city name$/.test(q.norm),
    answer: (p, _q, f) => {
      const city = present(p.personal?.city);
      if (!city) return null;
      // A type-ahead suggests "Austin, TX, USA" and "Austin, MN, USA": give it the state to pick the right one
      const state = f.type === 'combobox' ? expandUsState(p.personal?.state) : '';
      return { value: state ? `${city}, ${state}` : city };
    },
  },
  {
    name: 'state',
    kinds: LOCATION_KINDS,
    test: (q) => /^(current )?(state|province|region|state province|state or province|state region)( of residence)?$/.test(q.norm),
    answer: (p, _q, f) => {
      const s = present(p.personal?.state);
      if (!s) return null;
      return { value: f.type === 'text' ? s : expandUsState(s) };
    },
  },
  {
    name: 'zip',
    kinds: TEXTISH,
    test: (q) => /\b(zip|postal|postcode|pin code)\b/.test(q.norm),
    answer: (p) => (present(p.personal?.zipCode) ? { value: p.personal.zipCode! } : null),
  },
  {
    name: 'country',
    kinds: LOCATION_KINDS,
    test: (q) => /^(current )?(country|nation)( of residence)?$|\bcountry of residence\b/.test(q.norm),
    answer: (p) => (present(p.personal?.country) ? { value: p.personal.country! } : null),
  },
  {
    name: 'linkedin',
    kinds: TEXTISH,
    test: (q) => /\blinked ?in\b/.test(q.norm),
    answer: (p) => (present(p.social?.linkedinUrl) ? { value: p.social!.linkedinUrl! } : null),
  },
  {
    name: 'github',
    kinds: TEXTISH,
    test: (q) => /\bgit ?hub\b/.test(q.norm),
    answer: (p) => (present(p.social?.githubUrl) ? { value: p.social!.githubUrl! } : null),
  },
  {
    name: 'twitter',
    kinds: TEXTISH,
    test: (q) => /\b(twitter|x com)\b/.test(q.norm),
    answer: (p) => (present(p.social?.twitterUrl) ? { value: p.social!.twitterUrl! } : null),
  },
  {
    name: 'website',
    kinds: TEXTISH,
    test: (q) => /\b(portfolio|personal website|website|personal url|web site|blog)\b/.test(q.norm),
    answer: (p) => {
      const v = present(p.social?.portfolioUrl) || present(p.social?.otherWebsiteUrl) || present(p.social?.otherUrl);
      return v ? { value: v } : null;
    },
  },
  {
    name: 'current_company',
    kinds: TEXTISH,
    test: (q) => /\b(current|present|most recent|latest) (company|employer|organization)\b|^(company|employer)( name)?$/.test(q.norm),
    answer: (p) => (present(p.workHistory?.[0]?.companyName) ? { value: p.workHistory![0].companyName } : null),
  },
  {
    name: 'current_title',
    kinds: TEXTISH,
    test: (q) => /\b(current|present|most recent|latest) (job )?(title|position|role|designation)\b|^(job )?title$/.test(q.norm),
    answer: (p) => {
      const v = present(p.workHistory?.[0]?.jobTitle) || present(p.primaryTitle);
      return v ? { value: v } : null;
    },
  },
  {
    name: 'school',
    test: (q) => /^(school|university|college|institution)( name)?$|\b(school|university|college|institution) name\b|\bname of (school|university|college|institution)\b/.test(q.norm),
    answer: (p) => (present(p.education?.[0]?.schoolName) ? { value: p.education![0].schoolName } : null),
  },
  {
    name: 'degree',
    test: (q) => /^degree( level| type| obtained)?$|\bhighest (level of )?(education|degree)\b|\beducation level\b|\blevel of education\b/.test(q.norm),
    answer: (p) => (present(p.education?.[0]?.degreeLevel) ? { value: p.education![0].degreeLevel } : null),
  },
  {
    name: 'major',
    test: (q) => /^(major|field of study|discipline|area of study|specialization|concentration)$/.test(q.norm),
    answer: (p) => (present(p.education?.[0]?.major) ? { value: p.education![0].major } : null),
  },
  {
    name: 'graduation_year',
    test: (q) => /\bgraduation (year|date)\b|\byear of graduation\b|\bgrad year\b/.test(q.norm),
    answer: (p) => (present(p.education?.[0]?.graduationYear) ? { value: String(p.education![0].graduationYear) } : null),
  },
  {
    name: 'gpa',
    test: (q) => /\bgpa\b|\bgrade point\b/.test(q.norm),
    answer: (p) => (present(p.education?.[0]?.gpa) ? { value: String(p.education![0].gpa) } : null),
  },
];

/** autocomplete="..." is the most reliable signal a site can give. */
const AUTOCOMPLETE_MAP: Record<string, (p: Profile, f: AutoFillExtractedField, ctx: Tier1Context) => Answer | null> = {
  'given-name': (p) => (present(p.personal?.firstName) ? { value: p.personal.firstName } : null),
  'family-name': (p) => (present(p.personal?.lastName) ? { value: p.personal.lastName } : null),
  'additional-name': () => ({ value: '', skip: true }),
  name: (p) => (present(p.personal?.fullName) ? { value: p.personal.fullName } : null),
  email: (p) => (present(p.personal?.email) ? { value: p.personal.email } : null),
  tel: (p) => (present(p.personal?.phone) ? { value: p.personal.phone } : null),
  'tel-national': (p) => (present(p.personal?.phone) ? { value: p.personal.phone.replace(/^\+?1[\s-]?/, '') } : null),
  'address-line1': (p) => (present(p.personal?.address) ? { value: p.personal.address! } : null),
  'street-address': (p) => (present(p.personal?.address) ? { value: p.personal.address! } : null),
  'address-line2': () => ({ value: '', skip: true }),
  'address-level2': (p) => (present(p.personal?.city) ? { value: p.personal.city! } : null),
  'address-level1': (p, f) => (present(p.personal?.state) ? { value: f.type === 'text' ? p.personal.state! : expandUsState(p.personal.state) } : null),
  'postal-code': (p) => (present(p.personal?.zipCode) ? { value: p.personal.zipCode! } : null),
  country: (p) => (present(p.personal?.country) ? { value: p.personal.country! } : null),
  'country-name': (p) => (present(p.personal?.country) ? { value: p.personal.country! } : null),
  organization: (p) => (present(p.workHistory?.[0]?.companyName) ? { value: p.workHistory![0].companyName } : null),
  'organization-title': (p) => (present(p.workHistory?.[0]?.jobTitle) ? { value: p.workHistory![0].jobTitle } : null),
};

function buildQuestion(field: AutoFillExtractedField): Q {
  const raw = field.question || field.label || '';
  let norm = normalizeText(raw);
  // No label: fall back to the name/id attribute ("first_name" -> "first name"). Never for groups.
  if (!norm && field.type !== 'radio_group' && field.type !== 'checkbox_group') {
    norm = normalizeText(
      (field.name || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\[\d+\]/g, ' ')
    );
  }
  const words = wordCount(norm);
  return {
    raw: raw || norm,
    norm,
    words,
    isShort: words > 0 && words <= 6 && !raw.includes('?'),
    autocomplete: (field.autocomplete || '').toLowerCase().trim(),
    options: (field.options || []).map((o) => normalizeText(o)),
  };
}

function base(field: AutoFillExtractedField, strategy: string): AutoFillFieldResult {
  return { fieldId: field.id, elementIndex: field.elementIndex, value: '', confidence: 0.95, tier: 'tier1', strategy };
}

/**
 * Turns a rule's answer into a result for this field type: maps it onto one of the field's
 * options, or returns null so the next tier can try.
 */
function finalize(field: AutoFillExtractedField, ans: Answer, rule: Pick<Rule, 'name' | 'sensitive'>): AutoFillFieldResult | null {
  const result: AutoFillFieldResult = {
    ...base(field, `tier1:${rule.name}`),
    value: ans.value,
    values: ans.values,
    needsReview: ans.needsReview,
    reason: ans.reason,
    skip: ans.skip,
    final: ans.final || rule.sensitive,
    pick: ans.pick,
    alternatives: ans.alternatives,
  };
  if (ans.skip) return result;
  if (!ans.value && !(ans.values && ans.values.length)) {
    return ans.needsReview || ans.final ? { ...result, final: true } : null;
  }

  const knownOptions = field.options && field.options.length > 0;
  // A checkbox group asked for one answer (Ashby's EEO questions are checkboxes) is handled like a radio group
  const singleChoiceBoxes = field.type === 'checkbox_group' && !(ans.values && ans.values.length);
  if (knownOptions && (field.type === 'select' || field.type === 'radio_group' || singleChoiceBoxes)) {
    const highest = ans.pick === 'highest' ? highestOptionIndex(field.options!) : null;
    let m = highest !== null ? { option: field.options![highest], index: highest, score: 100, ambiguous: false } : matchOption(field.options, ans.value);
    for (const alt of ans.alternatives || []) {
      if (m && !m.ambiguous) break;
      m = matchOption(field.options, alt);
    }
    // A lone box from a group the page didn't tie together ("Female" on its own): not this one, nothing to flag
    if ((!m || m.ambiguous) && singleChoiceBoxes && field.options!.length === 1 && rule.sensitive) {
      return { ...result, value: '', skip: true };
    }
    if (!m || m.ambiguous) {
      if (result.final) {
        const decline = isDeclineText(normalizeText(ans.value));
        return {
          ...result,
          value: '',
          declined: decline || undefined,
          needsReview: true,
          reason: decline
            ? 'There is no "decline to answer" option here. The candidate has to choose.'
            : `None of the options clearly matches "${ans.value}".`,
        };
      }
      return null;
    }
    result.value = m.option;
    if (singleChoiceBoxes) result.values = [m.option];
  } else if (field.type === 'checkbox') {
    // A single box labelled "Yes"/"No" is ticked when the answer has the same meaning.
    const boxLabel = normalizeText(field.options?.[0]);
    const checked = answerToChecked(ans.value);
    if (checked === null) return null;
    if (boxLabel === 'no') result.value = checked ? 'No' : 'Yes';
    else result.value = checked ? 'Yes' : 'No';
  } else if (field.type === 'checkbox_group' && !ans.values) {
    return null;
  }
  return result;
}

/** Resolves a field from the candidate profile, or returns null to let the next tier try. */
export function resolveTier1Field(
  field: AutoFillExtractedField,
  profile: CandidateAutoFillProfile,
  ctx: Tier1Context = { fileFieldCount: 1 }
): AutoFillFieldResult | null {
  const q = buildQuestion(field);

  if (q.autocomplete && AUTOCOMPLETE_MAP[q.autocomplete] && field.type !== 'radio_group' && field.type !== 'checkbox_group') {
    const ans = AUTOCOMPLETE_MAP[q.autocomplete](profile, field, ctx);
    if (ans) {
      const r = finalize(field, ans, { name: `autocomplete:${q.autocomplete}` });
      if (r) return r;
    }
  }

  if (!q.norm && field.type !== 'file') return null;

  for (const rule of QUESTION_RULES) {
    if (rule.kinds && !rule.kinds.includes(field.type)) continue;
    if (!rule.test(q, field)) continue;
    const ans = rule.answer(profile, q, field, ctx);
    if (!ans) {
      if (rule.sensitive) {
        const r = finalize(field, { value: '', needsReview: true, reason: 'Not enough profile data to answer this safely.', final: true }, rule);
        return r && /^eeo_/.test(rule.name) ? { ...r, declined: true } : r;
      }
      // A matched rule with no data still blocks weaker field-name rules from guessing.
      return null;
    }
    return finalize(field, ans, rule);
  }

  if (!q.isShort && !(q.words <= 8 && field.type !== 'textarea')) return null;
  for (const rule of FIELD_RULES) {
    if (rule.kinds && !rule.kinds.includes(field.type)) continue;
    if (!rule.test(q, field)) continue;
    const ans = rule.answer(profile, q, field, ctx);
    if (!ans) return null;
    return finalize(field, ans, rule);
  }
  return null;
}
