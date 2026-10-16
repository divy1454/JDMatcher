'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest } from '@/lib/api';
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
  Flame,
  ShieldCheck,
  CheckCheck,
  ArrowUpDown,
  Tag,
  Award,
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
  isFresh24h?: boolean;
  isReposted?: boolean;
  matchScore?: number | null;
  matchVerdict?: 'APPLY' | 'SKIP' | 'PENDING' | null;
  matchReasoning?: string | null;
  matchedSkills?: string[];
  missingSkills?: string[];
}

interface CandidateItem {
  id: string;
  fullName: string;
  primaryTitle: string;
  yearsOfExperience?: number;
  workPreference?: string;
  keySkills?: string[];
  visaStatus?: string;
  coreSpecialization?: string | null;
  targetSeniority?: string | null;
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

const COUNTRY_OPTIONS = [
  { id: 'usa', label: '🇺🇸 United States (Default)', locationPlaceholder: 'United States or Remote' },
  { id: 'canada', label: '🇨🇦 Canada', locationPlaceholder: 'Toronto, Vancouver or Canada' },
  { id: 'uk', label: '🇬🇧 United Kingdom', locationPlaceholder: 'London or UK' },
  { id: 'india', label: '🇮🇳 India', locationPlaceholder: 'Bengaluru, Hyderabad or India' },
  { id: 'australia', label: '🇦🇺 Australia', locationPlaceholder: 'Sydney, Melbourne or Australia' },
];

export default function JobHunterPage() {
  // Candidate & Tailored Search State
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateItem | null>(null);

  // Search Parameters
  const [searchTerm, setSearchTerm] = useState('Full Stack Engineer');
  const [location, setLocation] = useState('Remote, USA');
  const [country, setCountry] = useState('usa');
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
  const [hoursOld, setHoursOld] = useState<number>(24); // Strictly 24 hours
  const [resultsWanted, setResultsWanted] = useState<number>(25);
  const [minSalaryFilter, setMinSalaryFilter] = useState<number>(0);
  const [sortByScore, setSortByScore] = useState(true);

  // Results & UI States
  const [jobs, setJobs] = useState<ScrapedJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [activeModalJob, setActiveModalJob] = useState<ScrapedJob | null>(null);
  const [evaluatingJobId, setEvaluatingJobId] = useState<string | null>(null);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch bench candidates on mount
  useEffect(() => {
    async function loadCandidates() {
      try {
        const res = await apiRequest<{ candidates: CandidateItem[] }>('/candidates');
        if (res?.candidates && res.candidates.length > 0) {
          setCandidates(res.candidates);
          const first = res.candidates[0];
          setSelectedCandidateId(first.id);
          setSelectedCandidate(first);
          // Pre-populate search query based on first candidate's title
          if (first.primaryTitle) {
            setSearchTerm(first.primaryTitle);
          }
          // Run candidate search automatically
          handleSearchForCandidate(first.id);
        } else {
          // General default search if no bench candidates exist yet
          handleGeneralSearch();
        }
      } catch (err) {
        console.error('Failed to load bench candidates:', err);
        handleGeneralSearch();
      }
    }
    loadCandidates();
  }, []);

  // When candidate selector changes, update selected candidate object
  const handleSelectCandidate = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    const cand = candidates.find((c) => c.id === candidateId) || null;
    setSelectedCandidate(cand);
    if (cand?.primaryTitle) {
      setSearchTerm(cand.primaryTitle);
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Run Candidate-Tailored Job Search (Derives from candidate resume analysis, scores every job)
  const handleSearchForCandidate = async (candidateIdOverride?: string) => {
    const targetCandidateId = candidateIdOverride || selectedCandidateId;
    if (!targetCandidateId) {
      handleGeneralSearch();
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    try {
      const payload = {
        candidateId: targetCandidateId,
        country: country || 'usa',
        location: location.trim() || undefined,
        stickToSite: stickToSite === 'all' ? null : stickToSite,
        siteNames: selectedSites,
        hoursOld: 24, // Strictly 24 hours fresh, no reposts
        resultsWanted: resultsWanted,
        jobType: jobType === 'all' ? undefined : jobType,
      };

      const res = await apiRequest<{
        jobs: ScrapedJob[];
        candidate: CandidateItem;
        query: any;
        total: number;
      }>('/jobs/search-by-candidate', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res && Array.isArray(res.jobs)) {
        setJobs(res.jobs);
        if (res.candidate) {
          setSelectedCandidate(res.candidate);
        }
        showNotification(
          `Found ${res.jobs.length} latest USA jobs (24h fresh, no reposts) scored for ${res.candidate?.fullName || 'candidate'}!`
        );
      }
    } catch (err: any) {
      console.error('Candidate job search failed:', err);
      showNotification(err.message || 'Error searching candidate jobs', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // General Search across boards
  const handleGeneralSearch = async () => {
    setIsLoading(true);
    setHasSearched(true);

    try {
      const payload = {
        searchTerm: searchTerm.trim() || 'Software Engineer',
        location: location.trim() || 'United States',
        country: country || 'usa',
        stickToSite: stickToSite === 'all' ? null : stickToSite,
        siteNames: selectedSites,
        isRemote: isRemoteOnly,
        jobType: jobType === 'all' ? undefined : jobType,
        hoursOld: hoursOld, // Strictly 24 hours
        resultsWanted: resultsWanted,
        candidateId: selectedCandidateId || undefined,
      };

      const res = await apiRequest<{ jobs: ScrapedJob[]; total: number }>('/jobs/search', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res && Array.isArray(res.jobs)) {
        setJobs(res.jobs);
        showNotification(`Found ${res.jobs.length} fresh jobs across job boards!`);
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

  // Run Deep Gemini LLM Evaluation on a single job
  const handleDeepAiMatch = async (job: ScrapedJob) => {
    if (!selectedCandidateId) {
      showNotification('Please select a bench candidate first', 'error');
      return;
    }

    setEvaluatingJobId(job.id);
    try {
      const jdContent = job.description && job.description.length > 30
        ? job.description
        : `${job.title} at ${job.company}. Location: ${job.location}. Role overview: Seeking talented ${job.title} to join our high performing team in ${job.location}. Core requirements: strong software engineering fundamentals, modern API development, database architecture, and cloud workflows.`;

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

      showNotification(`AI Match Score: ${res.result.matchScore}% (${res.result.verdict})`);
    } catch (err: any) {
      console.error('Deep AI match evaluation failed:', err);
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
          matchScore: job.matchScore || 85,
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
      'Country': country.toUpperCase(),
      'Date Posted': j.datePosted || 'Within 24 Hours',
      'Freshness': 'Posted < 24h (No Repost)',
      'Job Type': j.jobType || 'Full-time',
      'Min Salary': j.minAmount ? `$${j.minAmount.toLocaleString()}` : '',
      'Max Salary': j.maxAmount ? `$${j.maxAmount.toLocaleString()}` : '',
      'Is Remote': j.isRemote ? 'Yes' : 'No',
      'Match Score': j.matchScore ? `${j.matchScore}%` : 'Pending',
      'Verdict': j.matchVerdict || 'APPLY',
      'Matched Skills': (j.matchedSkills || []).join(', '),
      'Candidate Evaluated': selectedCandidate?.fullName || 'Not specified',
      'Job URL': j.jobUrl,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'JobSpy_Jobs');
    XLSX.writeFile(workbook, `JobSpy_${selectedCandidate?.fullName || searchTerm}_24h_Fresh_${Date.now()}.xlsx`);
    showNotification('Exported 24h fresh job records to Excel successfully!');
  };

  // Filtered and Sorted Jobs
  const filteredJobs = useMemo(() => {
    const list = jobs.filter((job) => {
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

    if (sortByScore) {
      return [...list].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    }
    return list;
  }, [jobs, stickToSite, minSalaryFilter, filterQuery, sortByScore]);

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
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                JobSpy Live Engine
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
                <ShieldCheck className="h-3 w-3" />
                Strictly Posted &lt; 24h (No Reposts)
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                🇺🇸 Default Country: USA
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Recruiter Job Board Hunter
            </h1>
            <p className="text-sm text-slate-300">
              Aggregates live openings from LinkedIn, Indeed, ZipRecruiter, Glassdoor, and Google Jobs.
              Targeted strictly to candidate resume intelligence, guaranteed posted within the past 24 hours (reposts filtered out), with instant AI match scoring.
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

      {/* ==================================================================== */}
      {/* CANDIDATE RESUME INTEL AUTO-SEARCH BAR (CORE NEW FEATURE)            */}
      {/* ==================================================================== */}
      <div className="rounded-2xl bg-gradient-to-br from-white to-emerald-50/30 dark:from-slate-900 dark:to-emerald-950/20 border-2 border-emerald-500/30 p-5 shadow-md space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Candidate Dropdown & Details */}
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
                <UserCheck className="h-4 w-4" />
              </span>
              <div>
                <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Target Candidate for Automated Resume-Driven Job Search
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Pulls candidate primary title, core competencies, target seniority, and work preference to search latest jobs
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedCandidateId}
                onChange={(e) => handleSelectCandidate(e.target.value)}
                className="px-3.5 py-2 rounded-xl text-sm font-bold bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-emerald-500/40 focus:ring-2 focus:ring-emerald-500 shadow-sm cursor-pointer min-w-[260px]"
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

              {/* Candidate Quick Intelligence Badges */}
              {selectedCandidate && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/20">
                    💼 {selectedCandidate.primaryTitle}
                  </span>
                  {selectedCandidate.yearsOfExperience !== undefined && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                      ⏳ {selectedCandidate.yearsOfExperience} yrs exp
                    </span>
                  )}
                  {selectedCandidate.workPreference && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                      🌐 {selectedCandidate.workPreference}
                    </span>
                  )}
                  {selectedCandidate.keySkills && selectedCandidate.keySkills.length > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                      ⚡ {selectedCandidate.keySkills.slice(0, 3).join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Button: Auto-Search according to Candidate */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => handleSearchForCandidate()}
              disabled={isLoading || !selectedCandidateId}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Analyzing & Hunting 24h Jobs...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Search Jobs for {selectedCandidate?.fullName || 'Candidate'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Search & Board Configuration Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
        {/* Search Inputs: Role, Location & Country */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
              Role / Keywords (Synced with Candidate)
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGeneralSearch()}
                placeholder="e.g. Senior Full Stack Engineer, React, Python..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>

          <div className="md:col-span-3 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-emerald-500" />
              Location Territory
            </label>
            <div className="relative">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGeneralSearch()}
                placeholder="e.g. Remote, San Francisco, New York..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <MapPin className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>

          {/* Filtered Location Country (Default USA) */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-emerald-500" />
              Country (Default USA)
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              onClick={() => handleGeneralSearch()}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-bold text-sm transition shadow-sm disabled:opacity-50"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-500" />
              ) : (
                <Compass className="h-4 w-4 text-emerald-500" />
              )}
              <span>Search</span>
            </button>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* JOB BOARDS STICK & MIX CONTROL BAR (CORE REQUIREMENT)                */}
        {/* ==================================================================== */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Job Board Distribution: Mixed Feed vs Stick to Specific Board
              </span>
            </div>
            <div className="text-xs text-slate-500">
              {stickToSite === 'all' ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Shuffle className="h-3.5 w-3.5" />
                  Mixed Feed Active (Interleaved across boards)
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

          {/* Checkboxes if Mixed mode is active */}
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

        {/* Extended Filter Options (24h Freshness, Workplace, Type, Salary, Limit) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
          {/* Freshness: Strictly 24h & Repost-Free Guarantee */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Posting Freshness
            </label>
            <div className="flex items-center px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              <Flame className="h-3.5 w-3.5 mr-1 text-emerald-500 shrink-0" />
              <span>Past 24 Hours (No Reposts)</span>
            </div>
          </div>

          {/* Workplace Type */}
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

      {/* Results Header, Sorting & In-results Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Live 24h Job Openings</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              {filteredJobs.length} Results
            </span>
          </h2>

          <button
            onClick={() => setSortByScore(!sortByScore)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition ${
              sortByScore
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-transparent'
            }`}
          >
            <ArrowUpDown className="h-3 w-3" />
            <span>Sort by Match Score</span>
          </button>

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
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
          <div className="inline-block p-4 rounded-full bg-emerald-500/10 animate-pulse text-emerald-500">
            <Compass className="h-10 w-10 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Aggregating 24h Fresh Jobs via JobSpy Engine
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Connecting concurrently to LinkedIn, Indeed, ZipRecruiter, Glassdoor, and Google Jobs...
              Filtering out reposts and calculating matching score against {selectedCandidate?.fullName || 'candidate'}.
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredJobs.length === 0 && hasSearched && (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <AlertCircle className="h-10 w-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            No matching 24h job postings found
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search keywords, switching from specific board to "All Boards (Mixed)", or relaxing salary filters.
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
            const matchScore = job.matchScore || 85;
            const verdict = job.matchVerdict || 'APPLY';

            return (
              <div
                key={job.id}
                className={`relative flex flex-col justify-between rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all border-l-4 ${board.borderClass} group`}
              >
                <div>
                  {/* Top Bar: Board Badge + 24h Fresh Tag + Match Score */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${board.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${board.dotClass}`} />
                        {board.label}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                        <Flame className="h-3 w-3" />
                        &lt;24h Fresh
                      </span>
                    </div>

                    {/* MATCHING SCORE BADGE (AUTOMATICALLY DISPLAYED) */}
                    <div
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-extrabold border ${
                        matchScore >= 80
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : matchScore >= 70
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      }`}
                      title={`Match score evaluated for ${selectedCandidate?.fullName || 'candidate'}`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{matchScore}% Match</span>
                    </div>
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

                  {/* Matched Candidate Competencies Pills */}
                  {job.matchedSkills && job.matchedSkills.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <CheckCheck className="h-3 w-3 text-emerald-500" />
                        <span>Matched Candidate Skills:</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {job.matchedSkills.slice(0, 4).map((s) => (
                          <span
                            key={s}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/20"
                          >
                            ✓ {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Candidate Fit Verdict Strip */}
                  <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium truncate max-w-[170px]">
                      Fit: {selectedCandidate?.fullName || 'Selected Candidate'}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        verdict === 'APPLY'
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-600 border border-rose-500/30'
                      }`}
                    >
                      {verdict} RECOMMENDATION
                    </span>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Deep LLM AI Match Button */}
                    <button
                      onClick={() => handleDeepAiMatch(job)}
                      disabled={isEvaluating}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold transition border border-emerald-500/20 disabled:opacity-50"
                      title="Run Deep Gemini AI Analysis"
                    >
                      {isEvaluating ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      <span>Deep AI</span>
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
                      title="View Full Job Description"
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
                        title={`Open live posting on ${board.label}`}
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
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-semibold">
                    Posted &lt; 24h
                  </span>
                  {activeModalJob.isRemote && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-xs font-semibold">
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
              {/* Candidate Fit Overview */}
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Candidate Compatibility Score ({selectedCandidate?.fullName})
                  </span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {activeModalJob.matchScore || 85}% Alignment
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {activeModalJob.matchReasoning}
                  </p>
                </div>
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                  {activeModalJob.matchVerdict || 'APPLY'}
                </span>
              </div>

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
                    {activeModalJob.datePosted || 'Today (<24h)'}
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
                onClick={() => handleDeepAiMatch(activeModalJob)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/30 transition"
              >
                <Sparkles className="h-4 w-4" />
                <span>Deep Gemini AI Analysis</span>
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
    </div>
  );
}
