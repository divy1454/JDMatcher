'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { apiRequest } from '@/lib/api';
import {
  AlertCircle,
  Ban,
  BookmarkCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Check,
  Download,
  EyeOff,
  ExternalLink,
  Globe,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserCheck,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types returned by POST /jobs/find and GET /jobs/finder-config
// ---------------------------------------------------------------------------

type Status = 'ready' | 'check' | 'blocked';
type PostedWithin = 1 | 3 | 7 | 30;

interface JobMatch {
  score: number;
  level: 'strong' | 'good' | 'possible';
  status: Status;
  blockers: string[];
  warnings: string[];
  reasons: string[];
  summary: string;
  employment: string;
  employmentLabel: string;
  industry: { name: string | null; matchesCandidate: boolean; evidence: string[] };
  previousClient: boolean;
  mustHave: Array<{ skill: string; found: boolean }>;
  matchedSkills: string[];
  missingSkills: string[];
  read: boolean;
}

interface FoundJob {
  id: string;
  source: string;
  publisher: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean | null;
  postedAt: string | null;
  /** 'day' when the site only gives a date (Workday). */
  postedPrecision?: 'exact' | 'day';
  employmentType: string | null;
  url: string;
  applyOptions: Array<{ publisher: string; url: string }>;
  description: string;
  match: JobMatch;
  signals: { rate: string | null; durationMonths: number | null; workMode: string; evidence: string[] };
}

interface HiddenJob {
  title: string;
  company: string;
  kind: 'citizenship' | 'clearance' | 'off_target' | 'missing_skills' | 'not_verified';
  reason: string;
  url: string;
}

interface SourceSummary {
  source: string;
  label: string;
  found: number;
  requests: number;
  error?: string;
}

interface FindResponse {
  success: boolean;
  candidateId: string;
  industrySource: 'chosen' | 'resume analysis' | 'resume' | 'none';
  rejectedCareerSites: string[];
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
  options: {
    postedWithinDays: PostedWithin;
    excludeCitizenship: boolean;
    excludeClearance: boolean;
    industryFirst: boolean;
    contractOnly: boolean;
    remoteOnly: boolean;
    hideBlocked: boolean;
    sortBy: 'newest' | 'best';
  };
  portals: { jsearch: boolean; adzuna: boolean };
  careerSites: number;
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
  hidden: HiddenJob[];
  total: number;
  jobs: FoundJob[];
  tookMs: number;
}

interface FinderConfig {
  portals: { jsearch: boolean; adzuna: boolean };
  defaultSites: Array<{ name: string; ats: string; url: string; industry: string | null }>;
  industries: string[];
}

interface CandidateItem {
  id: string;
  fullName: string;
  primaryTitle: string;
  yearsOfExperience?: number;
  workPreference?: string;
  keySkills?: string[];
  visaStatus?: string;
}

interface Prefs {
  candidateId?: string;
  postedWithinDays: PostedWithin;
  excludeCitizenship: boolean;
  excludeClearance: boolean;
  industryFirst: boolean;
  contractOnly: boolean;
  remoteOnly: boolean;
  hideBlocked: boolean;
  c2cOnly: boolean;
  sortBy: 'newest' | 'best';
  industry: string;
  careerSites: string;
  includeDefaultSites: boolean;
}

const PREFS_KEY = 'jdmatcher_job_finder_prefs_v1';

const DEFAULT_PREFS: Prefs = {
  postedWithinDays: 1,
  excludeCitizenship: true,
  excludeClearance: true,
  industryFirst: true,
  contractOnly: false,
  remoteOnly: false,
  hideBlocked: false,
  c2cOnly: true,
  sortBy: 'newest',
  industry: 'auto',
  careerSites: '',
  includeDefaultSites: true,
};

const WINDOWS: Array<{ days: PostedWithin; label: string }> = [
  { days: 1, label: 'Last 24 hours' },
  { days: 3, label: 'Last 3 days' },
  { days: 7, label: 'Last week' },
  { days: 30, label: 'Last month' },
];

const windowLabel = (days: number) => WINDOWS.find((w) => w.days === days)?.label.toLowerCase() || `last ${days} days`;

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const saved = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // private window or storage blocked: preferences just aren't remembered
  }
}

function ageLabel(postedAt: string | null, precision: 'exact' | 'day' = 'exact'): string {
  if (!postedAt) return 'date unknown';
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(postedAt)) / 60000));
  if (precision === 'day') {
    // The site only gives the date (Workday), not the time
    const days = mins / 1440;
    return days < 0.75 ? 'posted today' : days < 1.75 ? 'posted yesterday' : `posted ${Math.round(days)} days ago`;
  }
  if (mins < 60) return mins <= 1 ? 'just posted' : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

const STATUS_STYLE: Record<Status, { label: string; pill: string; border: string }> = {
  ready: {
    label: 'Ready to submit',
    pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    border: 'border-l-emerald-500',
  },
  check: {
    label: 'Check first',
    pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
    border: 'border-l-amber-500',
  },
  blocked: {
    label: "Can't submit",
    pill: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
    border: 'border-l-rose-500',
  },
};

const HIDDEN_LABEL: Record<HiddenJob['kind'], string> = {
  citizenship: 'Citizenship',
  clearance: 'Clearance',
  off_target: 'Different role',
  missing_skills: 'Skills not asked for',
  not_verified: "Couldn't verify",
};

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none" title={hint}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
      />
      <span className="text-xs leading-snug">
        <span className="font-semibold text-slate-800 dark:text-slate-200">{label}</span>
        {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export default function JobHunterPage() {
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [titlesInput, setTitlesInput] = useState('');
  const [config, setConfig] = useState<FinderConfig | null>(null);
  const [showSites, setShowSites] = useState(false);

  const [result, setResult] = useState<FindResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [aiChecks, setAiChecks] = useState<Record<string, { score: number; verdict: string; reasoning: string }>>({});
  const [aiCheckingId, setAiCheckingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const selected = candidates.find((c) => c.id === prefs.candidateId) || null;
  const update = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));

  const showNotice = (message: string, type: 'success' | 'error' = 'success') => {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 4000);
  };

  // Load saved filters, candidates and what the finder searches; never search automatically
  useEffect(() => {
    const saved = loadPrefs();
    (async () => {
      let list: CandidateItem[] = [];
      try {
        const raw = await apiRequest<any>('/candidates');
        list = Array.isArray(raw) ? raw : Array.isArray(raw?.candidates) ? raw.candidates : [];
      } catch (err) {
        console.error('Failed to load bench candidates:', err);
      }
      setCandidates(list);
      setCandidatesLoaded(true);
      const candidateId = list.some((c) => c.id === saved.candidateId) ? saved.candidateId : list[0]?.id;
      setPrefs({ ...saved, candidateId });
      setPrefsLoaded(true);
    })();
    apiRequest<FinderConfig>('/jobs/finder-config')
      .then(setConfig)
      .catch((err) => console.warn('Could not load job finder settings:', err));
  }, []);

  useEffect(() => {
    if (prefsLoaded) savePrefs(prefs);
  }, [prefs, prefsLoaded]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const handleSelectCandidate = (id: string) => {
    update({ candidateId: id });
    setTitlesInput('');
    setResult(null);
    setError(null);
  };

  const careerSiteLinks = useMemo(
    () => prefs.careerSites.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 60),
    [prefs.careerSites]
  );

  const handleSearch = async () => {
    if (!prefs.candidateId) return;
    setIsLoading(true);
    setError(null);
    setElapsed(0);
    const started = Date.now();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    const titles = titlesInput.split(',').map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 4);
    try {
      const res = await apiRequest<FindResponse>('/jobs/find', {
        method: 'POST',
        body: JSON.stringify({
          candidateId: prefs.candidateId,
          postedWithinDays: prefs.postedWithinDays,
          excludeCitizenship: prefs.excludeCitizenship,
          excludeClearance: prefs.excludeClearance,
          industryFirst: prefs.industryFirst,
          contractOnly: prefs.contractOnly,
          remoteOnly: prefs.remoteOnly,
          hideBlocked: prefs.hideBlocked,
          c2cOnly: prefs.c2cOnly,
          sortBy: prefs.sortBy,
          industry: prefs.industry,
          titles: titles.length ? titles : undefined,
          careerSites: careerSiteLinks,
          includeDefaultSites: prefs.includeDefaultSites,
        }),
      });
      setResult(res);
      setExpanded(new Set());
      setShowHidden(false);
    } catch (err: any) {
      console.error('Job search failed:', err);
      setError(err?.message || 'Job search failed');
    } finally {
      if (timer.current) clearInterval(timer.current);
      setIsLoading(false);
    }
  };

  const visibleJobs = useMemo(() => {
    const jobs = result?.jobs || [];
    const q = filterText.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      `${j.title} ${j.company} ${j.location} ${j.match.matchedSkills.join(' ')} ${j.match.industry.name || ''}`.toLowerCase().includes(q)
    );
  }, [result, filterText]);

  // Same order as the server: candidate's industry first, then others, can't-submit last
  const groups = useMemo(() => {
    if (!result) return [];
    const open = visibleJobs.filter((j) => j.match.status !== 'blocked');
    const blocked = visibleJobs.filter((j) => j.match.status === 'blocked');
    const industries = result.candidate.industries;
    const out: Array<{ key: string; title: string; hint?: string; jobs: FoundJob[] }> = [];
    if (result.options.industryFirst && industries.length) {
      const same = open.filter((j) => j.match.industry.matchesCandidate);
      const other = open.filter((j) => !j.match.industry.matchesCandidate);
      out.push({ key: 'industry', title: `${industries.join(' / ')} jobs`, hint: "Candidate's industry, newest first", jobs: same });
      out.push({ key: 'other', title: 'Other industries', hint: 'Newest first', jobs: other });
    } else {
      out.push({ key: 'all', title: 'Matching jobs', hint: result.options.sortBy === 'best' ? 'Best match first' : 'Newest first', jobs: open });
    }
    out.push({ key: 'blocked', title: "Can't submit this candidate", hint: 'Shown so nothing disappears silently. Reasons on each job.', jobs: blocked });
    return out.filter((g) => g.jobs.length);
  }, [result, visibleJobs]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = async (job: FoundJob) => {
    if (!prefs.candidateId) return;
    setSavingId(job.id);
    try {
      const m = job.match;
      await apiRequest('/jobs/save-matched', {
        method: 'POST',
        body: JSON.stringify({
          candidateId: prefs.candidateId,
          jobTitle: job.title.slice(0, 255),
          companyOrClient: (job.company || 'Direct Client').slice(0, 255),
          jobUrl: job.url,
          rawJdText: (job.description || `${job.title} at ${job.company} (${job.location})`).slice(0, 30000),
          verdict: m.status === 'ready' ? 'APPLY' : m.status === 'blocked' ? 'SKIP' : 'PENDING',
          matchScore: Math.max(0, Math.min(100, Math.round(m.score))),
          matchReasoning: [m.summary, ...m.reasons, ...m.blockers.map((b) => `Can't submit: ${b}`), ...m.warnings.map((w) => `Check: ${w}`)]
            .join('\n')
            .slice(0, 5000),
        }),
      });
      setSavedIds((prev) => new Set([...prev, job.id]));
      showNotice(`"${job.title}" saved to Matched JDs`);
    } catch (err: any) {
      showNotice(err?.message || 'Failed to save job', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleAiCheck = async (job: FoundJob) => {
    if (!prefs.candidateId) return;
    if (!job.description || job.description.length < 200) {
      showNotice('The full posting was not available for this job. Open it and use AI match there.', 'error');
      return;
    }
    setAiCheckingId(job.id);
    try {
      const res = await apiRequest<any>('/analyze/eval', {
        method: 'POST',
        body: JSON.stringify({
          candidateId: prefs.candidateId,
          jdText: job.description,
          jobTitle: job.title,
          jobUrl: job.url,
          companyOrClient: job.company,
        }),
      });
      const r = res?.result || {};
      setAiChecks((prev) => ({ ...prev, [job.id]: { score: Number(r.matchScore) || 0, verdict: String(r.verdict || ''), reasoning: String(r.reasoning || '') } }));
      showNotice(`AI match: ${r.matchScore}% (${r.verdict})`);
    } catch (err: any) {
      showNotice(err?.message || 'AI match failed', 'error');
    } finally {
      setAiCheckingId(null);
    }
  };

  const handleCopy = (job: FoundJob) => {
    if (!job.description) return;
    navigator.clipboard.writeText(job.description).catch(() => undefined);
    setCopiedId(job.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleExport = () => {
    if (!result || !result.jobs.length) return;
    const rows = result.jobs.map((j) => ({
      Status: STATUS_STYLE[j.match.status].label,
      Score: j.match.score,
      Title: j.title,
      Company: j.company,
      Location: j.location,
      Posted: j.postedAt ? new Date(j.postedAt).toLocaleString() : '',
      Industry: j.match.industry.name || '',
      Type: j.match.employmentLabel,
      'Has skills': j.match.matchedSkills.join(', '),
      "Can't submit because": j.match.blockers.join('; '),
      'Check before submitting': j.match.warnings.join('; '),
      Link: j.url,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Jobs');
    const name = (result.candidate.name || 'candidate').replace(/[^a-z0-9]+/gi, '_');
    XLSX.writeFile(book, `Jobs_${name}_${windowLabel(result.options.postedWithinDays).replace(/\s+/g, '_')}.xlsx`);
  };

  const removed = result?.removed;
  const hiddenTotal = removed ? removed.citizenship + removed.clearance + removed.offTarget + removed.missingSkills + removed.notVerified + removed.otherFilters : 0;
  const sourceErrors = (result?.sources || []).filter((s) => s.error);
  const careerSitesCount = (prefs.includeDefaultSites ? config?.defaultSites.length || 0 : 0) + careerSiteLinks.length;

  return (
    <div className="space-y-6">
      {notice && (
        <div
          role="status"
          className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold border ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-500/30'
              : 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-500/30'
          }`}
        >
          {notice.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {notice.message}
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950/70 to-slate-900 p-6 md:p-8 border border-emerald-500/20 shadow-xl">
        <div className="absolute -right-12 -bottom-12 opacity-10 pointer-events-none">
          <Compass className="h-64 w-64 text-emerald-400" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                <Clock className="h-3.5 w-3.5" />
                Newest first · last 24 hours by default
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                <Globe className="h-3 w-3" />
                {careerSitesCount} career sites
                {config ? ` · job portals ${config.portals.jsearch || config.portals.adzuna ? 'on' : 'off'}` : ''}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Job Hunter</h1>
            <p className="text-sm text-slate-300">
              Finds the newest jobs for one bench candidate and reads every posting: the title, the skills the job description asks for,
              the industry and the company. Jobs that ask for US citizenship or a security clearance are hidden unless the candidate qualifies.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={!result || result.jobs.length === 0}
            className="self-start md:self-center flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-lg shadow-emerald-600/20 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Export to Excel
          </button>
        </div>
      </div>

      {/* Search panel */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-emerald-500/30 p-5 shadow-md space-y-5">
        {candidatesLoaded && candidates.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">No bench candidates yet. Add one to search jobs for them.</p>
            <Link
              href="/recruiter-portal/candidates"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30"
            >
              + Add bench candidate <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex-1 space-y-1.5">
                <label htmlFor="jf-candidate" className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-500" /> Candidate
                </label>
                <select
                  id="jf-candidate"
                  value={prefs.candidateId || ''}
                  onChange={(e) => handleSelectCandidate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500"
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} — {c.primaryTitle}
                      {c.visaStatus ? ` · ${c.visaStatus}` : ''}
                      {c.workPreference ? ` · ${c.workPreference}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1.5">
                <label htmlFor="jf-titles" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Titles to search <span className="normal-case font-normal text-slate-500">(optional, comma-separated)</span>
                </label>
                <input
                  id="jf-titles"
                  value={titlesInput}
                  onChange={(e) => setTitlesInput(e.target.value)}
                  placeholder={result?.candidate.titles.join(', ') || selected?.primaryTitle || 'From the candidate profile'}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="lg:w-56 space-y-1.5">
                <label htmlFor="jf-industry" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Industry first
                </label>
                <select
                  id="jf-industry"
                  value={prefs.industry}
                  onChange={(e) => update({ industry: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="auto">From resume (automatic)</option>
                  <option value="none">No industry</option>
                  {(config?.industries || []).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Posted within */}
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5 text-emerald-500" /> Posted within
              </span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Posted within">
                {WINDOWS.map((w) => (
                  <button
                    key={w.days}
                    type="button"
                    role="radio"
                    aria-checked={prefs.postedWithinDays === w.days}
                    onClick={() => update({ postedWithinDays: w.days })}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                      prefs.postedWithinDays === w.days
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                        : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-emerald-500'
                    }`}
                  >
                    {w.label}
                    {w.days === 1 ? ' (default)' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-4">
              <Toggle
                checked={prefs.excludeCitizenship}
                onChange={(v) => update({ excludeCitizenship: v })}
                label="Hide jobs asking for US citizenship / green card"
                hint="Unless the candidate qualifies"
              />
              <Toggle
                checked={prefs.excludeClearance}
                onChange={(v) => update({ excludeClearance: v })}
                label="Hide jobs asking for a security clearance"
                hint="Unless the candidate holds that level"
              />
              <Toggle checked={prefs.industryFirst} onChange={(v) => update({ industryFirst: v })} label="Candidate's industry first" hint="Then other industries" />
              <Toggle
                checked={prefs.c2cOnly}
                onChange={(v) => update({ c2cOnly: v })}
                label="Candidate is on C2C"
                hint="W2-only jobs marked can't-submit"
              />
              <Toggle checked={prefs.contractOnly} onChange={(v) => update({ contractOnly: v })} label="Contract roles only" />
              <Toggle checked={prefs.remoteOnly} onChange={(v) => update({ remoteOnly: v })} label="Remote only" />
              <Toggle checked={prefs.hideBlocked} onChange={(v) => update({ hideBlocked: v })} label="Hide can't-submit jobs" hint="Otherwise listed last" />
              <div className="flex items-center gap-2 text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
                <label htmlFor="jf-sort" className="font-semibold text-slate-800 dark:text-slate-200">
                  Sort
                </label>
                <select
                  id="jf-sort"
                  value={prefs.sortBy}
                  onChange={(e) => update({ sortBy: e.target.value === 'best' ? 'best' : 'newest' })}
                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                >
                  <option value="newest">Newest first</option>
                  <option value="best">Best match first</option>
                </select>
              </div>
            </div>

            {/* Career sites */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSites((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-300"
                aria-expanded={showSites}
              >
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-emerald-500" />
                  Career sites searched: {careerSitesCount}
                  {careerSiteLinks.length ? ` (${careerSiteLinks.length} of yours)` : ''}
                </span>
                {showSites ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {showSites && (
                <div className="px-4 pb-4 space-y-3">
                  <label className="block text-xs text-slate-600 dark:text-slate-400" htmlFor="jf-sites">
                    Your end clients&apos; career pages, one per line (Greenhouse, Lever, Ashby, SmartRecruiters or Workday links), e.g.
                    https://jobs.lever.co/company or https://company.wd5.myworkdayjobs.com/External
                  </label>
                  <textarea
                    id="jf-sites"
                    rows={4}
                    value={prefs.careerSites}
                    onChange={(e) => update({ careerSites: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500"
                    placeholder={'https://job-boards.greenhouse.io/stripe\nhttps://jobs.lever.co/palantir'}
                  />
                  <Toggle
                    checked={prefs.includeDefaultSites}
                    onChange={(v) => update({ includeDefaultSites: v })}
                    label={`Also search the default list (${config?.defaultSites.length ?? 0} companies)`}
                  />
                  {config && prefs.includeDefaultSites && (
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {config.defaultSites.map((s) => s.name).join(', ')}
                    </p>
                  )}
                  {result && result.rejectedCareerSites.length > 0 && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400">
                      Not a supported career page (skipped): {result.rejectedCareerSites.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSearch}
                disabled={isLoading || !prefs.candidateId}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
              >
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {isLoading ? `Searching… ${elapsed}s` : `Find jobs for ${selected?.fullName || 'candidate'}`}
              </button>
              {config && !config.portals.jsearch && !config.portals.adzuna && (
                <span className="text-[11px] text-slate-500 max-w-md">
                  Job portals (LinkedIn, Indeed, Dice via JSearch) are off until a JSEARCH_API_KEY is set on the server. Career sites work without keys.
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Reading career sites and job postings…</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The first search takes 10–20 seconds. Changing filters or searching again within 10 minutes is much faster.
          </p>
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-500/30 p-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-800 dark:text-rose-200">
            <p className="font-bold">The search didn&apos;t finish</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {!isLoading && result && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {result.total} {result.total === 1 ? 'job' : 'jobs'} for {result.candidate.name} · {windowLabel(result.options.postedWithinDays)}
                </h2>
                <p className="text-xs text-slate-500">
                  Searched for {result.candidate.titles.join(', ')}
                  {result.candidate.mustHave.length ? ` · the job must ask for ${result.candidate.mustHave.join(' / ')}` : ''}
                  {result.candidate.industries.length
                    ? ` · industry first: ${result.candidate.industries.join(', ')} (${result.industrySource})`
                    : ' · no industry ordering'}
                  {` · ${(result.tookMs / 1000).toFixed(1)}s`}
                </p>
              </div>
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter these results…"
                aria-label="Filter results"
                className="md:w-64 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700"
              />
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              {result.sources.map((s) => (
                <span
                  key={s.source}
                  title={s.error || 'Postings read for this search (career sites that list jobs without details: only recent ones with a matching title are opened)'}
                  className={`px-2 py-0.5 rounded-md border ${
                    s.error ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {s.label}: {s.found} read{s.error ? ' · some failed' : ''}
                </span>
              ))}
              {!result.portals.jsearch && !result.portals.adzuna && (
                <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500">Job portals: off (no API key)</span>
              )}
            </div>

            {removed && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1 font-semibold">
                  <EyeOff className="h-3.5 w-3.5" /> Not shown:
                </span>
                {removed.citizenship > 0 && <span>{removed.citizenship} asked for US citizenship / green card</span>}
                {removed.clearance > 0 && <span>{removed.clearance} asked for a clearance</span>}
                {removed.offTarget > 0 && <span>{removed.offTarget} different roles</span>}
                {removed.missingSkills > 0 && <span>{removed.missingSkills} didn&apos;t ask for the candidate&apos;s skills</span>}
                {removed.notVerified > 0 && <span>{removed.notVerified} couldn&apos;t be verified</span>}
                {removed.otherFilters > 0 && <span>{removed.otherFilters} by contract / remote filters</span>}
                {removed.blocked > 0 && <span>{removed.blocked} can&apos;t-submit</span>}
                {removed.tooOld > 0 && <span>{removed.tooOld.toLocaleString()} older than {windowLabel(result.options.postedWithinDays).replace('last ', '')}</span>}
                {removed.outsideUs > 0 && <span>{removed.outsideUs} outside the US</span>}
                {result.hidden.length > 0 && (
                  <button type="button" onClick={() => setShowHidden((v) => !v)} className="font-semibold text-emerald-700 dark:text-emerald-400 underline">
                    {showHidden ? 'Hide the list' : `See why (${hiddenTotal})`}
                  </button>
                )}
              </div>
            )}

            {showHidden && (
              <ul className="max-h-80 overflow-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                {result.hidden.map((h, i) => (
                  <li key={`${h.url}-${i}`} className="px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-md font-semibold ${
                        h.kind === 'citizenship' || h.kind === 'clearance'
                          ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {HIDDEN_LABEL[h.kind]}
                    </span>
                    <a href={h.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-800 dark:text-slate-200 hover:text-emerald-600 truncate">
                      {h.title} · {h.company}
                    </a>
                    <span className="text-slate-500 sm:ml-auto sm:text-right">{h.reason}</span>
                  </li>
                ))}
              </ul>
            )}

            {sourceErrors.length > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Some sites didn&apos;t answer: {sourceErrors.map((s) => s.error).join('; ').slice(0, 400)}
              </p>
            )}
          </div>

          {result.total === 0 && (
            <div className="p-10 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <AlertCircle className="h-9 w-9 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">No matching jobs {windowLabel(result.options.postedWithinDays)}</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Try a longer window (last 3 days or last week), add your end clients&apos; career pages, or set a JSearch key on the server for job portal results.
              </p>
            </div>
          )}

          {groups.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {group.title} <span className="text-slate-400 font-semibold">({group.jobs.length})</span>
                </h3>
                {group.hint && <span className="text-[11px] text-slate-500">{group.hint}</span>}
              </div>
              <div className="space-y-3">
                {group.jobs.map((job) => {
                  const m = job.match;
                  const style = STATUS_STYLE[m.status];
                  const isOpen = expanded.has(job.id);
                  const ai = aiChecks[job.id];
                  return (
                    <article
                      key={job.id}
                      className={`rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 ${style.border} p-4 md:p-5 shadow-sm`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${style.pill}`}>{style.label}</span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {m.score}% · {m.level === 'strong' ? 'Strong' : m.level === 'good' ? 'Good' : 'Possible'} match
                            </span>
                            {m.industry.name && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  m.industry.matchesCandidate
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                                title={m.industry.evidence.join(' · ')}
                              >
                                {m.industry.name}
                                {m.industry.matchesCandidate ? ' ✓' : ''}
                              </span>
                            )}
                            {m.previousClient && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/10 text-violet-700 dark:text-violet-300">
                                <Star className="h-3 w-3" /> Past client
                              </span>
                            )}
                          </div>
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-base font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 leading-snug break-words"
                          >
                            {job.title}
                          </a>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" /> {job.company}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" /> {job.location || 'Location not stated'}
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                              <Clock className="h-3.5 w-3.5" /> {ageLabel(job.postedAt, job.postedPrecision)}
                            </span>
                            <span>{m.employmentLabel}</span>
                            {job.signals.rate && <span>{job.signals.rate}</span>}
                            {job.signals.durationMonths && <span>{job.signals.durationMonths} months</span>}
                            <span className="text-slate-400">via {job.publisher}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap md:flex-col md:items-end gap-2 shrink-0">
                          <button
                            onClick={() => handleSave(job)}
                            disabled={savedIds.has(job.id) || savingId === job.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
                          >
                            <BookmarkCheck className="h-3.5 w-3.5" />
                            {savedIds.has(job.id) ? 'Saved' : savingId === job.id ? 'Saving…' : 'Save to Matched JDs'}
                          </button>
                          <button
                            onClick={() => handleAiCheck(job)}
                            disabled={aiCheckingId === job.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-60"
                            title="Uses AI credits"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                            {aiCheckingId === job.id ? 'Checking…' : 'AI match'}
                          </button>
                        </div>
                      </div>

                      {m.blockers.length > 0 && (
                        <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                          <Ban className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Can&apos;t submit: {m.blockers.join(' · ')}
                        </p>
                      )}
                      {m.warnings.length > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                          <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Check: {m.warnings.join(' · ')}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {m.mustHave.map((s) => (
                          <span
                            key={s.skill}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                              s.found ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 line-through'
                            }`}
                            title={s.found ? 'The posting asks for this' : 'Not in the posting'}
                          >
                            {s.skill}
                          </span>
                        ))}
                        {m.matchedSkills
                          .filter((s) => !m.mustHave.some((x) => x.skill.toLowerCase() === s.toLowerCase()))
                          .slice(0, 6)
                          .map((s) => (
                            <span key={s} className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {s}
                            </span>
                          ))}
                      </div>

                      {ai && (
                        <p className="mt-3 text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-bold">AI match {ai.score}% ({ai.verdict}):</span> {ai.reasoning.slice(0, 400)}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                        {job.applyOptions.slice(0, 4).map((o) => (
                          <a
                            key={o.url}
                            href={o.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                          >
                            Apply on {o.publisher} <ExternalLink className="h-3 w-3" />
                          </a>
                        ))}
                        {job.description && (
                          <>
                            <button type="button" onClick={() => toggleExpanded(job.id)} className="font-semibold text-slate-600 dark:text-slate-400 hover:underline">
                              {isOpen ? 'Hide posting' : 'Read posting'}
                            </button>
                            <button type="button" onClick={() => handleCopy(job)} className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:underline">
                              {copiedId === job.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              {copiedId === job.id ? 'Copied' : 'Copy JD'}
                            </button>
                          </>
                        )}
                      </div>
                      {isOpen && (
                        <div className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-700 dark:text-slate-300">
                          {job.description}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {!isLoading && !result && !error && candidates.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
          <Compass className="h-8 w-8 text-emerald-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Ready when you are</h3>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            Pick a candidate and press Find jobs. Results are newest first, from the {windowLabel(prefs.postedWithinDays)}, with the candidate&apos;s
            industry first. Every job shows why it fits, and anything that stops a submission.
          </p>
        </div>
      )}
    </div>
  );
}
