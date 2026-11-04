/**
 * Decides whether a posting is the candidate's kind of job, whether they can be submitted, and how good a fit it is.
 *  - titleFit():        how close a job title is to one candidate title, or why it's the wrong kind of job
 *  - assessRelevance(): keep or drop a posting (title first, then the skills the posting actually asks for)
 *  - matchJob():        blockers, things to check, score, status and a one-line summary for the results list
 */
import { CandidateForSearch, Employment, JobSignals, MatchResult, NormalizedJob } from './types.js';
import { normalize, daysAgo, stateOf, isNonUs } from './text.js';
import { detectSignals } from './signals.js';
import { mentions } from './skills.js';
import { buildProfile, companyKey, SearchProfile } from './profile.js';
import { detectIndustry } from './industry.js';

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

/** Words that don't help compare job titles. */
const TITLE_NOISE = new Set([
  'sr', 'senior', 'jr', 'junior', 'lead', 'principal', 'staff', 'i', 'ii', 'iii', 'iv', '1', '2', '3', 'level',
  'the', 'a', 'an', 'and', 'of', 'for', 'with', 'in', 'to', 'remote', 'hybrid', 'onsite', 'contract', 'w2', 'c2c',
  'fulltime', 'full', 'time', 'job', 'role', 'position', 'opening', 'hiring', 'urgent', 'immediate', 'needed', 'us', 'usa',
]);

/** Title words that mean the same thing for matching. */
const TITLE_SYNONYMS: Record<string, string> = {
  developer: 'engineer', dev: 'engineer', programmer: 'engineer', swe: 'engineer', sde: 'engineer',
  frontend: 'front', 'ui': 'front', backend: 'back', fullstack: 'full', 'full-stack': 'full',
  dotnet: '.net', 'net': '.net', 'c#.net': '.net', js: 'javascript', reactjs: 'react', 'react.js': 'react',
  k8s: 'kubernetes', sfdc: 'salesforce', 'ml': 'machine', 'ai': 'machine', dba: 'database', qa: 'quality', sdet: 'quality', tester: 'quality', test: 'quality',
  architect: 'architect', administrator: 'admin', analyst: 'analyst', bi: 'intelligence',
};

function titleTokens(title: string): Set<string> {
  // "Site Reliability Engineer" is SRE; a plain "Reliability Engineer" is usually plant/equipment work
  const toks = normalize(title)
    .replace(/\bsite reliability\b/g, 'sre')
    .split(' ')
    .map((t) => TITLE_SYNONYMS[t] || t)
    .filter((t) => t && !TITLE_NOISE.has(t));
  return new Set(toks);
}

/** 0..1: how close two job titles are (weighted to the candidate's title words). */
export function titleSimilarity(candidateTitle: string, jobTitle: string): number {
  const a = titleTokens(candidateTitle);
  const b = titleTokens(jobTitle);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((t) => {
    if (b.has(t)) inter++;
  });
  return 0.7 * (inter / a.size) + 0.3 * (inter / b.size);
}

/**
 * Role families: titles a bench recruiter would submit the same candidate to
 * (a DevOps engineer also fits "Cloud Infrastructure Engineer", "SRE", "Platform Engineer").
 * Platform-specific families (Salesforce, SAP...) only match the same platform.
 */
const SPECIFIC_FAMILIES: Array<[string, RegExp]> = [
  ['Salesforce', /\b(salesforce|sfdc|apex|vlocity)\b/],
  ['ServiceNow', /\bservicenow\b/],
  ['SAP', /\b(sap|abap|s ?4 ?hana)\b/],
  ['Workday HCM', /\bworkday\b/],
  ['Oracle apps', /\b(oracle (ebs|fusion|apps|hcm|erp)|peoplesoft)\b/],
  ['Dynamics', /\b(dynamics 365|d365|dynamics crm)\b/],
  ['Mainframe', /\b(mainframe|cobol)\b/],
];
const GENERIC_FAMILIES: Array<[string, RegExp]> = [
  ['DevOps / Cloud', /\b(devops|devsecops|sre|site reliability|platform engineer(?:ing)?|production engineer(?:ing)?|cloud|infrastructure|infra|kubernetes|build (?:and )?release|release engineer(?:ing)?|build engineer)\b/],
  ['Back end', /\b(back ?end|backend|server side|api (?:developer|engineer))\b/],
  ['Data engineering', /\b(data engineer|etl|big data|bigdata|spark|hadoop|snowflake|databricks|data warehouse|informatica|data platform)\b/],
  ['Data science / ML', /\b(data scientist|machine learning|ml|ai|deep learning|nlp|computer vision|mlops|genai|llm)\b/],
  ['Java', /\b(java|j2ee|spring)\b/],
  ['.NET', /(\.net\b|\bdotnet\b|\bc#)/],
  ['Python', /\b(python|django|flask|fastapi)\b/],
  ['Front end', /\b(front ?end|frontend|ui|react|angular|vue)\b/],
  ['Full stack', /\b(full ?stack|fullstack|mern|mean stack)\b/],
  ['QA / Test', /\b(qa|quality|test|tester|testing|sdet|selenium)\b/],
  ['Security', /\b(security|cyber|cybersecurity|soc|iam|siem|appsec)\b/],
  ['Network', /\b(network|cisco|wireless|firewall)\b/],
  ['Database', /\b(dba|database|sql server)\b/],
  ['Mobile', /\b(ios|android|mobile|flutter|react native)\b/],
  ['Business analysis', /\b(business analyst|business systems analyst|product owner|scrum master)\b/],
  ['Project management', /\b(project manager|program manager|pmo|delivery manager)\b/],
];
const NOT_TECH_TITLE = /\b(sales|account executive|account manager|marketing|recruiter|recruiting|talent|payroll|accountant|accounting|attorney|counsel|paralegal|intern|internship|nurse|driver|cashier)\b/;
/** People-manager and executive titles: not consultant roles unless the candidate's own title is one. */
const LEADERSHIP_TITLE = /\b(manager|director|vice president|vp|svp|evp|head of|chief|cto|cio|ciso|president|distinguished|fellow)\b/;
/** Specialist work a software/DevOps consultant isn't submitted to (unless their own title says so). */
const SPECIALTY_TITLE = /\b(customer success|solutions? (?:architect|consultant|engineer)|sales engineer|pre[\s-]?sales|support engineer|technical account|field (?:application|engineer)|developer (?:advocate|relations)|evangelist|compiler|firmware|hardware|asic|vlsi|fpga|silicon|embedded|mechanical|electrical|manufacturing|analog|rf engineer|kernel|physical design|verification engineer|research scientist|applied scientist|robotics|optical|photonics)\b/;
/** Title words that say nothing about the kind of software work ("Software Engineer", "Member of Technical Staff"). */
const GENERIC_ROLE_WORDS = new Set(['software', 'engineer', 'application', 'applications', 'consultant', 'member', 'technical', 'mts', 'it', 'specialist', 'professional', 'associate', 'engineering']);
const ENGINEERING_ANCHOR = new Set(['software', 'engineer', 'mts', 'consultant']);

function families(title: string): { specific: Set<string>; generic: Set<string> } {
  const t = ` ${normalize(title)} `;
  return {
    specific: new Set(SPECIFIC_FAMILIES.filter(([, re]) => re.test(t)).map(([n]) => n)),
    generic: new Set(GENERIC_FAMILIES.filter(([, re]) => re.test(t)).map(([n]) => n)),
  };
}

/** "Senior Engineer, Platform - DGX Cloud" -> core "Senior Engineer", qualifier "Platform DGX Cloud" (team or product). */
function splitTitle(title: string): { core: string; qualifier: string } {
  const parts = title.split(/\s+[-–—|:]\s+|\s*,\s*|\s*\(\s*|\s*\)\s*|\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
  return { core: parts[0] || title, qualifier: parts.slice(1).join(' ') };
}

export interface TitleFit {
  /** 0..1 */
  score: number;
  /** Shared role family, e.g. "DevOps / Cloud". */
  family: string | null;
  /** A plain "Software Engineer"-type title: only the posting's skills can tell if it fits. */
  generic: boolean;
  /** Why the title is the wrong kind of job, or null. */
  excluded: string | null;
}

const OFF = (excluded: string): TitleFit => ({ score: 0, family: null, generic: false, excluded });

export function titleFit(candidateTitle: string, jobTitle: string): TitleFit {
  const nj = normalize(jobTitle);
  const nc = normalize(candidateTitle);
  if (!nj) return OFF('no title');
  if (NOT_TECH_TITLE.test(nj)) return OFF('not a tech role');
  if (LEADERSHIP_TITLE.test(nj) && !LEADERSHIP_TITLE.test(nc)) return OFF('manager / executive role');
  const spec = nj.match(SPECIALTY_TITLE);
  if (spec && !nc.includes(spec[1])) return OFF(`specialist role (${spec[1]})`);
  const cand = families(candidateTitle);
  const job = families(jobTitle);
  for (const s of job.specific) if (!cand.specific.has(s)) return OFF(`different platform (${s})`);

  const { core, qualifier } = splitTitle(jobTitle);
  const coreTokens = titleTokens(core);
  // "Software Engineer", "Engineer II", "Consultant"; but a bare "Associate" or "IT Specialist" isn't an engineering role
  const genericCore =
    coreTokens.size > 0 &&
    Array.from(coreTokens).every((t) => GENERIC_ROLE_WORDS.has(t)) &&
    Array.from(coreTokens).some((t) => ENGINEERING_ANCHOR.has(t));
  // Product and team names after a dash or comma ("- DGX Cloud") shouldn't make a title look like a match
  const sim = titleSimilarity(candidateTitle, genericCore ? jobTitle : core);
  let family: string | null = null;
  for (const s of job.specific) if (cand.specific.has(s)) family = s;
  if (!family) {
    const coreFam = families(core).generic;
    for (const g of coreFam) {
      if (cand.generic.has(g)) {
        family = g;
        break;
      }
    }
    const candHasFamily = cand.generic.size + cand.specific.size > 0;
    if (!family && coreFam.size > 0 && sim < 0.6 && candHasFamily) return OFF('different kind of role');
    if (!family && genericCore && qualifier) {
      // "Software Engineer, Infrastructure" is DevOps work; "Software Engineer, ML & Infra" is mixed, so no credit;
      // "Software Engineer, Identity Security" is a different specialty altogether
      const q = Array.from(families(qualifier).generic);
      if (q.length && q.every((g) => cand.generic.has(g))) family = q[0];
      else if (q.length && !q.some((g) => cand.generic.has(g)) && candHasFamily) return OFF('different kind of role');
    }
  }
  const score = Math.max(sim, family ? 0.6 : 0);
  return { score, family, generic: genericCore && score < 0.6, excluded: null };
}

/** The shared role family of two titles, or null when they are different kinds of work. */
export function roleFamilyMatch(candidateTitle: string, jobTitle: string): string | null {
  const f = titleFit(candidateTitle, jobTitle);
  return f.excluded ? null : f.family;
}

/** Best fit over all of the candidate's titles. */
export function bestTitleFit(titles: string[], jobTitle: string): TitleFit & { title: string } {
  let best: (TitleFit & { title: string }) | null = null;
  let firstOff: (TitleFit & { title: string }) | null = null;
  for (const t of titles) {
    const f = { ...titleFit(t, jobTitle), title: t };
    if (f.excluded) {
      firstOff = firstOff || f;
      continue;
    }
    if (!best || f.score > best.score) best = f;
  }
  return best || firstOff || { ...OFF('no titles'), title: '' };
}

// ---------------------------------------------------------------------------
// Relevance: is this posting the candidate's kind of job?
// ---------------------------------------------------------------------------

export type DropReason = 'off_target' | 'missing_skills' | 'not_verified';

export interface Relevance {
  keep: boolean;
  dropReason: DropReason | null;
  /** Plain-English reason, shown in "hidden results". */
  detail: string | null;
  fit: TitleFit & { title: string };
  read: boolean;
  coreOk: boolean;
  mustFound: string[];
}

/** True when the full posting is available (not just a title from a search list). */
export function isRead(job: Pick<NormalizedJob, 'description'>): boolean {
  return (job.description || '').trim().length >= 60;
}

/** Can a career-site listing be worth reading in full? (title only; cheap pre-check) */
export function worthReading(jobTitle: string, p: SearchProfile): { ok: boolean; strong: boolean } {
  const fit = bestTitleFit(p.titles, jobTitle);
  if (fit.excluded) return { ok: false, strong: false };
  return { ok: fit.score >= 0.6 || fit.generic, strong: fit.score >= 0.6 };
}

export function assessRelevance(job: Pick<NormalizedJob, 'title' | 'description'>, p: SearchProfile): Relevance {
  const fit = bestTitleFit(p.titles, job.title);
  const read = isRead(job);
  const text = read ? `${job.title}\n${job.description}` : job.title;
  const coreOk = p.coreTech.length === 0 || p.coreTech.some((s) => mentions(text, s));
  const mustFound = p.mustHave.filter((s) => mentions(text, s));
  const base = { fit, read, coreOk, mustFound };
  if (fit.excluded) return { ...base, keep: false, dropReason: 'off_target', detail: fit.excluded };
  const strong = fit.score >= 0.6;
  if (!strong && !fit.generic) return { ...base, keep: false, dropReason: 'off_target', detail: 'different kind of role' };
  if (!read) {
    // Only the listing: keep clear title matches (to check by hand); a plain "Software Engineer" can't be judged
    if (strong && coreOk) return { ...base, keep: true, dropReason: null, detail: null };
    return {
      ...base,
      keep: false,
      dropReason: 'not_verified',
      detail: strong ? `couldn't confirm ${p.coreTech.join(' / ')} without the full posting` : 'general title, full posting not available',
    };
  }
  if (!coreOk) return { ...base, keep: false, dropReason: 'missing_skills', detail: `doesn't ask for ${p.coreTech.join(' / ')}` };
  const need = strong ? (p.mustHave.length ? 1 : 0) : Math.min(2, p.mustHave.length);
  if (mustFound.length < need) {
    return {
      ...base,
      keep: false,
      dropReason: 'missing_skills',
      detail: mustFound.length ? `only asks for ${mustFound.join(', ')} of ${p.mustHave.join(', ')}` : `asks for none of ${p.mustHave.join(', ')}`,
    };
  }
  return { ...base, keep: true, dropReason: null, detail: null };
}

// ---------------------------------------------------------------------------
// Submission rules, score and the result line
// ---------------------------------------------------------------------------

/** true = needs employer sponsorship now or later, false = no, null = unknown. EAD holders (H4, L2, GC) don't. */
export function needsSponsorship(visa: string): boolean | null {
  const v = normalize(visa).replace(/\s+/g, '');
  if (!v || v === 'other') return null;
  if (/^(uscitizen|citizen|usc|greencard|gc|gcead|permanentresident|h4ead|l2ead)/.test(v)) return false;
  return true;
}

/** "H-1B", "h1b", "H1" -> "h1b"; "Green Card", "GC" -> "gc"; unknown -> null. */
function visaKey(visa: string): string | null {
  const t = normalize(visa).replace(/[\s-]+/g, '');
  if (/^(uscitizens?|citizens?|usc)$/.test(t)) return 'usc';
  if (/^(greencard(holders?)?|gc|permanentresidents?|lpr)$/.test(t)) return 'gc';
  if (t === 'gcead') return 'gcead';
  if (/^h1b?$/.test(t)) return 'h1b';
  if (/^h4(ead)?$/.test(t)) return 'h4ead';
  if (/^l2(ead)?$/.test(t)) return 'l2ead';
  if (/^(opt|optead|stemopt)$/.test(t)) return 'opt';
  if (/^(cpt|tn|e3|ead)$/.test(t)) return t;
  return null;
}

const VISA_LABEL: Record<string, string> = { usc: 'USC', gc: 'GC', gcead: 'GC-EAD', h1b: 'H-1B', h4ead: 'H4-EAD', l2ead: 'L2-EAD', opt: 'OPT', cpt: 'CPT', tn: 'TN', e3: 'E-3', ead: 'EAD' };
const EAD_VISAS = new Set(['gcead', 'h4ead', 'l2ead', 'opt']);

/** Visa list in the posting ("Visa: USC/GC/H4EAD", "No H1B, OPT"): true = candidate's visa taken, false = not, null = no list / unknown visa. */
export function visaAllowed(visa: string, accepted: string[], excluded: string[]): boolean | null {
  const c = visaKey(visa);
  if (!c) return null;
  const ex = new Set(excluded.map(visaKey).filter(Boolean));
  if (ex.has(c) || (ex.has('ead') && EAD_VISAS.has(c))) return false;
  const ok = new Set(accepted.map(visaKey).filter(Boolean));
  if (!ok.size) return null;
  if (c === 'usc' || ok.has(c)) return true; // a visa list never excludes US citizens
  if (c === 'gc' && ok.has('gcead')) return true;
  if (EAD_VISAS.has(c) && ok.has('ead')) return true;
  return false;
}

function visaListLabel(list: string[]): string {
  return Array.from(new Set(list.map((v) => VISA_LABEL[visaKey(v) || ''] || v.toUpperCase()))).join('/');
}

function isCitizen(visa: string): boolean {
  return /^(uscitizen|citizen|usc)/.test(normalize(visa).replace(/\s+/g, ''));
}

/** Does the candidate meet the posting's citizenship rule? (USC only, or USC / green card / U.S. person) */
export function meetsCitizenship(visa: string, rule: JobSignals['citizenship']): boolean {
  if (!rule) return true;
  const v = normalize(visa).replace(/\s+/g, '');
  const usc = /^(uscitizen|citizen|usc)/.test(v);
  const gc = /^(greencard|gc|gcead|permanentresident|lpr)/.test(v);
  return rule === 'usc' ? usc : usc || gc;
}

/** Does the candidate hold a clearance? */
export function holdsClearance(level: string | undefined): boolean {
  return hasClearance(level);
}

/** Clearance levels, lowest to highest. A candidate qualifies for a job that asks for their level or lower. */
function clearanceRank(level: string | null | undefined): number {
  const s = String(level || '').trim();
  if (!s || /^(none|no|n\/?a)$/i.test(s)) return 0;
  if (/poly/i.test(s)) return 5;
  if (/sci/i.test(s)) return 4;
  if (/top\s*secret|\bts\b/i.test(s)) return 3;
  if (/public\s*trust/i.test(s)) return 1;
  return 2; // Secret, DOE "Q"/"L", or a clearance with no level given
}

/**
 * Can this candidate take a job that asks for this clearance? "Able to obtain a clearance" is open to
 * US citizens without one; everything else needs the candidate's clearance to be at least that level.
 */
export function qualifiesForClearance(cand: Pick<CandidateForSearch, 'clearance' | 'visa'>, required: string | null): boolean {
  if (!required) return true;
  if (/able to get/i.test(required)) return hasClearance(cand.clearance) || isCitizen(cand.visa);
  return clearanceRank(cand.clearance) >= clearanceRank(required);
}

/** Is this job at one of the candidate's past clients / employers? */
function isPreviousClient(company: string, previous: string[]): boolean {
  const jc = companyKey(company);
  if (!jc) return false;
  return previous.some((pc) => pc.length >= 3 && (` ${jc} `.includes(` ${pc} `) || ` ${pc} `.includes(` ${jc} `)));
}

/** Titles that usually mean US citizens only even when the posting doesn't say so. */
const FEDERAL_TITLE = /\b(federal|fedramp|public sector|government|govcloud|dod|defense|defence)\b/i;

function hasClearance(level: string | undefined): boolean {
  return Boolean(level) && !/^(none|no|n\/?a)$/i.test(String(level).trim());
}

const CAREER_SITES = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday']);

/** Contract (C2C or not) vs full-time, as far as the posting and its source say. */
export function classifyEmployment(job: Pick<NormalizedJob, 'employmentType' | 'source'>, s: JobSignals): Employment {
  if (s.c2c === 'allowed') return 'c2c';
  const type = job.employmentType || '';
  if (s.contract || /contract|contractor|temp|1099|c2h|freelance/i.test(type)) return s.w2Only || s.c2c === 'not_allowed' ? 'w2_contract' : 'contract';
  if (/full[\s-]?time|fulltime|permanent|regular|employee|fte/i.test(type)) return 'fulltime';
  // A company's own careers site without contract wording is an employee job
  if (CAREER_SITES.has(job.source)) return 'fulltime';
  return 'unknown';
}

const EMPLOYMENT_LABEL: Record<Employment, string> = {
  c2c: 'Contract, C2C OK',
  contract: 'Contract',
  w2_contract: 'Contract, W2 only',
  fulltime: 'Full-time (direct hire)',
  unknown: 'Type not stated',
};

export function employmentLabel(e: Employment): string {
  return EMPLOYMENT_LABEL[e];
}

function ageLabel(age: number | null, precision: NormalizedJob['postedPrecision'] = 'exact'): string {
  if (age === null) return 'date unknown';
  // Only the date is known (Workday): say the day, not a made-up number of hours
  if (precision === 'day') return age < 0.75 ? 'posted today' : age < 1.75 ? 'posted yesterday' : `posted ${Math.round(age)} days ago`;
  const h = Math.round(age * 24);
  if (h < 1) return 'just posted';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(age);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

function locationFit(cand: CandidateForSearch, s: JobSignals, candState: string | null, jobState: string | null): number {
  if (s.workMode === 'remote') return 1;
  if (cand.workPreference === 'Remote') return s.workMode === 'hybrid' ? 0.4 : s.workMode === 'onsite' ? 0.2 : 0.6;
  if (!candState || !jobState) return 0.7;
  if (candState === jobState) return 1;
  return cand.willingToRelocate ? 0.8 : 0.5;
}

const profiles = new WeakMap<CandidateForSearch, SearchProfile>();
function profileOf(c: CandidateForSearch | SearchProfile): SearchProfile {
  if ('candidate' in c && 'mustHave' in c) return c;
  let p = profiles.get(c);
  if (!p) {
    p = buildProfile(c);
    profiles.set(c, p);
  }
  return p;
}

export function matchJob(job: NormalizedJob, candidate: CandidateForSearch | SearchProfile, now = new Date()): MatchResult {
  const p = profileOf(candidate);
  const cand = p.candidate;
  const s = job.signals || detectSignals(job);
  const rel = assessRelevance(job, p);
  const text = rel.read ? `${job.title}\n${job.description}` : job.title;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const reasons: string[] = [];

  // --- Can this candidate be submitted at all? ---
  const sponsor = needsSponsorship(cand.visa);
  const visaOk = visaAllowed(cand.visa, s.visasAccepted || [], s.visasExcluded || []);
  if (!meetsCitizenship(cand.visa, s.citizenship)) blockers.push(s.citizenship === 'usc' ? 'US citizens only' : 'USC/GC only');
  else if (visaOk === false) {
    const ex = s.visasExcluded || [];
    blockers.push(ex.length && visaAllowed(cand.visa, [], ex) === false ? `No ${visaListLabel(ex)}` : `Takes ${visaListLabel(s.visasAccepted)} only`);
  } else if (sponsor && s.noSponsorship && visaOk !== true) blockers.push('No visa sponsorship');
  if (cand.c2cOnly !== false && (s.c2c === 'not_allowed' || s.w2Only)) blockers.push(s.w2Only ? 'W2 only' : 'No C2C / third party');
  if (s.clearanceRequired && !qualifiesForClearance(cand, s.clearanceRequired)) blockers.push(`Needs ${s.clearanceRequired}`);
  if (isNonUs(job.location)) blockers.push('Outside the US');

  // --- Things to check before submitting ---
  const employment = classifyEmployment(job, s);
  if (!rel.read) warnings.push('Full posting not read: open it to check skills, visa and C2C terms');
  else if (job.source === 'adzuna') warnings.push('Only a snippet of the posting was available');
  if (employment === 'fulltime') warnings.push("Full-time direct hire: vendors usually can't submit unless the company works with agencies");
  if (FEDERAL_TITLE.test(job.title) && !isCitizen(cand.visa) && !s.citizenshipRequired && !s.clearanceRequired) {
    warnings.push('Federal / public-sector role: often US citizens only');
  }
  const candState = stateOf(cand.location);
  const jobState = stateOf(job.location);
  if (s.localOnly && candState && jobState && candState !== jobState) warnings.push(`Locals only (${job.location})`);
  if (cand.workPreference === 'Remote' && s.workMode === 'onsite') warnings.push('On-site role, candidate wants remote');
  if (cand.willingToRelocate === false && s.workMode !== 'remote' && candState && jobState && candState !== jobState) {
    warnings.push(`Needs relocation to ${jobState.toUpperCase()}`);
  }
  let expPenalty = 0;
  if (s.minYears && typeof cand.yearsExperience === 'number' && s.minYears > cand.yearsExperience) {
    const gap = s.minYears - cand.yearsExperience;
    expPenalty = Math.min(20, gap * 5);
    if (gap >= 2) warnings.push(`Asks for ${s.minYears}+ years, candidate has ${cand.yearsExperience}`);
  }
  const notes: string[] = [];
  if (!job.postedAt) notes.push('No posted date');

  // --- How good a fit ---
  const mustFound = p.mustHave.filter((sk) => mentions(text, sk));
  const niceFound = p.niceToHave.filter((sk) => mentions(text, sk));
  const titleScore = rel.fit.excluded ? 0 : rel.fit.score;
  const must = p.mustHave.length ? mustFound.length / p.mustHave.length : 1;
  const nice = p.niceToHave.length ? Math.min(1, niceFound.length / Math.min(5, p.niceToHave.length)) : 0.5;
  const age = daysAgo(job.postedAt, now);
  const fresh = age === null ? 0.3 : age <= 1 ? 1 : age <= 3 ? 0.8 : age <= 7 ? 0.5 : age <= 14 ? 0.25 : 0;
  // Bench sales places people corp-to-corp: contract work first, direct-hire full-time last
  const empFit: Record<Employment, number> =
    cand.c2cOnly !== false
      ? { c2c: 1, contract: 0.8, unknown: 0.5, fulltime: 0.2, w2_contract: 0.1 }
      : { c2c: 0.9, contract: 0.9, unknown: 0.6, fulltime: 0.6, w2_contract: 0.8 };
  const loc = locationFit(cand, s, candState, jobState);
  // Industry: same industry as the candidate's background counts; an unknown industry is neutral-ish
  const ind = detectIndustry(job);
  const industryMatch = Boolean(ind.name && p.industries.includes(ind.name));
  const industryFit = !p.industries.length ? 0.5 : industryMatch ? 1 : ind.name ? 0.2 : 0.4;
  const previousClient = p.previousCompanies.length > 0 && isPreviousClient(job.company, p.previousCompanies);
  const raw =
    100 * (0.2 * titleScore + 0.28 * must + 0.08 * nice + 0.12 * fresh + 0.14 * empFit[employment] + 0.08 * loc + 0.1 * industryFit) -
    expPenalty +
    (previousClient ? 5 : 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const level: MatchResult['level'] = score >= 75 ? 'strong' : score >= 55 ? 'good' : 'possible';
  const status: MatchResult['status'] = blockers.length ? 'blocked' : warnings.length ? 'check' : 'ready';

  // --- Why it fits ---
  if (!rel.fit.excluded && titleSimilarity(rel.fit.title, job.title) >= 0.6) reasons.push(`Title matches "${rel.fit.title}"`);
  else if (rel.fit.family) reasons.push(`Related role (${rel.fit.family})`);
  else if (rel.fit.generic) reasons.push("General software role that asks for the candidate's skills");
  if (p.mustHave.length) reasons.push(`Must-haves: ${p.mustHave.map((sk) => `${sk} ${mustFound.includes(sk) ? '✓' : '✗'}`).join(', ')}`);
  if (niceFound.length) reasons.push(`Also asks for: ${niceFound.slice(0, 5).join(', ')}`);
  if (industryMatch) reasons.push(`${ind.name} job, same industry as the candidate`);
  else if (ind.name) reasons.push(`Industry: ${ind.name}`);
  if (previousClient) reasons.push(`Candidate has worked at ${job.company} before`);
  if (s.c2c === 'allowed') reasons.push('C2C allowed');
  if (s.rate) reasons.push(`Rate ${s.rate}`);
  if (s.durationMonths) reasons.push(`${s.durationMonths}-month contract`);
  reasons.push(...notes);

  const summary = [
    { strong: 'Strong match', good: 'Good match', possible: 'Possible match' }[level],
    mustFound.length ? `has ${mustFound.join(', ')}` : p.mustHave.length ? 'must-haves not confirmed' : '',
    industryMatch ? `${ind.name} ✓` : '',
    previousClient ? 'past client' : '',
    EMPLOYMENT_LABEL[employment],
    s.workMode !== 'unknown' ? s.workMode.charAt(0).toUpperCase() + s.workMode.slice(1) : '',
    ageLabel(age, job.postedPrecision),
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    score,
    level,
    status,
    eligible: blockers.length === 0,
    blockers,
    warnings,
    reasons,
    summary,
    employment,
    industry: { name: ind.name, matchesCandidate: industryMatch, evidence: ind.evidence },
    previousClient,
    mustHave: p.mustHave.map((sk) => ({ skill: sk, found: mustFound.includes(sk) })),
    matchedSkills: [...mustFound, ...niceFound],
    missingSkills: [...p.mustHave.filter((sk) => !mustFound.includes(sk)), ...p.niceToHave.filter((sk) => !niceFound.includes(sk))].slice(0, 6),
    read: rel.read,
  };
}
