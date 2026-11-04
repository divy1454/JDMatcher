/**
 * Applicant tracking systems and job sites the engine knows.
 *
 * On a known ATS page the engine fills on page load (zero-click) and treats a short page (two
 * questions) as part of the application. `paths` keeps a host to its candidate pages: the same
 * domains also serve payroll, HR and recruiter apps (ADP Workforce Now, JobDiva's recruiter side,
 * BambooHR, LinkedIn profiles) that must never be filled with a candidate's details.
 */

interface AtsSite {
  name: string;
  hosts: string[];
  /** Tested against the lower-case path; the site counts only when it matches. */
  paths?: RegExp;
}

export const ATS_SITES: AtsSite[] = [
  { name: 'greenhouse', hosts: ['greenhouse.io'] },
  { name: 'lever', hosts: ['lever.co'] },
  { name: 'workday', hosts: ['myworkdayjobs.com', 'myworkdaysite.com', 'workday.com'] },
  { name: 'linkedin', hosts: ['linkedin.com'], paths: /^\/jobs\// },
  { name: 'dice', hosts: ['dice.com'] },
  { name: 'icims', hosts: ['icims.com'] },
  { name: 'ashby', hosts: ['ashbyhq.com'] },
  { name: 'smartrecruiters', hosts: ['smartrecruiters.com'] },
  { name: 'rippling', hosts: ['ats.rippling.com'] },
  { name: 'jobdiva', hosts: ['jobdiva.com'], paths: /^\/(portal|candidates)\b/ },
  { name: 'adp', hosts: ['workforcenow.adp.com'], paths: /\/recruitment\// },
  { name: 'adp', hosts: ['myjobs.adp.com', 'recruiting.adp.com'] },
  { name: 'workable', hosts: ['apply.workable.com', 'jobs.workable.com'] },
  { name: 'jobvite', hosts: ['jobs.jobvite.com'] },
  { name: 'taleo', hosts: ['taleo.net'], paths: /\/careersection\// },
  { name: 'oracle', hosts: ['oraclecloud.com'], paths: /\/hcmui\/candidateexperience\// },
  { name: 'successfactors', hosts: ['successfactors.com', 'successfactors.eu'], paths: /^\/career/ },
  { name: 'paylocity', hosts: ['recruiting.paylocity.com'] },
  { name: 'paycom', hosts: ['paycomonline.net'], paths: /\/ats\// },
  { name: 'ukg', hosts: ['recruiting.ultipro.com', 'recruiting2.ultipro.com'] },
  { name: 'paycor', hosts: ['recruitingbypaycor.com'] },
  { name: 'isolved', hosts: ['isolvedhire.com'] },
  { name: 'bamboohr', hosts: ['bamboohr.com'], paths: /^\/(careers|jobs)\b/ },
  { name: 'breezy', hosts: ['breezy.hr'] },
  { name: 'jazzhr', hosts: ['applytojob.com'] },
  { name: 'recruitee', hosts: ['recruitee.com'] },
  { name: 'teamtailor', hosts: ['teamtailor.com'] },
  { name: 'personio', hosts: ['jobs.personio.de', 'jobs.personio.com'] },
  { name: 'bullhorn', hosts: ['bullhornstaffing.com'] },
  { name: 'avature', hosts: ['avature.net'], paths: /\/careers\b/ },
  { name: 'gem', hosts: ['jobs.gem.com'] },
  { name: 'pinpoint', hosts: ['pinpointhq.com'] },
  { name: 'zoho', hosts: ['zohorecruit.com'] },
];

/** Job boards: zero-click fill, but only pages that look like an application (3+ questions or an upload). */
const JOB_BOARD_HOSTS = ['indeed.com', 'monster.com'];

/** Recruiter and employer tools on job-board domains: never filled without the Fill Form button. */
const EMPLOYER_HOSTS = ['employers.indeed.com', 'hire.indeed.com', 'recruiter.linkedin.com'];

const onHost = (host: string, domain: string) => host === domain || host.endsWith('.' + domain);

/** The known ATS behind this page ("jobdiva", "adp", ...), or null. */
export function knownAtsSite(loc: Pick<Location, 'hostname' | 'pathname'> = window.location): string | null {
  const host = loc.hostname.toLowerCase();
  const path = loc.pathname.toLowerCase();
  if (EMPLOYER_HOSTS.some((d) => onHost(host, d))) return null;
  for (const site of ATS_SITES) {
    if (!site.hosts.some((d) => onHost(host, d))) continue;
    if (site.paths && !site.paths.test(path)) continue;
    return site.name;
  }
  return null;
}

/** Fill on page load here? Known ATS pages, job boards, and career/apply pages of any company site. */
export function isRecognizedJobPage(loc: Pick<Location, 'hostname' | 'pathname' | 'href'> = window.location): boolean {
  const host = loc.hostname.toLowerCase();
  const path = loc.pathname.toLowerCase();
  const href = loc.href.toLowerCase();
  if (EMPLOYER_HOSTS.some((d) => onHost(host, d))) return false;
  if (knownAtsSite(loc)) return true;
  if (JOB_BOARD_HOSTS.some((d) => onHost(host, d))) return true;
  return path.includes('/apply') || path.includes('/careers') || path.includes('/jobs') || href.includes('gh_jid=') || href.includes('lever.co/');
}
