/**
 * Company careers sites (the recruiter's watchlist of end clients), read through each ATS's public job API:
 * Greenhouse, Lever, Ashby, SmartRecruiters and Workday. No API keys, direct apply links.
 */
import { NormalizedJob, SourceContext, SourceResult, WatchCompany } from '../types.js';
import { dateOnlyToIso, htmlToText, isDateOnly, parseRelativePosted } from '../text.js';

function iso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000).toISOString();
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Works out the ATS and board token from a careers page link the recruiter pastes. */
export function parseCareerUrl(url: string, name?: string): WatchCompany | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  const label = (token: string) => name || token.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const token = host.startsWith('boards-api') ? parts[2] : u.searchParams.get('for') || parts[0];
    return token ? { name: label(token), ats: 'greenhouse', token } : null;
  }
  if (host === 'jobs.lever.co' || host === 'api.lever.co') {
    const token = host === 'api.lever.co' ? parts[2] : parts[0];
    return token ? { name: label(token), ats: 'lever', token } : null;
  }
  if (host === 'jobs.ashbyhq.com' || host === 'api.ashbyhq.com') {
    const token = host === 'api.ashbyhq.com' ? parts[2] : parts[0];
    return token ? { name: label(token), ats: 'ashby', token } : null;
  }
  if (/smartrecruiters\.com$/.test(host)) {
    const token = host === 'api.smartrecruiters.com' ? parts[2] : parts[0];
    return token ? { name: label(token), ats: 'smartrecruiters', token } : null;
  }
  const wd = host.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (wd) {
    const tenant = wd[1];
    const site = parts.find((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p) && p !== 'wday' && p !== 'cxs' && p !== tenant);
    return site ? { name: label(tenant), ats: 'workday', host, tenant, site } : null;
  }
  return null;
}

async function getJson(ctx: SourceContext, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) {
  const res = await ctx.fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Greenhouse list without descriptions (a board with content can be 5-15 MB);
 * the engine reads full postings only for matching, recent titles via greenhouseDetails.
 */
export async function fetchGreenhouse(c: WatchCompany, ctx: SourceContext): Promise<SourceResult> {
  const body = await getJson(ctx, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.token!)}/jobs`);
  const jobs: NormalizedJob[] = (body?.jobs || []).map((j: any) => ({
    id: `greenhouse:${c.token}:${j.id}`,
    source: 'greenhouse',
    publisher: `${c.name} careers`,
    title: String(j.title || ''),
    company: String(j.company_name || c.name),
    location: String(j.location?.name || ''),
    isRemote: /remote/i.test(j.location?.name || '') ? true : null,
    postedAt: iso(j.first_published) || iso(j.updated_at),
    employmentType: null,
    url: String(j.absolute_url || ''),
    applyOptions: j.absolute_url ? [{ publisher: `${c.name} careers`, url: String(j.absolute_url) }] : [],
    description: htmlToText(j.content),
  }));
  return { source: 'greenhouse', jobs, requests: 1 };
}

export async function greenhouseDetails(c: WatchCompany, job: NormalizedJob, ctx: SourceContext): Promise<string> {
  const id = job.id.split(':').pop();
  const body = await getJson(ctx, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.token!)}/jobs/${id}`);
  return htmlToText(body?.content);
}

export async function fetchLever(c: WatchCompany, ctx: SourceContext): Promise<SourceResult> {
  const body = await getJson(ctx, `https://api.lever.co/v0/postings/${encodeURIComponent(c.token!)}?mode=json`);
  const jobs: NormalizedJob[] = (Array.isArray(body) ? body : []).map((j: any) => {
    const lists = (j.lists || []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`).join('\n');
    const location = String(j.categories?.location || (j.categories?.allLocations || []).join(' / ') || '');
    return {
      id: `lever:${c.token}:${j.id}`,
      source: 'lever',
      publisher: `${c.name} careers`,
      title: String(j.text || ''),
      company: c.name,
      location,
      isRemote: j.workplaceType === 'remote' || /remote/i.test(location) ? true : j.workplaceType ? false : null,
      postedAt: iso(j.createdAt),
      employmentType: j.categories?.commitment ? String(j.categories.commitment) : null,
      url: String(j.hostedUrl || j.applyUrl || ''),
      applyOptions: j.applyUrl ? [{ publisher: `${c.name} careers`, url: String(j.applyUrl) }] : [],
      description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join('\n'),
    };
  });
  return { source: 'lever', jobs, requests: 1 };
}

export async function fetchAshby(c: WatchCompany, ctx: SourceContext): Promise<SourceResult> {
  const body = await getJson(ctx, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.token!)}?includeCompensation=true`);
  const jobs: NormalizedJob[] = (body?.jobs || [])
    .filter((j: any) => j.isListed !== false)
    .map((j: any) => {
      const location = [j.location, ...(j.secondaryLocations || []).map((s: any) => s.location)].filter(Boolean).join(' / ');
      return {
        id: `ashby:${c.token}:${j.id}`,
        source: 'ashby',
        publisher: `${c.name} careers`,
        title: String(j.title || ''),
        company: c.name,
        location,
        isRemote: typeof j.isRemote === 'boolean' ? j.isRemote : null,
        postedAt: iso(j.publishedAt),
        employmentType: j.employmentType ? String(j.employmentType) : null,
        url: String(j.jobUrl || j.applyUrl || ''),
        applyOptions: j.applyUrl ? [{ publisher: `${c.name} careers`, url: String(j.applyUrl) }] : [],
        description: String(j.descriptionPlain || htmlToText(j.descriptionHtml)),
        salary: j.compensation?.compensationTierSummary ? { currency: 'USD', period: j.compensation.compensationTierSummary } : null,
      };
    });
  return { source: 'ashby', jobs, requests: 1 };
}

/** SmartRecruiters lists without descriptions; details are fetched for the best few by the engine. */
export async function fetchSmartRecruiters(c: WatchCompany, ctx: SourceContext, keywords: string): Promise<SourceResult> {
  const q = new URLSearchParams({ q: keywords, limit: '100', country: 'us' });
  const body = await getJson(ctx, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.token!)}/postings?${q}`);
  const jobs: NormalizedJob[] = (body?.content || []).map((j: any) => {
    const loc = j.location || {};
    // SmartRecruiters often repeats parts ("United States, UNITED STATES, US") or shouts the state name
    const parts: string[] = [];
    for (const raw of [loc.city, loc.region, loc.country?.toUpperCase?.()]) {
      if (!raw) continue;
      let p = String(raw).trim();
      if (p.length > 3 && p === p.toUpperCase()) p = p.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
      if (!parts.some((x) => x.toLowerCase() === p.toLowerCase())) parts.push(p);
    }
    const location = parts.join(', ');
    const url = `https://jobs.smartrecruiters.com/${c.token}/${j.id}`;
    return {
      id: `smartrecruiters:${c.token}:${j.id}`,
      source: 'smartrecruiters',
      publisher: `${c.name} careers`,
      title: String(j.name || ''),
      company: String(j.company?.name || c.name),
      location,
      isRemote: typeof loc.remote === 'boolean' ? loc.remote : null,
      postedAt: iso(j.releasedDate),
      employmentType: j.typeOfEmployment?.label ? String(j.typeOfEmployment.label) : null,
      url,
      applyOptions: [{ publisher: `${c.name} careers`, url }],
      description: '',
    };
  });
  return { source: 'smartrecruiters', jobs, requests: 1 };
}

export async function smartRecruitersDetails(c: WatchCompany, job: NormalizedJob, ctx: SourceContext): Promise<string> {
  const id = job.id.split(':').pop();
  const body = await getJson(ctx, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.token!)}/postings/${id}`);
  const s = body?.jobAd?.sections || {};
  return [s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].map((h: string) => htmlToText(h)).filter(Boolean).join('\n');
}

/** Workday career sites: search with the site's own JSON API, then read the matching postings. */
export async function fetchWorkday(c: WatchCompany, ctx: SourceContext, keywords: string, limit = 20): Promise<SourceResult> {
  const base = `https://${c.host}/wday/cxs/${c.tenant}/${c.site}`;
  const body = await getJson(ctx, `${base}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ appliedFacets: {}, limit: Math.min(20, limit), offset: 0, searchText: keywords }),
  });
  const now = ctx.now ? ctx.now() : new Date();
  const jobs: NormalizedJob[] = (body?.jobPostings || []).map((j: any) => ({
    id: `workday:${c.tenant}:${j.externalPath}`,
    source: 'workday',
    publisher: `${c.name} careers`,
    title: String(j.title || ''),
    company: c.name,
    location: String(j.locationsText || ''),
    isRemote: /remote/i.test(j.locationsText || '') ? true : null,
    postedAt: parseRelativePosted(j.postedOn, now),
    postedPrecision: /\b(?:minute|min|hour|hr)s?\s+ago/i.test(String(j.postedOn || '')) ? 'exact' : 'day',
    employmentType: null,
    url: `https://${c.host}/${c.site}${j.externalPath}`,
    applyOptions: [{ publisher: `${c.name} careers`, url: `https://${c.host}/${c.site}${j.externalPath}` }],
    description: '',
  }));
  return { source: 'workday', jobs, requests: 1 };
}

export async function workdayDetails(c: WatchCompany, job: NormalizedJob, ctx: SourceContext): Promise<Partial<NormalizedJob>> {
  const path = job.id.slice(`workday:${c.tenant}:`.length);
  const body = await getJson(ctx, `https://${c.host}/wday/cxs/${c.tenant}/${c.site}${path}`, { headers: { Accept: 'application/json' } });
  const info = body?.jobPostingInfo || {};
  const now = ctx.now ? ctx.now() : new Date();
  // Workday's startDate is usually a date with no time: keep it as a day-level date, not midnight UTC
  const start = typeof info.startDate === 'string' ? info.startDate.trim() : '';
  const posted: Partial<NormalizedJob> = !start
    ? {}
    : isDateOnly(start)
      ? { postedAt: dateOnlyToIso(start, now) || job.postedAt, postedPrecision: 'day' }
      : { postedAt: iso(start) || job.postedAt, postedPrecision: 'exact' };
  return {
    description: htmlToText(info.jobDescription),
    employmentType: info.timeType ? String(info.timeType) : job.employmentType,
    ...posted,
    url: String(info.externalUrl || job.url),
    // Multi-location postings list the rest in additionalLocations ("2 Locations" in search results)
    location: [info.location, ...(Array.isArray(info.additionalLocations) ? info.additionalLocations : [])].filter(Boolean).join(' / ') || job.location,
    isRemote: info.remoteType ? /remote/i.test(String(info.remoteType)) : job.isRemote,
  };
}
