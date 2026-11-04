/**
 * A bench candidate as stored in JDMatcher -> what the job finder searches with.
 *
 * Titles: the candidate's primary title, plus up to two "Primary" roles from their latest resume analysis.
 * Industries: the domains the resume analysis found, else worked out from the resume (employers + domain words).
 * Past clients: companies in the structured profile's work history.
 * The recruiter can override titles and industry for one search.
 */
import { CandidateForSearch } from './types.js';
import { canonicalIndustry, industriesFromResume } from './industry.js';

export interface CandidateRecord {
  fullName: string;
  primaryTitle: string;
  visaStatus: string;
  workPreference: string;
  securityClearance: string;
  yearsOfExperience: number;
  keySkills: string[] | null;
  rawResumeText: string;
  structuredProfile: Record<string, any> | null;
}

export interface AnalysisRecord {
  industriesAndDomains?: unknown;
  roleTiers?: unknown;
}

export interface SearchOverrides {
  /** Titles to search instead of the derived ones. */
  titles?: string[];
  /** "auto" (default), "none", or an industry name ("Healthcare"). */
  industry?: string;
  /** Candidate is placed corp-to-corp: W2-only / no-C2C jobs are marked can't-submit. Default true. */
  c2cOnly?: boolean;
}

export interface SearchCandidate {
  candidate: CandidateForSearch;
  /** Where the industries came from, for the UI. */
  industrySource: 'chosen' | 'resume analysis' | 'resume' | 'none';
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : []);

function uniqueCaseless(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function primaryRoles(analysis: AnalysisRecord | null | undefined): string[] {
  const tiers = Array.isArray(analysis?.roleTiers) ? (analysis!.roleTiers as Array<Record<string, unknown>>) : [];
  const primary = tiers.find((t) => /primary/i.test(String(t?.tier || ''))) || tiers[0];
  return asStrings(primary?.roles).filter((r) => r.length <= 80);
}

function analysisIndustries(analysis: AnalysisRecord | null | undefined): string[] {
  const domains = (analysis?.industriesAndDomains as { handsOnDomains?: unknown } | undefined)?.handsOnDomains;
  if (!Array.isArray(domains)) return [];
  const names = domains.map((d) => (typeof d === 'string' ? d : typeof d?.name === 'string' ? d.name : '')).filter(Boolean);
  return uniqueCaseless(names.map((n) => canonicalIndustry(n) || '').filter(Boolean));
}

function locationOf(profile: Record<string, any> | null): string | undefined {
  const p = profile?.personal;
  const city = typeof p?.city === 'string' ? p.city.trim() : '';
  const state = typeof p?.state === 'string' ? p.state.trim() : '';
  const loc = [city, state].filter(Boolean).join(', ');
  return loc || undefined;
}

export function toSearchCandidate(record: CandidateRecord, analysis?: AnalysisRecord | null, overrides: SearchOverrides = {}): SearchCandidate {
  const profile = record.structuredProfile && typeof record.structuredProfile === 'object' ? record.structuredProfile : null;
  const work = Array.isArray(profile?.workHistory) ? (profile!.workHistory as Array<Record<string, unknown>>) : [];
  const previousCompanies = uniqueCaseless(work.map((w) => (typeof w?.companyName === 'string' ? w.companyName.trim() : '')).filter(Boolean));

  const chosenTitles = asStrings(overrides.titles);
  const titles = chosenTitles.length
    ? uniqueCaseless(chosenTitles).slice(0, 4)
    : uniqueCaseless([record.primaryTitle, ...primaryRoles(analysis).slice(0, 2)].filter(Boolean)).slice(0, 3);

  let industries: string[] = [];
  let industrySource: SearchCandidate['industrySource'] = 'none';
  const choice = String(overrides.industry || 'auto').trim();
  if (/^none$/i.test(choice)) {
    industrySource = 'none';
  } else if (choice && !/^auto$/i.test(choice)) {
    const named = canonicalIndustry(choice);
    if (named) {
      industries = [named];
      industrySource = 'chosen';
    }
  }
  if (!industries.length && !/^none$/i.test(choice)) {
    industries = analysisIndustries(analysis).slice(0, 2);
    if (industries.length) industrySource = 'resume analysis';
    else {
      industries = industriesFromResume(record.rawResumeText || '', previousCompanies);
      industrySource = industries.length ? 'resume' : 'none';
    }
  }

  const clearance = record.securityClearance && record.securityClearance !== 'None' ? record.securityClearance : undefined;
  const workPreference = (['Remote', 'Hybrid', 'On-Site'] as const).find((w) => w === record.workPreference);

  return {
    candidate: {
      name: record.fullName,
      titles,
      skills: asStrings(record.keySkills),
      visa: record.visaStatus || 'Other',
      workPreference,
      location: locationOf(profile),
      clearance,
      c2cOnly: overrides.c2cOnly ?? true,
      yearsExperience: record.yearsOfExperience > 0 ? record.yearsOfExperience : undefined,
      industries,
      previousCompanies,
    },
    industrySource,
  };
}
