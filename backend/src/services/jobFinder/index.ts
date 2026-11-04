/**
 * Job finder entry point for the API: one search for one bench candidate.
 * See engine.ts for how jobs are found, read, filtered and ordered.
 */
import { buildQueries, findJobs, FindJobsOutput, HiddenJob, SourceSummary } from './engine.js';
import { employmentLabel } from './match.js';
import { buildProfile } from './profile.js';
import { createJobFinderFetch } from './http.js';
import { CandidateForSearch, FetchLike, MatchResult, NormalizedJob, WatchCompany } from './types.js';

export { toSearchCandidate } from './candidate.js';
export type { CandidateRecord, AnalysisRecord, SearchOverrides } from './candidate.js';
export { DEFAULT_WATCHLIST, defaultWatchlist, companiesFromLinks, mergeWatchlists, careersPage } from './watchlist.js';
export { INDUSTRY_NAMES } from './industry.js';

export type PostedWithin = 1 | 3 | 7 | 30;

export interface JobFinderOptions {
  /** 1 = last 24 hours (default), 3 days, 1 week, 1 month. */
  postedWithinDays: PostedWithin;
  excludeCitizenship: boolean;
  excludeClearance: boolean;
  industryFirst: boolean;
  contractOnly: boolean;
  remoteOnly: boolean;
  hideBlocked: boolean;
  sortBy: 'newest' | 'best';
}

export const DEFAULT_OPTIONS: JobFinderOptions = {
  postedWithinDays: 1,
  excludeCitizenship: true,
  excludeClearance: true,
  industryFirst: true,
  contractOnly: false,
  remoteOnly: false,
  hideBlocked: false,
  sortBy: 'newest',
};

export interface JobFinderConfig {
  JSEARCH_API_KEY?: string;
  JSEARCH_PROVIDER?: string;
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
}

export interface FoundJob {
  id: string;
  source: string;
  publisher: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean | null;
  postedAt: string | null;
  /** 'day' when the site only gives a date (Workday): postedAt is then midday of that day. */
  postedPrecision: 'exact' | 'day';
  employmentType: string | null;
  url: string;
  applyOptions: Array<{ publisher: string; url: string }>;
  salary: NormalizedJob['salary'] | null;
  /** Plain-text posting (capped). */
  description: string;
  match: MatchResult & { employmentLabel: string };
  signals: {
    c2c: string;
    w2Only: boolean;
    workMode: string;
    rate: string | null;
    durationMonths: number | null;
    minYears: number | null;
    citizenship: string | null;
    clearanceRequired: string | null;
    noSponsorship: boolean;
    localOnly: boolean;
    evidence: string[];
  };
}

export interface JobFinderResult {
  candidate: {
    name: string;
    titles: string[];
    coreTech: string[];
    mustHave: string[];
    industries: string[];
    visa: string;
    workPreference: string | null;
    location: string | null;
    c2cOnly: boolean;
  };
  options: JobFinderOptions;
  portals: { jsearch: boolean; adzuna: boolean };
  careerSites: number;
  sources: SourceSummary[];
  removed: FindJobsOutput['removed'];
  hidden: HiddenJob[];
  total: number;
  jobs: FoundJob[];
  tookMs: number;
}

const MAX_DESCRIPTION = 15000;

function toFoundJob(j: NormalizedJob): FoundJob {
  const m = j.match!;
  const s = j.signals!;
  return {
    id: j.id,
    source: j.source,
    publisher: j.publisher,
    title: j.title.trim(),
    company: j.company,
    location: j.location,
    isRemote: j.isRemote,
    postedAt: j.postedAt,
    postedPrecision: j.postedPrecision || 'exact',
    employmentType: j.employmentType,
    url: j.url,
    applyOptions: j.applyOptions,
    salary: j.salary || null,
    description: (j.description || '').slice(0, MAX_DESCRIPTION),
    match: { ...m, employmentLabel: employmentLabel(m.employment) },
    signals: {
      c2c: s.c2c,
      w2Only: s.w2Only,
      workMode: s.workMode,
      rate: s.rate,
      durationMonths: s.durationMonths,
      minYears: s.minYears,
      citizenship: s.citizenship,
      clearanceRequired: s.clearanceRequired,
      noSponsorship: s.noSponsorship,
      localOnly: s.localOnly,
      evidence: s.evidence,
    },
  };
}

/** Search portals (when keys are set) and the watchlist's career sites for one candidate. */
export async function searchJobsForCandidate(
  candidate: CandidateForSearch,
  watchlist: WatchCompany[],
  options: Partial<JobFinderOptions>,
  config: JobFinderConfig,
  deps: { fetch?: FetchLike; now?: () => Date } = {}
): Promise<JobFinderResult> {
  const o: JobFinderOptions = { ...DEFAULT_OPTIONS, ...options };
  const profile = buildProfile(candidate);
  const queries = buildQueries(candidate, {
    postedWithinDays: o.postedWithinDays,
    contractOnly: o.contractOnly ? true : undefined,
    remoteOnly: o.remoteOnly ? true : undefined,
  });
  const out = await findJobs(
    {
      candidate,
      queries,
      watchlist,
      filters: {
        postedWithinDays: o.postedWithinDays,
        excludeCitizenship: o.excludeCitizenship,
        excludeClearance: o.excludeClearance,
        industryFirst: o.industryFirst,
        contractOnly: o.contractOnly,
        remoteOnly: o.remoteOnly,
        hideBlocked: o.hideBlocked,
      },
      sortBy: o.sortBy,
      maxResults: 150,
    },
    { fetch: deps.fetch || createJobFinderFetch(), config: { ...config }, now: deps.now }
  );
  return {
    candidate: {
      name: candidate.name,
      titles: profile.titles,
      coreTech: profile.coreTech,
      mustHave: profile.mustHave,
      industries: profile.industries,
      visa: candidate.visa,
      workPreference: candidate.workPreference || null,
      location: candidate.location || null,
      c2cOnly: candidate.c2cOnly !== false,
    },
    options: o,
    portals: { jsearch: Boolean(config.JSEARCH_API_KEY), adzuna: Boolean(config.ADZUNA_APP_ID && config.ADZUNA_APP_KEY) },
    careerSites: watchlist.length,
    sources: out.sources,
    removed: out.removed,
    hidden: out.hidden,
    total: out.jobs.length,
    jobs: out.jobs.map(toFoundJob),
    tookMs: out.tookMs,
  };
}
