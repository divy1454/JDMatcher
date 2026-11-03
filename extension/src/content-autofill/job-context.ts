/**
 * Works out which job the candidate is applying to, so AI answers can use the job description.
 *
 * Sources, in order:
 *  1. The job description on the current page (Greenhouse, Lever, Workday, LinkedIn, Dice, Ashby...)
 *  2. The JD the recruiter evaluated in the JDMatcher widget for this candidate in the last few hours
 */
import { StoredEvaluationState } from '../content/types';
import { textOf, isRendered } from './dom-utils';
import { cleanLabel } from './text-utils';

export interface JobContext {
  jobTitle?: string;
  companyName?: string;
  jobDescription?: string;
  source: 'page' | 'evaluation' | 'none';
}

const MAX_JD_CHARS = 15000;
const EVALUATION_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const JD_SELECTORS = [
  '[data-automation-id="jobPostingDescription"]', // Workday
  '.job__description', // Greenhouse (new)
  '#content .job-post', // Greenhouse
  '.job-post-content',
  '[data-qa="job-description"]', // Lever
  '.posting-page .section-wrapper',
  '.jobs-description__content', // LinkedIn
  '#job-details',
  '[data-testid="jobDescriptionHtml"]', // Dice
  '#jobDescription',
  '[class*="_descriptionText"]', // Ashby
  '.job-sections', // SmartRecruiters
  '.iCIMS_JobContent',
  '[itemprop="description"]',
  '[class*="job-description"]',
  '[id*="job-description"]',
  '[class*="jobDescription"]',
  '[id*="jobDescription"]',
  '.job-description',
  '.description',
];

let cached: { url: string; profileId: string; ctx: JobContext } | null = null;

function scrapeJobDescription(): string {
  for (const selector of JD_SELECTORS) {
    let nodes: HTMLElement[] = [];
    try {
      nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
    } catch {
      continue;
    }
    for (const node of nodes) {
      if (!isRendered(node)) continue;
      // Skip containers that are mostly the application form itself
      if (node.querySelectorAll('input, select, textarea').length > 3) continue;
      const text = textOf(node);
      if (text.length >= 250) return text.slice(0, MAX_JD_CHARS);
    }
  }
  return '';
}

function scrapeJobTitle(): string {
  const candidates = [
    '[data-automation-id="jobPostingHeader"]',
    '.posting-headline h2',
    '.job__title h1',
    '.app-title',
    '.jobs-unified-top-card__job-title',
    'h1',
  ];
  for (const selector of candidates) {
    const el = document.querySelector(selector);
    const txt = textOf(el);
    if (txt && txt.length <= 140) return txt;
  }
  const title = cleanLabel(document.title.split(/[|\-–—]/)[0]);
  return title.length <= 140 ? title : '';
}

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/** Company name from well-known ATS URLs or page metadata. */
function scrapeCompanyName(): string {
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.split('/').filter(Boolean);
  if (host.endsWith('myworkdayjobs.com') || host.endsWith('workday.com')) {
    const sub = host.split('.')[0];
    if (sub && !/^(wd\d+|www)$/.test(sub)) return titleCase(sub);
  }
  if ((host.includes('greenhouse.io') || host.includes('lever.co') || host.includes('ashbyhq.com')) && path[0]) {
    return titleCase(path[0]);
  }
  const og = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  if (og && og.length <= 80) return cleanLabel(og);
  return '';
}

function readEvaluationState(): Promise<StoredEvaluationState | null> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(null);
      chrome.storage.local.get(['evaluationState'], (res) => resolve((res?.evaluationState as StoredEvaluationState) || null));
    } catch {
      resolve(null);
    }
  });
}

/** Job context for the AI step. Cached per page URL and candidate. */
export async function getJobContext(profileId: string): Promise<JobContext> {
  const url = window.location.href;
  if (cached && cached.url === url && cached.profileId === profileId) return cached.ctx;

  const pageJd = scrapeJobDescription();
  const evaluation = await readEvaluationState();
  const evalFresh =
    evaluation &&
    evaluation.scrapedJdText &&
    evaluation.scrapedJdText.trim().length >= 100 &&
    (!evaluation.selectedCandidateId || evaluation.selectedCandidateId === profileId) &&
    (!evaluation.timestamp || Date.now() - evaluation.timestamp < EVALUATION_MAX_AGE_MS);

  let ctx: JobContext;
  if (pageJd) {
    ctx = {
      source: 'page',
      jobDescription: pageJd,
      jobTitle: scrapeJobTitle() || (evalFresh ? evaluation!.jobTitle : undefined),
      companyName: scrapeCompanyName() || (evalFresh ? evaluation!.companyOrClient : undefined),
    };
  } else if (evalFresh) {
    ctx = {
      source: 'evaluation',
      jobDescription: evaluation!.scrapedJdText!.slice(0, MAX_JD_CHARS),
      jobTitle: evaluation!.jobTitle || evaluation!.result?.jobTitle || scrapeJobTitle(),
      companyName: evaluation!.companyOrClient || evaluation!.result?.companyName || scrapeCompanyName(),
    };
  } else {
    ctx = { source: 'none', jobTitle: scrapeJobTitle() || undefined, companyName: scrapeCompanyName() || undefined };
  }
  cached = { url, profileId, ctx };
  return ctx;
}

/** Clears the cache (e.g. when the candidate changes). */
export function resetJobContextCache(): void {
  cached = null;
}
