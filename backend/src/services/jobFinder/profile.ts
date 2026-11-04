/**
 * What to look for, worked out once per candidate:
 *  - coreTech: technology named in the candidate's titles ("Java" for "Java Developer"). A job must ask for it.
 *  - mustHave: the candidate's top skills (core tech first, generic ones like "Agile" or "Git" skipped).
 *    A job with a matching title must ask for at least 1; a plain "Software Engineer" job for at least 2.
 *  - siteKeywords: what to type into career sites that search on their side (Workday, SmartRecruiters).
 */
import { CandidateForSearch } from './types.js';
import { canonicalSkill, displaySkill, isGenericSkill, techInTitle } from './skills.js';
import { canonicalIndustry } from './industry.js';
import { normalize } from './text.js';

export interface SearchProfile {
  candidate: CandidateForSearch;
  titles: string[];
  coreTech: string[];
  mustHave: string[];
  niceToHave: string[];
  siteKeywords: string[];
  /** Candidate's industries, as industry names ("Healthcare"). */
  industries: string[];
  /** Past clients/employers, normalized for comparison ("wells fargo"). */
  previousCompanies: string[];
}

const COMPANY_SUFFIX = /\b(inc|llc|ltd|corp|corporation|co|company|group|holdings|plc|na|n a|usa|us)\b/g;

/** "Wells Fargo & Co." -> "wells fargo" */
export function companyKey(name: string): string {
  return normalize(name).replace(/&/g, ' ').replace(COMPANY_SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

function uniqBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const k = key(it);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function buildProfile(c: CandidateForSearch): SearchProfile {
  const titles = uniqBy(c.titles.map((t) => t.trim()).filter(Boolean), (t) => t.toLowerCase()).slice(0, 4);
  // Show skills the way the candidate's profile writes them
  const nameOf = new Map<string, string>();
  for (const s of c.skills) if (s && !nameOf.has(canonicalSkill(s))) nameOf.set(canonicalSkill(s), s.trim());
  const name = (key: string) => nameOf.get(key) || displaySkill(key);

  const coreKeys = uniqBy(titles.flatMap((t) => techInTitle(t)), (k) => k);
  const mustKeys = c.mustHaveSkills && c.mustHaveSkills.length
    ? uniqBy(c.mustHaveSkills.map(canonicalSkill), (k) => k).slice(0, 4)
    : uniqBy([...coreKeys, ...c.skills.filter((s) => !isGenericSkill(s)).map(canonicalSkill)], (k) => k).slice(0, 3);

  const coreTech = coreKeys.map(name);
  const mustHave = mustKeys.map(name);
  const niceToHave = uniqBy(c.skills.filter((s) => s && !mustKeys.includes(canonicalSkill(s))), (s) => canonicalSkill(s));
  const siteKeywords = uniqBy([titles[0], coreTech[0], titles[1], titles[2]].filter(Boolean) as string[], (k) => k.toLowerCase()).slice(0, 3);
  const industries = uniqBy((c.industries || []).map((i) => canonicalIndustry(i) || '').filter(Boolean), (i) => i);
  const previousCompanies = uniqBy((c.previousCompanies || []).map(companyKey).filter((k) => k.length >= 2), (k) => k);
  return { candidate: c, titles, coreTech, mustHave, niceToHave, siteKeywords, industries, previousCompanies };
}
