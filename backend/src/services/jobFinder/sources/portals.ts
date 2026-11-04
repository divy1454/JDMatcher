/**
 * Job portal sources (keyword search across many boards).
 *  - JSearch: Google for Jobs data (LinkedIn, Indeed, Dice, ZipRecruiter, Glassdoor, company sites...)
 *  - Adzuna: its own US index (optional; free key, commercial use may need a licence)
 */
import { JobQuery, NormalizedJob, SourceContext, SourceResult } from '../types.js';
import { hash } from '../text.js';

function datePostedParam(days?: number): string {
  if (!days) return 'all';
  if (days <= 1) return 'today';
  if (days <= 3) return '3days';
  if (days <= 7) return 'week';
  return 'month';
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000).toISOString();
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** JSearch via RapidAPI (default) or OpenWeb Ninja's own endpoint. */
export async function searchJSearch(query: JobQuery, ctx: SourceContext): Promise<SourceResult> {
  const key = ctx.config.JSEARCH_API_KEY;
  if (!key) return { source: 'jsearch', jobs: [], requests: 0, error: 'JSEARCH_API_KEY not set' };
  const direct = ctx.config.JSEARCH_PROVIDER === 'openwebninja';
  const base = direct ? 'https://api.openwebninja.com/jsearch' : 'https://jsearch.p.rapidapi.com';
  const headers: Record<string, string> = direct
    ? { 'x-api-key': key }
    : { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' };

  const pages = Math.min(3, Math.max(1, Math.ceil((query.limit || 10) / 10)));
  const params = new URLSearchParams({
    query: query.location ? `${query.keywords} in ${query.location}` : query.keywords,
    page: '1',
    num_pages: String(pages),
    country: 'us',
    date_posted: datePostedParam(query.postedWithinDays),
  });
  if (query.remoteOnly) params.set('work_from_home', 'true');
  if (query.employmentType === 'contract') params.set('employment_types', 'CONTRACTOR');
  if (query.employmentType === 'fulltime') params.set('employment_types', 'FULLTIME');

  const res = await ctx.fetch(`${base}/search?${params.toString()}`, { headers });
  if (!res.ok) return { source: 'jsearch', jobs: [], requests: 1, error: `JSearch HTTP ${res.status}` };
  const body = await res.json();
  const data: any[] = Array.isArray(body?.data) ? body.data : [];
  const jobs: NormalizedJob[] = data.map((j) => {
    const location = j.job_location || [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ');
    const applyOptions = (Array.isArray(j.apply_options) ? j.apply_options : [])
      .filter((o: any) => o && o.apply_link)
      .map((o: any) => ({ publisher: String(o.publisher || 'Apply'), url: String(o.apply_link) }));
    return {
      id: `jsearch:${j.job_id || hash(`${j.employer_name}|${j.job_title}|${location}`)}`,
      source: 'jsearch',
      publisher: String(j.job_publisher || 'Google Jobs'),
      title: String(j.job_title || ''),
      company: String(j.employer_name || ''),
      location,
      isRemote: typeof j.job_is_remote === 'boolean' ? j.job_is_remote : null,
      postedAt: iso(j.job_posted_at_datetime_utc) || iso(j.job_posted_at_timestamp),
      employmentType: j.job_employment_type ? String(j.job_employment_type) : null,
      companyType: j.employer_company_type ? String(j.employer_company_type) : null,
      url: String(j.job_apply_link || applyOptions[0]?.url || j.job_google_link || ''),
      applyOptions,
      description: String(j.job_description || ''),
      salary:
        j.job_min_salary || j.job_max_salary
          ? { min: j.job_min_salary ?? undefined, max: j.job_max_salary ?? undefined, currency: j.job_salary_currency || 'USD', period: j.job_salary_period || undefined }
          : null,
    } as NormalizedJob;
  });
  return { source: 'jsearch', jobs, requests: pages };
}

/** Adzuna US search. */
export async function searchAdzuna(query: JobQuery, ctx: SourceContext): Promise<SourceResult> {
  const id = ctx.config.ADZUNA_APP_ID;
  const key = ctx.config.ADZUNA_APP_KEY;
  if (!id || !key) return { source: 'adzuna', jobs: [], requests: 0, error: 'ADZUNA_APP_ID / ADZUNA_APP_KEY not set' };
  const params = new URLSearchParams({
    app_id: id,
    app_key: key,
    what: query.keywords,
    results_per_page: String(Math.min(50, query.limit || 20)),
    sort_by: 'date',
    'content-type': 'application/json',
  });
  if (query.location && !/^united states$/i.test(query.location)) params.set('where', query.location);
  if (query.postedWithinDays) params.set('max_days_old', String(query.postedWithinDays));
  if (query.employmentType === 'contract') params.set('contract', '1');
  if (query.employmentType === 'fulltime') params.set('permanent', '1');
  const res = await ctx.fetch(`https://api.adzuna.com/v1/api/jobs/us/search/1?${params.toString()}`);
  if (!res.ok) return { source: 'adzuna', jobs: [], requests: 1, error: `Adzuna HTTP ${res.status}` };
  const body = await res.json();
  const results: any[] = Array.isArray(body?.results) ? body.results : [];
  const jobs: NormalizedJob[] = results.map((r) => ({
    id: `adzuna:${r.id}`,
    source: 'adzuna',
    publisher: 'Adzuna',
    title: String(r.title || '').replace(/<\/?strong>/g, ''),
    company: String(r.company?.display_name || ''),
    location: String(r.location?.display_name || ''),
    isRemote: null,
    postedAt: iso(r.created),
    employmentType: [r.contract_type, r.contract_time].filter(Boolean).join(' ') || null,
    url: String(r.redirect_url || ''),
    applyOptions: r.redirect_url ? [{ publisher: 'Adzuna', url: String(r.redirect_url) }] : [],
    description: String(r.description || '').replace(/<\/?strong>/g, ''),
    salary: r.salary_min || r.salary_max ? { min: r.salary_min, max: r.salary_max, currency: 'USD', period: 'YEAR' } : null,
  }));
  return { source: 'adzuna', jobs, requests: 1 };
}
