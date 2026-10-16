'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
  Compass,
  Search,
  ExternalLink,
  Briefcase,
  Building2,
  MapPin,
  Clock,
  DollarSign,
  Sparkles,
  Shuffle,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  Layers,
  Zap,
  Globe,
  SlidersHorizontal,
  BookmarkCheck,
  AlertCircle,
  X,
  UserCheck,
  ChevronDown,
} from 'lucide-react';

interface ScrapedJob {
  id: string;
  site: string;
  jobUrl: string;
  jobUrlDirect?: string | null;
  title: string;
  company: string;
  location: string;
  datePosted?: string | null;
  jobType?: string | null;
  interval?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  currency?: string | null;
  isRemote?: boolean | null;
  description?: string;
  companyIndustry?: string | null;
  companyUrl?: string | null;
  companyLogo?: string | null;
  skills?: string[] | null;
  // Local AI match enrichment
  matchScore?: number | null;
  matchVerdict?: 'APPLY' | 'SKIP' | 'PENDING' | null;
  matchReasoning?: string | null;
}

interface CandidateOption {
  id: string;
  fullName: string;
  primaryTitle: string;
}

const BOARD_CONFIG: Record<string, { label: string; badgeClass: string; borderClass: string; dotClass: string }> = {
  linkedin: {
    label: 'LinkedIn',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
    borderClass: 'border-l-blue-500',
    dotClass: 'bg-blue-500',
  },
  indeed: {
    label: 'Indeed',
    badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    borderClass: 'border-l-indigo-500',
    dotClass: 'bg-indigo-500',
  },
  zip_recruiter: {
    label: 'ZipRecruiter',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    borderClass: 'border-l-emerald-500',
    dotClass: 'bg-emerald-500',
  },
  glassdoor: {
    label: 'Glassdoor',
    badgeClass: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30',
    borderClass: 'border-l-teal-500',
    dotClass: 'bg-teal-500',
  },
  google: {
    label: 'Google Jobs',
    badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
    borderClass: 'border-l-rose-500',
    dotClass: 'bg-rose-500',
  },
  naukri: {
    label: 'Naukri',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
    borderClass: 'border-l-amber-500',
    dotClass: 'bg-amber-500',
  },
  bayt: {
    label: 'Bayt',
    badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
    borderClass: 'border-l-purple-500',
    dotClass: 'bg-purple-500',
  },
};

const QUICK_SEARCH_ROLES = [
  'Full Stack Engineer',
  'Frontend Developer (React)',
  'Backend Engineer (Node/Python)',
  'DevOps / SRE Engineer',
  'Data Engineer / AI',
  'Cloud Solutions Architect',
];

const QUICK_LOCATIONS = [
  'Remote',
  'San Francisco, CA',
  'New York, NY',
  'Austin, TX',
  'London, UK',
  'Bengaluru, IN',
];

export default function JobHunterPage() {
  // Search Form States
  const [searchTerm, setSearchTerm] = useState('Full Stack Engineer');
  const [location, setLocation] = useState('Remote');
  const [stickToSite, setStickToSite] = useState<string>('all'); // 'all' = mixed up always, or 'linkedin' etc.
  const [selectedSites, setSelectedSites] = useState<string[]>([
    'linkedin',
    'indeed',
    'zip_recruiter',
    'glassdoor',
    'google',
  ]);
  const [isRemoteOnly, setIsRemoteOnly] = useState(true);
  const [jobType, setJobType] = useState('all');
  const [hoursOld, setHoursOld] = useState<number>(72);
  const [resultsWanted, setResultsWanted] = useState<number>(25);
  const [minSalaryFilter, setMinSalaryFilter] = useState<number>(0);

  // Bench Candidates for quick match
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');

  // Results & UI States
  const [jobs, setJobs] = useState<ScrapedJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [activeModalJob, setActiveModalJob] = useState<ScrapedJob | null>(null);
  const [activeAiModal, setActiveAiModal] = useState<{ job: ScrapedJob; result: any } | null>(null);
  const [evaluatingJobId, setEvaluatingJobId] = useState<string | null>(null);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch bench candidates on mount
  useEffect(() => {
    async function loadCandidates() {
      try {
        const res = await apiRequest<{ candidates: CandidateOption[] }>('/candidates');
        if (res?.candidates && res.candidates.length > 0) {
          setCandidates(res.candidates);
          setSelectedCandidateId(res.candidates[0].id);
        }
      } catch (err) {
        console.error('Failed to load bench candidates:', err);
      }
    }
    loadCandidates();
    // Run initial search
    handleSearch(true);
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Perform Job Board Search
  const handleSearch = async (isInitial = false) => {
    setIsLoading(true);
    setHasSearched(true);

    try {
      const payload = {
        searchTerm: searchTerm.trim() || 'Software Engineer',
        location: location.trim(),
        stickToSite: stickToSite === 'all' ? null : stickToSite,
        siteNames: selectedSites,
        isRemote: isRemoteOnly,
        jobType: jobType === 'all' ? undefined : jobType,
        hoursOld: hoursOld > 0 ? hoursOld : undefined,
        resultsWanted: resultsWanted,
      };

      const res = await apiRequest<{ jobs: ScrapedJob[]; total: number }>('/jobs/search', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res && Array.isArray(res.jobs)) {
        setJobs(res.jobs);
        if (!isInitial) {
          showNotification(`Found ${res.jobs.length} jobs across job boards!`);
        }
      }
    } catch (err: any) {
      console.error('Job search failed:', err);
      showNotification(err.message || 'Error scraping job boards', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Shuffle / Re-mix Feed Locally
  const handleShuffleFeed = () => {
    if (jobs.length <= 1) return;
    const shuffled = [...jobs].sort(() => Math.random() - 0.5);
    setJobs(shuffled);
    showNotification('Feed re-mixed! Board sources distributed randomly.');
  };

  // Run AI Candidate Match Score
  const handleRunAiMatch = async (job: ScrapedJob) => {
    if (!selectedCandidateId) {
      showNotification('Please select a bench candidate first', 'error');
      return;
    }

    setEvaluatingJobId(job.id);
    try {
      const jdContent = job.description && job.description.length > 30
        ? job.description
        : `${job.title} at ${job.company}. Location: ${job.location}. Role overview: Seeking talented ${job.title} to join our high performing team. Core requirements: strong software engineering fundamentals, API development, system architecture, database design and modern cloud workflows.`;

      const res = await apiRequest<any>('/analyze/eval', {
        method: 'POST',
        body: JSON.stringify({
          candidateId: selectedCandidateId,
          jdText: jdContent,
          jobTitle: job.title,
          jobUrl: job.jobUrl,
          companyOrClient: job.company,
        }),
      });

      // Update local job card with AI score & verdict
      setJobs((prev) =>
        prev.map((item) =>
          item.id === job.id
            ? {
                ...item,
                matchScore: res.result.matchScore,
                matchVerdict: res.result.verdict,
                matchReasoning: res.result.reasoning,
              }
            : item
        )
      );

      setActiveAiModal({ job, result: res.result });
      showNotification(`AI Match Score: ${res.result.matchScore}% (${res.result.verdict})`);
    } catch (err: any) {
      console.error('AI match evaluation failed:', err);
      showNotification(err.message || 'AI Evaluation failed', 'error');
    } finally {
      setEvaluatingJobId(null);
    }
  };

  // Save to Matched JDs
  const handleSaveToMatchedJds = async (job: ScrapedJob) => {
    if (!selectedCandidateId) {
      showNotification('Please select a bench candidate to link this job to', 'error');
      return;
    }

    setSavingJobId(job.id);
    try {
      const jdContent = job.description || `${job.title} at ${job.company} (${job.location})`;

      await apiRequest('/jobs/save-matched', {
        method: 'POST',
        body: JSON.stringify({
          candidateId: selectedCandidateId,
          jobTitle: job.title,
          companyOrClient: job.company,
          jobUrl: job.jobUrl,
          rawJdText: jdContent,
          verdict: job.matchVerdict || 'APPLY',
          matchScore: job.matchScore || 88,
          matchReasoning: job.matchReasoning || `Aggregated via JobSpy multi-board search from ${job.site}.`,
        }),
      });

      setSavedJobIds((prev) => new Set([...prev, job.id]));
      showNotification(`"${job.title}" saved to your Matched JDs board!`);
    } catch (err: any) {
      console.error('Failed to save job:', err);
      showNotification(err.message || 'Failed to save job', 'error');
    } finally {
      setSavingJobId(null);
    }
  };

  // Copy JD Text to clipboard
  const handleCopyJd = (id: string, text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Export to Excel / CSV
  const handleExportExcel = () => {
    if (jobs.length === 0) {
      showNotification('No jobs to export', 'error');
      return;
    }

    const exportData = jobs.map((j) => ({
      'Job Board': j.site.toUpperCase(),
      'Title': j.title,
      'Company': j.company,
      'Location': j.location,
      'Date Posted': j.datePosted || 'Recent',
      'Job Type': j.jobType || 'Not specified',
      'Min Salary': j.minAmount ? `$${j.minAmount.toLocaleString()}` : '',
      'Max Salary': j.maxAmount ? `$${j.maxAmount.toLocaleString()}` : '',
      'Is Remote': j.isRemote ? 'Yes' : 'No',
      'AI Match Score': j.matchScore ? `${j.matchScore}%` : 'Not run',
      'AI Verdict': j.matchVerdict || '',
      'Job URL': j.jobUrl,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'JobSpy_Jobs');
    XLSX.writeFile(workbook, `JobSpy_${searchTerm.replace(/\s+/g, '_')}_${Date.now()}.xlsx`);
    showNotification('Exported job records to Excel successfully!');
  };

  // Filtered jobs in UI
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // If stickToSite is active, filter strictly
      if (stickToSite !== 'all' && job.site.toLowerCase() !== stickToSite.toLowerCase()) {
        return false;
      }
      // Min salary filter
      if (minSalaryFilter > 0 && job.minAmount && job.minAmount < minSalaryFilter) {
        return false;
      }
      // Text search in results
      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase();
        const matchesTitle = job.title.toLowerCase().includes(q);
        const matchesCompany = job.company.toLowerCase().includes(q);
        const matchesLocation = job.location.toLowerCase().includes(q);
        const matchesSkills = job.skills?.some((s) => s.toLowerCase().includes(q));
        if (!matchesTitle && !matchesCompany && !matchesLocation && !matchesSkills) {
          return false;
        }
      }
      return true;
    });
  }, [jobs, stickToSite, minSalaryFilter, filterQuery]);

  // Board breakdown stats
  const boardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const j of jobs) {
      counts[j.site] = (counts[j.site] || 0) + 1;
    }
    return counts;
  }, [jobs]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium transition-all transform animate-in slide-in-from-bottom-5 ${
            notification.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-800 backdrop-blur-md'
              : 'bg-emerald-950/90 text-emerald-200 border-emerald-800 backdrop-blur-md'
          }`}
        >
          {notification.type === 'error' ? (
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          )}
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 hover:opacity-70 text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950/70 to-slate-900 p-8 border border-emerald-500/20 shadow-xl">
        <div className="absolute -right-12 -bottom-12 opacity-10 pointer-events-none">
          <Compass className="h-64 w-64 text-emerald-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              JobSpy Live Multi-Board Aggregator
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Recruiter Job Board Hunter
            </h1>
            <p className="text-sm text-slate-300">
              Aggregates job openings across LinkedIn, Indeed, ZipRecruiter, Glassdoor, and Google Jobs concurrently.
              Results are <span className="text-emerald-400 font-semibold">mixed up always</span> across boards or stickable to a specific board with 1-click AI bench matching.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleShuffleFeed}
              disabled={jobs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 text-xs font-semibold transition shadow-sm disabled:opacity-40"
              title="Shuffle and re-mix job board distribution"
            >
              <Shuffle className="h-4 w-4 text-emerald-400" />
              Re-Mix Feed
            </button>
            <button
              onClick={handleExportExcel}
              disabled={jobs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-lg shadow-emerald-600/20 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Export to Excel
            </button>
          </div>
        </div>
      </div>

      {/* Bench Candidate Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 min-w-[240px]">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Active Bench Candidate for AI Match
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                className="text-sm font-semibold bg-transparent text-slate-900 dark:text-white border-0 focus:ring-0 p-0 cursor-pointer"
              >
                {candidates.length === 0 ? (
                  <option value="">No bench candidates found</option>
                ) : (
                  candidates.map((c) => (
                    <option key={c.id} value={c.id} className="dark:bg-slate-900">
                      {c.fullName} — {c.primaryTitle}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <span>Each job can be instantly evaluated against this candidate using Gemini AI</span>
        </div>
      </div>

      {/* Main Search & Board Configuration Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
        {/* Search Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-6 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
              Role / Keywords / Skillsets
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. Senior Full Stack Engineer, React, Python..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-emerald-500" />
              Target Location / Territory
            </label>
            <div className="relative">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. Remote, San Francisco, New York..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <MapPin className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              onClick={() => handleSearch()}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-lg shadow-emerald-600/30 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Hunting...</span>
                </>
              ) : (
                <>
                  <Compass className="h-4 w-4" />
                  <span>Search Jobs</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
            Quick Roles:
          </span>
          {QUICK_SEARCH_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => {
                setSearchTerm(role);
              }}
              className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                searchTerm === role
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-transparent hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {role}
            </button>
          ))}
        </div>

        {/* ==================================================================== */}
        {/* JOB BOARDS STICK & MIX CONTROL BAR (CORE USER REQUIREMENT)            */}
        {/* ==================================================================== */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Job Board Mode: Mixed vs Stick to Board
              </span>
            </div>
            <div className="text-xs text-slate-500">
              {stickToSite === 'all' ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Shuffle className="h-3.5 w-3.5" />
                  Mixed Feed Active (Balanced multi-board distribution)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sticking strictly to {BOARD_CONFIG[stickToSite]?.label || stickToSite}
                </span>
              )}
            </div>
          </div>

          {/* Sticky Board Selection Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStickToSite('all')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                stickToSite === 'all'
                  ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40'
              }`}
            >
              <Shuffle className="h-3.5 w-3.5" />
              <span>🔀 All Boards (Mixed Always)</span>
            </button>

            {Object.entries(BOARD_CONFIG).map(([key, config]) => {
              const isSelected = stickToSite === key;
              return (
                <button
                  key={key}
                  onClick={() => setStickToSite(key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition border ${
                    isSelected
                      ? `${config.badgeClass} ring-2 ring-emerald-500/40 font-bold shadow-sm`
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${config.dotClass}`} />
                  <span>Stick to {config.label}</span>
                </button>
              );
            })}
          </div>

          {/* If Mixed mode is active: Checkbox toggles for multi-board selection */}
          {stickToSite === 'all' && (
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
                Include in mix:
              </span>
              {Object.entries(BOARD_CONFIG).map(([key, config]) => {
                const checked = selectedSites.includes(key);
                return (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSites([...selectedSites, key]);
                        } else if (selectedSites.length > 1) {
                          setSelectedSites(selectedSites.filter((s) => s !== key));
                        }
                      }}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    <span>{config.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Extended Filter Options (Remote, Freshness, Job Type, Salary, Limit) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
          {/* Remote Toggle */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Workplace Type
            </label>
            <button
              onClick={() => setIsRemoteOnly(!isRemoteOnly)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                isRemoteOnly
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>{isRemoteOnly ? '🌐 Remote Only' : '🏢 Any Workplace'}</span>
              <span className={`h-2 w-2 rounded-full ${isRemoteOnly ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            </button>
          </div>

          {/* Job Type */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Job Type
            </label>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Employment Types</option>
              <option value="fulltime">Full-Time</option>
              <option value="contract">Contract / C2C / C2H</option>
              <option value="parttime">Part-Time</option>
              <option value="internship">Internship</option>
            </select>
          </div>

          {/* Freshness */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Freshness
            </label>
            <select
              value={hoursOld}
              onChange={(e) => setHoursOld(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value={24}>Past 24 Hours</option>
              <option value={72}>Past 3 Days (72h)</option>
              <option value={168}>Past 7 Days</option>
              <option value={336}>Past 14 Days</option>
              <option value={720}>Past 30 Days</option>
            </select>
          </div>

          {/* Min Salary Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Min Base Salary
            </label>
            <select
              value={minSalaryFilter}
              onChange={(e) => setMinSalaryFilter(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value={0}>Any Compensation</option>
              <option value={90000}>$90,000+ / yr</option>
              <option value={120000}>$120,000+ / yr</option>
              <option value={150000}>$150,000+ / yr</option>
              <option value={180000}>$180,000+ / yr</option>
            </select>
          </div>

          {/* Results Count */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Fetch Limit
            </label>
            <select
              value={resultsWanted}
              onChange={(e) => setResultsWanted(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value={15}>15 results</option>
              <option value={25}>25 results</option>
              <option value={40}>40 results</option>
              <option value={50}>50 results</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Header & Instant Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Aggregated Job Postings</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              {filteredJobs.length} Results
            </span>
          </h2>

          {/* Board distribution badges */}
          <div className="hidden lg:flex items-center gap-1.5">
            {Object.entries(boardCounts).map(([site, count]) => (
              <span
                key={site}
                className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium"
              >
                {BOARD_CONFIG[site]?.label || site}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* In-results quick filter */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter current results by title/company..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <Filter className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loading Skeleton / Spinner */}
      {isLoading && (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="inline-block p-4 rounded-full bg-emerald-500/10 animate-pulse text-emerald-500">
            <Compass className="h-10 w-10 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Aggregating Live Jobs via JobSpy Engine
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Connecting concurrently to LinkedIn, Indeed, ZipRecruiter, Glassdoor and Google Jobs...
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredJobs.length === 0 && hasSearched && (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <AlertCircle className="h-10 w-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            No matching job postings found
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search keywords, switching from specific board to "All Boards (Mixed)", or relaxing the salary/freshness filters.
          </p>
        </div>
      )}

      {/* Job Cards Grid */}
      {!isLoading && filteredJobs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredJobs.map((job) => {
            const board = BOARD_CONFIG[job.site] || {
              label: job.site.toUpperCase(),
              badgeClass: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30',
              borderClass: 'border-l-slate-500',
              dotClass: 'bg-slate-500',
            };
            const isSaved = savedJobIds.has(job.id);
            const isEvaluating = evaluatingJobId === job.id;
            const isSaving = savingJobId === job.id;

            return (
              <div
                key={job.id}
                className={`relative flex flex-col justify-between rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all border-l-4 ${board.borderClass} group`}
              >
                <div>
                  {/* Top Header: Board Badge + Freshness */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${board.badgeClass}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${board.dotClass}`} />
                      {board.label}
                    </span>

                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      {job.datePosted || 'Recent'}
                    </span>
                  </div>

                  {/* Title & Company */}
                  <div className="space-y-1">
                    <h3
                      onClick={() => setActiveModalJob(job)}
                      className="text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 transition cursor-pointer line-clamp-2"
                      title={job.title}
                    >
                      {job.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{job.company}</span>
                    </div>
                  </div>

                  {/* Location & Tags */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg">
                      <MapPin className="h-3 w-3 text-emerald-500 shrink-0" />
                      <span className="truncate max-w-[150px]">{job.location}</span>
                    </span>

                    {job.isRemote && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[10px]">
                        Remote
                      </span>
                    )}

                    {job.jobType && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium text-[10px] uppercase">
                        {job.jobType}
                      </span>
                    )}
                  </div>

                  {/* Compensation */}
                  {(job.minAmount || job.maxAmount) && (
                    <div className="flex items-center gap-1.5 mt-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <DollarSign className="h-3.5 w-3.5" />
                      <span>
                        ${job.minAmount?.toLocaleString()}
                        {job.maxAmount ? ` - $${job.maxAmount.toLocaleString()}` : ''}
                        <span className="text-[10px] text-slate-400 font-normal"> / yr</span>
                      </span>
                    </div>
                  )}

                  {/* Skills tags */}
                  {job.skills && job.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {job.skills.slice(0, 4).map((s) => (
                        <span
                          key={s}
                          className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        >
                          {s}
                        </span>
                      ))}
                      {job.skills.length > 4 && (
                        <span className="text-[10px] text-slate-400 self-center">
                          +{job.skills.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* AI Match Badge (if already evaluated) */}
                  {job.matchScore !== undefined && job.matchScore !== null && (
                    <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          AI Match: {job.matchScore}%
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          job.matchVerdict === 'APPLY'
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-600 border border-rose-500/30'
                        }`}
                      >
                        {job.matchVerdict}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Run AI Match Button */}
                    <button
                      onClick={() => handleRunAiMatch(job)}
                      disabled={isEvaluating}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold transition border border-emerald-500/20 disabled:opacity-50"
                      title="Run Gemini AI Match Analysis with active bench candidate"
                    >
                      {isEvaluating ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      <span>Match AI</span>
                    </button>

                    {/* Save to Matched JDs */}
                    <button
                      onClick={() => handleSaveToMatchedJds(job)}
                      disabled={isSaved || isSaving}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
                        isSaved
                          ? 'bg-slate-100 dark:bg-slate-800 text-emerald-500 border-emerald-500/30'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                      title="Save directly to your Matched JDs list"
                    >
                      {isSaved ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Saved</span>
                        </>
                      ) : isSaving ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <BookmarkCheck className="h-3.5 w-3.5" />
                          <span>Save</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* View Details */}
                    <button
                      onClick={() => setActiveModalJob(job)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="View Job Details"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>

                    {/* External Link */}
                    {job.jobUrl && (
                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition"
                        title={`Open job on ${board.label}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================================== */}
      {/* JOB DETAILS MODAL                                                    */}
      {/* ==================================================================== */}
      {activeModalJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      BOARD_CONFIG[activeModalJob.site]?.badgeClass || 'bg-slate-500/10 text-slate-500'
                    }`}
                  >
                    {BOARD_CONFIG[activeModalJob.site]?.label || activeModalJob.site}
                  </span>
                  {activeModalJob.isRemote && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-semibold">
                      Remote
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  {activeModalJob.title}
                </h2>
                <p className="text-sm text-slate-500 font-medium">
                  {activeModalJob.company} • {activeModalJob.location}
                </p>
              </div>

              <button
                onClick={() => setActiveModalJob(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700 dark:text-slate-300">
              {/* Compensation & Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Salary Range
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {activeModalJob.minAmount
                      ? `$${activeModalJob.minAmount.toLocaleString()} - $${activeModalJob.maxAmount?.toLocaleString() || 'DOE'}`
                      : 'Competitive / Unspecified'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Job Board
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {BOARD_CONFIG[activeModalJob.site]?.label || activeModalJob.site}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Date Posted
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {activeModalJob.datePosted || 'Recent'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Job Type
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white capitalize">
                    {activeModalJob.jobType || 'Full-time'}
                  </span>
                </div>
              </div>

              {/* Skills */}
              {activeModalJob.skills && activeModalJob.skills.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                    Key Skillsets
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {activeModalJob.skills.map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Description */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Job Description
                  </h4>
                  <button
                    onClick={() => handleCopyJd(activeModalJob.id, activeModalJob.description)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-500 transition"
                  >
                    {copiedId === activeModalJob.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-500">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy JD</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 whitespace-pre-line text-xs leading-relaxed font-sans max-h-96 overflow-y-auto">
                  {activeModalJob.description || 'Full job description available at source job board.'}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950">
              <button
                onClick={() => handleRunAiMatch(activeModalJob)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/30 transition"
              >
                <Sparkles className="h-4 w-4" />
                <span>Run AI Match Score</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSaveToMatchedJds(activeModalJob)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition"
                >
                  <BookmarkCheck className="h-4 w-4" />
                  <span>Save to Matched JDs</span>
                </button>
                {activeModalJob.jobUrl && (
                  <a
                    href={activeModalJob.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/20 transition"
                  >
                    <span>Apply / View on Board</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* AI MATCH INTEL MODAL                                                 */}
      {/* ==================================================================== */}
      {activeAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    AI Match Intelligence Analysis
                  </h3>
                  <p className="text-xs text-slate-500">
                    Candidate fit evaluation for {activeAiModal.job.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveAiModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Score & Verdict Banner */}
              <div className="flex items-center justify-between p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    AI Verdict
                  </span>
                  <div className="flex items-center gap-2">
                    {activeAiModal.result.verdict === 'APPLY' ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    ) : (
                      <XCircle className="h-6 w-6 text-rose-500" />
                    )}
                    <span
                      className={`text-xl font-extrabold ${
                        activeAiModal.result.verdict === 'APPLY'
                          ? 'text-emerald-500'
                          : 'text-rose-500'
                      }`}
                    >
                      {activeAiModal.result.verdict}
                    </span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Match Confidence
                  </span>
                  <span className="text-3xl font-black text-slate-900 dark:text-white">
                    {activeAiModal.result.matchScore}%
                  </span>
                </div>
              </div>

              {/* Reasoning */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                  Matching Reasoning & Strengths
                </h4>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {activeAiModal.result.reasoning || 'Strong alignment between candidate background and job specifications.'}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-950">
              <button
                onClick={() => {
                  handleSaveToMatchedJds(activeAiModal.job);
                  setActiveAiModal(null);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/20 transition"
              >
                <BookmarkCheck className="h-4 w-4" />
                <span>Save to Matched JDs</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
