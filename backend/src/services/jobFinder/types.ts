/** Shared types for the JDMatcher job finder. */

export type SourceId = 'jsearch' | 'adzuna' | 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workday';

export interface JobQuery {
  /** Role or keywords, e.g. "DevOps Engineer". */
  keywords: string;
  /** "Austin, TX", "Texas" or "United States". */
  location?: string;
  remoteOnly?: boolean;
  employmentType?: 'any' | 'contract' | 'fulltime';
  /** 1 = last 24 hours, 3, 7, 30. */
  postedWithinDays?: number;
  /** Max jobs wanted from this source for this query. */
  limit?: number;
}

export interface ApplyOption {
  publisher: string;
  url: string;
}

export interface JobSignals {
  /** Corp-to-corp: allowed, explicitly not allowed, or not mentioned. */
  c2c: 'allowed' | 'not_allowed' | 'unknown';
  w2Only: boolean;
  /** Any citizenship rule below. */
  citizenshipRequired: boolean;
  /** usc = US citizens only; usc_gc = citizens or green card holders only (incl. ITAR "U.S. person"). */
  citizenship: 'usc' | 'usc_gc' | null;
  /** A "Visa: USC/GC/H4EAD" list in the posting (lower-case, no spaces), or [] if none. */
  visasAccepted: string[];
  /** A "No H1B, OPT, CPT" list in the posting, or [] if none. */
  visasExcluded: string[];
  /** "No sponsorship", "No H-1B", "must not require sponsorship". */
  noSponsorship: boolean;
  /** "Secret", "Top Secret", "TS/SCI", "Public Trust"... */
  clearanceRequired: string | null;
  localOnly: boolean;
  workMode: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  contract: boolean;
  durationMonths: number | null;
  rate: string | null;
  /** Experience the posting asks for ("8+ years of experience" -> 8). */
  minYears: number | null;
  /** Short quotes from the posting that explain each signal. */
  evidence: string[];
}

export interface NormalizedJob {
  id: string;
  source: SourceId;
  /** Where the posting lives: "LinkedIn", "Indeed", "Dice", "Stripe careers (Greenhouse)"... */
  publisher: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean | null;
  /** ISO timestamp, or null when the source gives no date. */
  postedAt: string | null;
  /** 'day' when the source only gives a date ("Posted Today", Workday's start date): postedAt is then an estimate. */
  postedPrecision?: 'exact' | 'day';
  employmentType: string | null;
  url: string;
  applyOptions: ApplyOption[];
  /** Plain-text description (may be a snippet for some sources). */
  description: string;
  salary?: { min?: number; max?: number; currency?: string; period?: string } | null;
  /** Industry the source states for the employer ("Health Care", "Finance"), when it gives one. */
  companyType?: string | null;
  signals?: JobSignals;
  match?: MatchResult;
}

export interface CandidateForSearch {
  name: string;
  /** Titles to search and match, best first: ["DevOps Engineer", "Site Reliability Engineer"]. */
  titles: string[];
  skills: string[];
  /** Visa / status as stored in JDMatcher: "H-1B", "OPT", "US Citizen", "Green Card"... */
  visa: string;
  workPreference?: 'Remote' | 'Hybrid' | 'On-Site';
  /** "Austin, TX" */
  location?: string;
  clearance?: string;
  /** Bench sales: the candidate is placed corp-to-corp, so "W2 only / No C2C" jobs are not workable. */
  c2cOnly?: boolean;
  /** Skills a job must ask for. Default: tech named in the titles + the top skills. */
  mustHaveSkills?: string[];
  /** Total years of experience, to catch "10+ years required" mismatches. */
  yearsExperience?: number;
  willingToRelocate?: boolean;
  /** Domains the candidate has worked in, best first: ["Healthcare", "Insurance"]. Same-industry jobs come first. */
  industries?: string[];
  /** Past clients / employers: a job at one of them is a strong selling point. */
  previousCompanies?: string[];
}

/** How the job is offered, as far as the posting says. */
export type Employment = 'c2c' | 'contract' | 'w2_contract' | 'fulltime' | 'unknown';

export interface MatchResult {
  /** 0-100. */
  score: number;
  level: 'strong' | 'good' | 'possible';
  /** ready = submit now; check = look at the warnings first; blocked = can't submit this candidate. */
  status: 'ready' | 'check' | 'blocked';
  eligible: boolean;
  /** Why it can't be submitted (e.g. "USC/GC only", "No C2C"). */
  blockers: string[];
  /** Things to check before submitting (e.g. "Locals only", "Needs 10+ years"). */
  warnings: string[];
  /** Why it fits. */
  reasons: string[];
  /** One line for the results list. */
  summary: string;
  employment: Employment;
  /** The job's industry (from the company and the posting) and whether it's one of the candidate's. */
  industry: { name: string | null; matchesCandidate: boolean; evidence: string[] };
  /** The job is at one of the candidate's past clients / employers. */
  previousClient: boolean;
  mustHave: Array<{ skill: string; found: boolean }>;
  matchedSkills: string[];
  missingSkills: string[];
  /** False when only the listing (title/location) was available, not the full posting. */
  read: boolean;
}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}>;

export interface SourceContext {
  fetch: FetchLike;
  /** API keys / settings from env. */
  config: Record<string, string | undefined>;
  now?: () => Date;
}

export interface SourceResult {
  source: SourceId;
  jobs: NormalizedJob[];
  /** Requests spent (for cost tracking). */
  requests: number;
  error?: string;
}

/** A company on the recruiter's watchlist, read straight from its careers site. */
export interface WatchCompany {
  name: string;
  ats: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workday';
  /** Greenhouse/Lever/Ashby/SmartRecruiters board token. */
  token?: string;
  /** Workday: host, tenant and site, e.g. nvidia.wd5.myworkdayjobs.com / nvidia / NVIDIAExternalCareerSite */
  host?: string;
  tenant?: string;
  site?: string;
  /** Industry the recruiter tags the company with ("Healthcare"). */
  industry?: string;
}
