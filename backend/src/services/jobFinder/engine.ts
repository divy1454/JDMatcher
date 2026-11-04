/**
 * JDMatcher job finder: searches job portals and company career sites for a candidate,
 * reads every posting, keeps only the candidate's kind of job, and lists the newest first.
 *
 * Defaults (all changeable with filters):
 *  - posted in the last 24 hours (or 3 days / 1 week / 1 month)
 *  - jobs asking for US citizenship, a green card or a security clearance are hidden,
 *    unless the candidate actually qualifies
 *  - jobs in the candidate's industry first, then the rest, each newest first
 * No scraping of sites that forbid it, and no made-up jobs: if a source fails, it says so.
 */
import { CandidateForSearch, JobQuery, NormalizedJob, SourceContext, SourceId, SourceResult, WatchCompany } from './types.js';
import { searchJSearch, searchAdzuna } from './sources/portals.js';
import {
  fetchGreenhouse,
  greenhouseDetails,
  fetchLever,
  fetchAshby,
  fetchSmartRecruiters,
  smartRecruitersDetails,
  fetchWorkday,
  workdayDetails,
} from './sources/careers.js';
import { detectSignals } from './signals.js';
import { assessRelevance, matchJob, meetsCitizenship, qualifiesForClearance, titleFit, worthReading } from './match.js';
import { buildProfile, SearchProfile } from './profile.js';
import { industrySearchWord } from './industry.js';
import { normalize, stateOf, daysAgo, isNonUs } from './text.js';

export interface SearchFilters {
  /** 1 = last 24 hours (default), 3, 7 or 30 days. */
  postedWithinDays?: number;
  /** US jobs only (default on). */
  usOnly?: boolean;
  /** Hide jobs that ask for US citizenship, a green card or "U.S. person" status, unless the candidate qualifies (default on). */
  excludeCitizenship?: boolean;
  /** Hide jobs that ask for a security clearance, or the ability to get one, unless the candidate has one (default on). */
  excludeClearance?: boolean;
  /** Hide every job the candidate can't be submitted to (W2 only, no sponsorship...). Off by default: they're listed last. */
  hideBlocked?: boolean;
  /** Old name for hideBlocked. */
  hideIneligible?: boolean;
  contractOnly?: boolean;
  remoteOnly?: boolean;
  /** Keep jobs with no posting date (default off: freshness can't be proven). */
  keepUndated?: boolean;
  /** Jobs in the candidate's industry first, then the rest (default on). */
  industryFirst?: boolean;
}

export interface FindJobsInput {
  candidate?: CandidateForSearch;
  queries: JobQuery[];
  watchlist?: WatchCompany[];
  sources?: { portals?: boolean; adzuna?: boolean; watchlist?: boolean };
  filters?: SearchFilters;
  /** newest (default): newest first; best: best match first. */
  sortBy?: 'newest' | 'best';
  maxResults?: number;
}

export interface SourceSummary {
  source: SourceId;
  label: string;
  found: number;
  requests: number;
  error?: string;
}

export type HiddenKind = 'citizenship' | 'clearance' | 'off_target' | 'missing_skills' | 'not_verified';

export interface HiddenJob {
  title: string;
  company: string;
  kind: HiddenKind;
  reason: string;
  /** Link to the posting, so a recruiter can check a hidden job themselves. */
  url: string;
}

export interface FindJobsOutput {
  jobs: NormalizedJob[];
  sources: SourceSummary[];
  removed: {
    tooOld: number;
    outsideUs: number;
    citizenship: number;
    clearance: number;
    offTarget: number;
    missingSkills: number;
    notVerified: number;
    duplicates: number;
    blocked: number;
    otherFilters: number;
  };
  /**
   * Hidden jobs and why (not the old or non-US ones), so nothing disappears silently: every job hidden
   * for citizenship or clearance comes first (up to 100) so they can be double-checked, then examples
   * of the off-target ones.
   */
  hidden: HiddenJob[];
  filters: Required<Pick<SearchFilters, 'postedWithinDays' | 'excludeCitizenship' | 'excludeClearance' | 'industryFirst'>> & { sortBy: 'newest' | 'best' };
  tookMs: number;
}

/**
 * Portal searches for a candidate. Free plans count every request, so by default:
 * one search for the main title (plus one in the candidate's industry first, if they have one),
 * contract roles for bench candidates, posted in the last 24 hours.
 */
export function buildQueries(
  cand: CandidateForSearch,
  opts: { location?: string; contractOnly?: boolean; postedWithinDays?: number; remoteOnly?: boolean; perQuery?: number; maxQueries?: number } = {}
): JobQuery[] {
  const p = buildProfile(cand);
  const remote = opts.remoteOnly ?? cand.workPreference === 'Remote';
  const location = opts.location || (remote ? 'United States' : cand.location || 'United States');
  const contract = opts.contractOnly ?? cand.c2cOnly !== false;
  const base = p.titles[0] || '';
  const texts: string[] = [];
  if (p.industries[0] && base) texts.push(`${base} ${industrySearchWord(p.industries[0])}`);
  texts.push(base, ...p.titles.slice(1));
  const max = opts.maxQueries ?? (p.industries.length ? 2 : 1);
  return Array.from(new Set(texts.filter(Boolean)))
    .slice(0, max)
    .map((keywords) => ({
      keywords,
      location,
      remoteOnly: remote,
      employmentType: contract ? ('contract' as const) : ('any' as const),
      postedWithinDays: opts.postedWithinDays ?? 1,
      limit: opts.perQuery ?? 10,
    }));
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function runLimited<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

const SENIORITY = /\b(sr|senior|jr|junior|lead|principal|staff|i{1,3}|iv|\d)\b/g;

function dedupeKey(j: NormalizedJob): string {
  const title = normalize(j.title).replace(SENIORITY, '').replace(/\s+/g, ' ').trim();
  const company = normalize(j.company).replace(/\b(inc|llc|corp|corporation|co|ltd|technologies|technology|group)\b/g, '').trim();
  const where = stateOf(j.location) || normalize(j.location).slice(0, 18) || 'any';
  return `${company}|${title}|${where}`;
}

function mergeJobs(a: NormalizedJob, b: NormalizedJob): NormalizedJob {
  const keep = (b.description || '').length > (a.description || '').length ? b : a;
  const other = keep === a ? b : a;
  const urls = new Set(keep.applyOptions.map((o) => o.url));
  const applyOptions = [...keep.applyOptions, ...other.applyOptions.filter((o) => !urls.has(o.url))];
  if (other.url && !applyOptions.some((o) => o.url === other.url)) applyOptions.push({ publisher: other.publisher, url: other.url });
  // The original posting time (earliest), preferring a real timestamp over a date-only one
  const exact = [a, b].filter((x) => x.postedAt && x.postedPrecision !== 'day').map((x) => x.postedAt as string);
  const dates = exact.length ? exact : ([a.postedAt, b.postedAt].filter(Boolean) as string[]);
  return {
    ...keep,
    applyOptions,
    companyType: keep.companyType || other.companyType || null,
    postedAt: dates.length ? dates.sort()[0] : null,
    postedPrecision: exact.length ? 'exact' : dates.length ? 'day' : keep.postedPrecision,
    publisher: keep.publisher === other.publisher ? keep.publisher : `${keep.publisher} + ${other.publisher}`,
  };
}

const LABELS: Record<SourceId, string> = {
  jsearch: 'Job portals (Google for Jobs)',
  adzuna: 'Adzuna',
  greenhouse: 'Career sites (Greenhouse)',
  lever: 'Career sites (Lever)',
  ashby: 'Career sites (Ashby)',
  smartrecruiters: 'Career sites (SmartRecruiters)',
  workday: 'Career sites (Workday)',
};

function windowLabel(days: number): string {
  return days <= 1 ? '24 hours' : days <= 3 ? '3 days' : days <= 7 ? '1 week' : `${days} days`;
}

export async function findJobs(input: FindJobsInput, ctx: SourceContext): Promise<FindJobsOutput> {
  const started = Date.now();
  const now = ctx.now ? ctx.now() : new Date();
  const want = { portals: true, adzuna: true, watchlist: true, ...(input.sources || {}) };
  const f = {
    postedWithinDays: 1,
    usOnly: true,
    excludeCitizenship: true,
    excludeClearance: true,
    hideBlocked: false,
    contractOnly: false,
    remoteOnly: false,
    keepUndated: false,
    industryFirst: true,
    ...(input.filters || {}),
  };
  if (input.filters?.hideIneligible) f.hideBlocked = true;
  const sortBy = input.sortBy || 'newest';
  const profile: SearchProfile | null = input.candidate ? buildProfile(input.candidate) : null;
  const queries = input.queries.map((q) => ({ ...q, postedWithinDays: q.postedWithinDays ?? f.postedWithinDays }));
  const tasks: Array<() => Promise<SourceResult>> = [];
  const safe = (source: SourceId, label: string, fn: () => Promise<SourceResult>) => async (): Promise<SourceResult> => {
    try {
      return await withTimeout(fn(), 20000, label);
    } catch (e: any) {
      return { source, jobs: [], requests: 1, error: `${label}: ${e?.message || e}` };
    }
  };

  if (want.portals && ctx.config.JSEARCH_API_KEY) {
    for (const q of queries) tasks.push(safe('jsearch', 'JSearch', () => searchJSearch(q, ctx)));
  }
  if (want.adzuna && ctx.config.ADZUNA_APP_ID && ctx.config.ADZUNA_APP_KEY) {
    for (const q of queries) tasks.push(safe('adzuna', 'Adzuna', () => searchAdzuna(q, ctx)));
  }

  // One hour of slack for clocks. A date-only posting ("Posted Today", Workday's start date) was posted at an
  // unknown time that day: postedAt is midday in the US, so allow until the end of that day in US time.
  const tooOld = (j: NormalizedJob) => {
    const age = daysAgo(j.postedAt, now);
    if (age === null) return !f.keepUndated;
    return age > f.postedWithinDays + 1 / 24 + (j.postedPrecision === 'day' ? 0.6 : 0);
  };
  // Without a candidate, fall back to the searched titles
  const worth = (title: string): { ok: boolean; strong: boolean } => {
    if (profile) return worthReading(title, profile);
    const strong = queries.some((q) => titleFit(q.keywords, title).score >= 0.6);
    return { ok: strong, strong };
  };
  // Career sites that list jobs without descriptions: read the matching recent ones in full
  // (clear title matches first, newest first). The same posting can come back for several keywords: read it once.
  const details = new Map<string, Promise<Partial<NormalizedJob>>>();
  const readBest = async (list: SourceResult, read: (j: NormalizedJob) => Promise<Partial<NormalizedJob>>, max: number): Promise<SourceResult> => {
    const keep = list.jobs
      .map((j) => ({ j, w: worth(j.title) }))
      .filter(({ j, w }) => w.ok && !tooOld(j))
      .sort((a, b) => Number(b.w.strong) - Number(a.w.strong) || Date.parse(b.j.postedAt || '0') - Date.parse(a.j.postedAt || '0'))
      .map(({ j }) => j);
    let requests = list.requests;
    for (const j of keep.slice(0, max)) {
      let pending = details.get(j.id);
      if (!pending) {
        pending = read(j);
        details.set(j.id, pending);
        requests++;
      }
      try {
        Object.assign(j, await pending);
      } catch {
        // keep the listing without a description
      }
    }
    return { ...list, jobs: keep, requests };
  };
  const tag = (c: WatchCompany, r: SourceResult): SourceResult => {
    if (c.industry) for (const j of r.jobs) j.companyType = j.companyType || c.industry;
    return r;
  };

  if (want.watchlist) {
    const keywords = profile ? profile.siteKeywords : queries.map((q) => q.keywords);
    for (const c of input.watchlist || []) {
      const label = `${c.name} (${c.ats})`;
      if (c.ats === 'greenhouse') {
        tasks.push(
          safe('greenhouse', label, async () =>
            tag(c, await readBest(await fetchGreenhouse(c, ctx), async (j) => ({ description: await greenhouseDetails(c, j, ctx) }), 15))
          )
        );
      }
      if (c.ats === 'lever') tasks.push(safe('lever', label, async () => tag(c, await fetchLever(c, ctx))));
      if (c.ats === 'ashby') tasks.push(safe('ashby', label, async () => tag(c, await fetchAshby(c, ctx))));
      if (c.ats === 'smartrecruiters' || c.ats === 'workday') {
        // Both search on their side: one search per keyword, then read the best postings in full
        for (const kw of keywords) {
          tasks.push(
            safe(c.ats, label, async () => {
              const list = c.ats === 'workday' ? await fetchWorkday(c, ctx, kw) : await fetchSmartRecruiters(c, ctx, kw);
              return tag(
                c,
                await readBest(
                  list,
                  async (j) => (c.ats === 'workday' ? workdayDetails(c, j, ctx) : { description: await smartRecruitersDetails(c, j, ctx) }),
                  8
                )
              );
            })
          );
        }
      }
    }
  }

  const results = await runLimited(tasks, 6);

  const summary = new Map<SourceId, SourceSummary>();
  let all: NormalizedJob[] = [];
  for (const r of results) {
    const s = summary.get(r.source) || { source: r.source, label: LABELS[r.source], found: 0, requests: 0 };
    s.found += r.jobs.length;
    s.requests += r.requests;
    if (r.error) s.error = s.error ? `${s.error}; ${r.error}` : r.error;
    summary.set(r.source, s);
    all = all.concat(r.jobs);
  }
  // The same posting can come back for several keywords: keep it once
  const seenIds = new Set<string>();
  all = all.filter((j) => {
    if (seenIds.has(j.id)) return false;
    seenIds.add(j.id);
    return true;
  });

  const removed: FindJobsOutput['removed'] = {
    tooOld: 0,
    outsideUs: 0,
    citizenship: 0,
    clearance: 0,
    offTarget: 0,
    missingSkills: 0,
    notVerified: 0,
    duplicates: 0,
    blocked: 0,
    otherFilters: 0,
  };
  const hiddenAll: HiddenJob[] = [];
  const hide = (j: NormalizedJob, kind: HiddenKind, reason: string) => {
    hiddenAll.push({ title: j.title.trim(), company: j.company, kind, reason, url: j.url });
  };
  const cand = input.candidate;

  // Read every posting, then filter
  for (const j of all) j.signals = detectSignals(j);
  all = all.filter((j) => {
    const s = j.signals!;
    if (tooOld(j)) {
      removed.tooOld++;
      return false;
    }
    if (f.usOnly && isNonUs(j.location)) {
      removed.outsideUs++;
      return false;
    }
    // The candidate's kind of job first, so the citizenship / clearance lists only hold jobs they'd otherwise get
    if (profile) {
      const rel = assessRelevance(j, profile);
      if (!rel.keep) {
        const kind: HiddenKind = rel.dropReason === 'off_target' ? 'off_target' : rel.dropReason === 'missing_skills' ? 'missing_skills' : 'not_verified';
        if (kind === 'off_target') removed.offTarget++;
        else if (kind === 'missing_skills') removed.missingSkills++;
        else removed.notVerified++;
        hide(j, kind, rel.detail || 'not a match');
        return false;
      }
    }
    if (f.excludeCitizenship && s.citizenship && !(cand && meetsCitizenship(cand.visa, s.citizenship))) {
      removed.citizenship++;
      const quote = s.evidence.find((e) => /citizen|green\s*card|\bgc\b|\busc\b|u\.?\s?s\.?\s+person|permanent/i.test(e));
      hide(j, 'citizenship', `${s.citizenship === 'usc' ? 'Asks for US citizenship' : 'Asks for US citizenship or a green card'}${quote ? `: ${quote}` : ''}`);
      return false;
    }
    if (f.excludeClearance && s.clearanceRequired && !(cand && qualifiesForClearance(cand, s.clearanceRequired))) {
      removed.clearance++;
      const quote = s.evidence.find((e) => /clear|secret|sci|trust|poly/i.test(e));
      hide(j, 'clearance', `Asks for a clearance (${s.clearanceRequired})${quote ? `: ${quote}` : ''}`);
      return false;
    }
    if ((f.contractOnly && !s.contract && s.c2c !== 'allowed') || (f.remoteOnly && s.workMode !== 'remote')) {
      removed.otherFilters++;
      return false;
    }
    return true;
  });

  // Same job on several sites (LinkedIn + Dice + the company site) -> one job with several apply links.
  // Two postings from the same site are different jobs, even with the same title: vendors post
  // many "Java Developer" roles for different clients.
  const entries: Array<{ job: NormalizedJob; sources: Set<SourceId> }> = [];
  const byKey = new Map<string, number[]>();
  for (const j of all) {
    const k = dedupeKey(j);
    const idxs = byKey.get(k) || [];
    const twin = idxs.find((i) => !entries[i].sources.has(j.source));
    if (twin !== undefined) {
      entries[twin].job = mergeJobs(entries[twin].job, j);
      entries[twin].sources.add(j.source);
      removed.duplicates++;
    } else {
      idxs.push(entries.length);
      byKey.set(k, idxs);
      entries.push({ job: j, sources: new Set([j.source]) });
    }
  }
  let jobs = entries.map((e) => e.job);

  const time = (j: NormalizedJob) => Date.parse(j.postedAt || '0') || 0;
  if (cand) {
    for (const j of jobs) j.match = matchJob(j, profile!, now);
    if (f.hideBlocked) {
      const before = jobs.length;
      jobs = jobs.filter((j) => j.match!.status !== 'blocked');
      removed.blocked = before - jobs.length;
    }
    const industryGroup = (j: NormalizedJob) => (f.industryFirst && profile!.industries.length && j.match!.industry.matchesCandidate ? 0 : 1);
    const statusRank = { ready: 0, check: 1, blocked: 2 };
    jobs.sort((a, b) => {
      const ma = a.match!;
      const mb = b.match!;
      // Jobs the candidate can't be submitted to always go last
      const blocked = Number(ma.status === 'blocked') - Number(mb.status === 'blocked');
      if (blocked) return blocked;
      const group = industryGroup(a) - industryGroup(b);
      if (group) return group;
      if (sortBy === 'best') return statusRank[ma.status] - statusRank[mb.status] || mb.score - ma.score || time(b) - time(a);
      return time(b) - time(a) || mb.score - ma.score;
    });
  } else {
    jobs.sort((a, b) => time(b) - time(a));
  }

  // Citizenship / clearance hides first and in full: those are the ones a recruiter may want to double-check
  const legal = hiddenAll.filter((h) => h.kind === 'citizenship' || h.kind === 'clearance').slice(0, 100);
  const other = hiddenAll.filter((h) => h.kind !== 'citizenship' && h.kind !== 'clearance').slice(0, Math.max(10, 60 - legal.length));

  return {
    jobs: jobs.slice(0, input.maxResults ?? 100),
    sources: Array.from(summary.values()),
    removed,
    hidden: [...legal, ...other],
    filters: {
      postedWithinDays: f.postedWithinDays,
      excludeCitizenship: f.excludeCitizenship,
      excludeClearance: f.excludeClearance,
      industryFirst: f.industryFirst,
      sortBy,
    },
    tookMs: Date.now() - started,
  };
}

export { windowLabel };
