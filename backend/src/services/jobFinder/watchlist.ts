/**
 * Company career sites the job finder reads directly, through each ATS's public job API (no keys).
 *
 * - DEFAULT_WATCHLIST is a starting list (tested live): product companies plus a few healthcare ones.
 * - JOB_FINDER_WATCHLIST (env, JSON array of career-page links or company objects) replaces it for the
 *   whole deployment.
 * - Recruiters add their own end clients' career pages in the Job Hunter page; those links are sent with
 *   each search and checked here.
 * Only known ATS hosts are accepted, and API URLs are always built for those hosts (never fetched as given).
 */
import { parseCareerUrl } from './sources/careers.js';
import { WatchCompany } from './types.js';

const HEALTHCARE = 'Healthcare';

const greenhouse = (token: string, name: string, industry?: string): WatchCompany => ({ name, ats: 'greenhouse', token, ...(industry ? { industry } : {}) });
const lever = (token: string, name: string, industry?: string): WatchCompany => ({ name, ats: 'lever', token, ...(industry ? { industry } : {}) });
const ashby = (token: string, name: string): WatchCompany => ({ name, ats: 'ashby', token });
const smartRecruiters = (token: string, name: string): WatchCompany => ({ name, ats: 'smartrecruiters', token });

export const DEFAULT_WATCHLIST: WatchCompany[] = [
  greenhouse('datadog', 'Datadog'),
  greenhouse('cloudflare', 'Cloudflare'),
  greenhouse('gitlab', 'GitLab'),
  greenhouse('mongodb', 'MongoDB'),
  greenhouse('databricks', 'Databricks'),
  greenhouse('coinbase', 'Coinbase'),
  greenhouse('robinhood', 'Robinhood'),
  greenhouse('okta', 'Okta'),
  greenhouse('twilio', 'Twilio'),
  greenhouse('pinterest', 'Pinterest'),
  greenhouse('oscar', 'Oscar Health', HEALTHCARE),
  greenhouse('zocdoc', 'Zocdoc', HEALTHCARE),
  greenhouse('cloverhealth', 'Clover Health', HEALTHCARE),
  greenhouse('garnerhealth', 'Garner Health', HEALTHCARE),
  greenhouse('flatironhealth', 'Flatiron Health', HEALTHCARE),
  lever('palantir', 'Palantir'),
  lever('spotify', 'Spotify'),
  lever('zoox', 'Zoox'),
  lever('includedhealth', 'Included Health', HEALTHCARE),
  lever('ro', 'Ro', HEALTHCARE),
  ashby('ramp', 'Ramp'),
  ashby('notion', 'Notion'),
  ashby('linear', 'Linear'),
  smartRecruiters('ServiceNow', 'ServiceNow'),
  smartRecruiters('BoschGroup', 'Bosch'),
  smartRecruiters('Experian', 'Experian'),
  smartRecruiters('WesternDigital', 'Western Digital'),
  { name: 'NVIDIA', ats: 'workday', host: 'nvidia.wd5.myworkdayjobs.com', tenant: 'nvidia', site: 'NVIDIAExternalCareerSite' },
];

const ATS = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday']);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const WORKDAY_HOST = /^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/;

/** A company entry is safe to read: known ATS, plain board token, Workday host on myworkdayjobs.com. */
export function isValidCompany(c: Partial<WatchCompany> | null | undefined): c is WatchCompany {
  if (!c || typeof c !== 'object' || !c.ats || !ATS.has(c.ats)) return false;
  if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 120) return false;
  if (c.ats === 'workday') return WORKDAY_HOST.test(c.host || '') && TOKEN.test(c.tenant || '') && TOKEN.test(c.site || '');
  return TOKEN.test(c.token || '');
}

/** Career page links -> companies. Links on other hosts, or malformed ones, come back in `rejected`. */
export function companiesFromLinks(links: string[]): { companies: WatchCompany[]; rejected: string[] } {
  const companies: WatchCompany[] = [];
  const rejected: string[] = [];
  for (const raw of links) {
    const link = String(raw || '').trim();
    if (!link) continue;
    const c = parseCareerUrl(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    if (c && isValidCompany(c)) companies.push(c);
    else rejected.push(link);
  }
  return { companies, rejected };
}

/** Same board listed twice (from the defaults and a recruiter's list) is read once. */
export function companyId(c: WatchCompany): string {
  return c.ats === 'workday' ? `workday:${c.host}/${c.site}`.toLowerCase() : `${c.ats}:${c.token}`.toLowerCase();
}

export function mergeWatchlists(...lists: WatchCompany[][]): WatchCompany[] {
  const seen = new Map<string, WatchCompany>();
  for (const list of lists) for (const c of list) if (!seen.has(companyId(c))) seen.set(companyId(c), c);
  return Array.from(seen.values());
}

/** The deployment's default list: JOB_FINDER_WATCHLIST when set (links or company objects), else DEFAULT_WATCHLIST. */
export function defaultWatchlist(envValue?: string): WatchCompany[] {
  const raw = String(envValue || '').trim();
  if (!raw) return DEFAULT_WATCHLIST;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_WATCHLIST;
    const links = parsed.filter((x): x is string => typeof x === 'string');
    const objects = parsed.filter((x) => x && typeof x === 'object' && isValidCompany(x)) as WatchCompany[];
    const list = [...objects, ...companiesFromLinks(links).companies];
    return list.length ? mergeWatchlists(list) : DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

/** Public careers page for a company (shown in the UI so recruiters can open it). */
export function careersPage(c: WatchCompany): string {
  switch (c.ats) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${c.token}`;
    case 'lever':
      return `https://jobs.lever.co/${c.token}`;
    case 'ashby':
      return `https://jobs.ashbyhq.com/${c.token}`;
    case 'smartrecruiters':
      return `https://jobs.smartrecruiters.com/${c.token}`;
    case 'workday':
      return `https://${c.host}/${c.site}`;
  }
}
