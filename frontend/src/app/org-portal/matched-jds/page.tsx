'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
  Briefcase,
  Search,
  ExternalLink,
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Building2,
  Download,
  Copy,
  Check,
  User,
  Users,
  Clock,
  Sparkles,
  RotateCcw,
  Filter,
  RefreshCw,
  Gauge,
  Calendar,
  ArrowUpDown,
} from 'lucide-react';
import { CustomDropdown, DropdownOption } from '@/components/ui/CustomDropdown';

interface MatchedJdItem {
  id: string;
  candidateId: string;
  candidateName: string;
  recruiterId?: string;
  recruiterName?: string;
  jobTitle: string;
  companyOrClient: string | null;
  jobUrl: string | null;
  rawJdText: string;
  verdict: 'APPLY' | 'SKIP';
  matchScore: number;
  matchReasoning: string;
  appliedAt: string;
}

interface CandidateOption {
  id: string;
  fullName: string;
}

interface RecruiterOption {
  id: string;
  fullName: string;
}

function getDisplayCompany(company: string | null, rawJdText?: string): string {
  if (company && company !== 'Confidential / Client' && company !== 'Client') {
    return company;
  }
  if (rawJdText) {
    const compMatch = rawJdText.match(/(?:company|client|employer|organization|at|with)\s*[:\-–]?\s*([A-Z][A-Za-z0-9&.\s]{2,35})/);
    if (compMatch && compMatch[1]) return compMatch[1].trim();
  }
  return company || 'Direct Client / Vendor';
}

function getDisplayRole(jobTitle: string, rawJdText?: string): string {
  if (jobTitle && jobTitle !== 'Opportunity' && jobTitle !== 'Software Opportunity' && jobTitle !== 'Job Application' && jobTitle !== 'Not Specified') {
    return jobTitle;
  }
  if (rawJdText) {
    const titleMatch = rawJdText.match(/(?:job\s*title|role|position)\s*[:\-–]?\s*([^\n\r,\.]{3,50})/i);
    if (titleMatch && titleMatch[1]) return titleMatch[1].trim();
    const firstLine = rawJdText.trim().split('\n')[0].replace(/[#*_-]/g, '').trim().slice(0, 60);
    if (firstLine && firstLine.length > 4 && !firstLine.toLowerCase().includes('job description')) {
      return firstLine;
    }
  }
  return jobTitle || 'Software Opportunity';
}

export default function OrgMatchedJdsPage() {
  const [items, setItems] = useState<MatchedJdItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterOption[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [selectedRecruiter, setSelectedRecruiter] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');
  const [timeframeFilter, setTimeframeFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedJdId, setCopiedJdId] = useState<string | null>(null);
  const [copiedReasoningId, setCopiedReasoningId] = useState<string | null>(null);

  const fetchData = async (silent = false) => {
    if (!silent) {
      if (items.length === 0) setIsInitialLoading(true);
      else setIsRefreshing(true);
    }
    try {
      const [jdsData, candidatesData, recruitersData] = await Promise.all([
        apiRequest('/analyze/matched-jds?limit=all'),
        apiRequest('/candidates?limit=all').catch(() => []),
        apiRequest('/recruiters').catch(() => []),
      ]);
      if (Array.isArray(jdsData)) setItems(jdsData);
      if (Array.isArray(candidatesData)) setCandidates(candidatesData);
      if (Array.isArray(recruitersData)) setRecruiters(recruitersData);
      setLastSynced(new Date());
    } catch (err) {
      console.error('Failed to load matched JDs:', err);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(false);
    const interval = setInterval(() => {
      fetchData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyText = async (text: string, id: string, type: 'jd' | 'reasoning') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'jd') {
        setCopiedJdId(id);
        setTimeout(() => setCopiedJdId(null), 2000);
      } else {
        setCopiedReasoningId(id);
        setTimeout(() => setCopiedReasoningId(null), 2000);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedCandidate('');
    setSelectedRecruiter('');
    setVerdictFilter('');
    setScoreFilter('');
    setTimeframeFilter('');
    setSortBy('newest');
  };

  // Compile unique candidate map
  const uniqueCandidateMap = new Map<string, string>();
  candidates.forEach((c) => uniqueCandidateMap.set(c.id, c.fullName));
  items.forEach((item) => {
    if (item.candidateId && item.candidateName) {
      uniqueCandidateMap.set(item.candidateId, item.candidateName);
    }
  });

  // Compile unique recruiter map
  const uniqueRecruiterMap = new Map<string, string>();
  recruiters.forEach((r) => uniqueRecruiterMap.set(r.id, r.fullName));
  items.forEach((item) => {
    if (item.recruiterId && item.recruiterName) {
      uniqueRecruiterMap.set(item.recruiterId, item.recruiterName);
    }
  });

  const candidateDropdownOptions: DropdownOption[] = [
    { value: '', label: `All Candidates (${uniqueCandidateMap.size})` },
    ...Array.from(uniqueCandidateMap.entries()).map(([id, name]) => ({
      value: id,
      label: name,
    })),
  ];

  const recruiterDropdownOptions: DropdownOption[] = [
    { value: '', label: `All Recruiters (${uniqueRecruiterMap.size})` },
    ...Array.from(uniqueRecruiterMap.entries()).map(([id, name]) => ({
      value: id,
      label: name,
    })),
  ];

  const verdictDropdownOptions: DropdownOption[] = [
    { value: '', label: 'All Verdicts' },
    { value: 'APPLY', label: 'APPLY Only', badge: 'Applied', color: 'text-emerald-300' },
    { value: 'SKIP', label: 'SKIP Only', badge: 'Skipped', color: 'text-rose-300' },
  ];

  const scoreDropdownOptions: DropdownOption[] = [
    { value: '', label: 'All Scores' },
    { value: 'high', label: 'Strong Match (≥80%)', badge: '≥80%', color: 'text-emerald-400' },
    { value: 'moderate', label: 'Moderate Match (50–79%)', badge: '50-79%', color: 'text-amber-400' },
    { value: 'low', label: 'Low Match (<50%)', badge: '<50%', color: 'text-rose-400' },
  ];

  const timeframeDropdownOptions: DropdownOption[] = [
    { value: '', label: 'All Dates' },
    { value: 'today', label: 'Evaluated Today' },
    { value: '7d', label: 'Past 7 Days' },
    { value: '30d', label: 'Past 30 Days' },
  ];

  const sortDropdownOptions: DropdownOption[] = [
    { value: 'newest', label: 'Sort: Newest First' },
    { value: 'oldest', label: 'Sort: Oldest First' },
    { value: 'score-desc', label: 'Sort: Highest Score' },
    { value: 'score-asc', label: 'Sort: Lowest Score' },
  ];

  const filtered = items
    .filter((item) => {
      const role = getDisplayRole(item.jobTitle, item.rawJdText).toLowerCase();
      const company = getDisplayCompany(item.companyOrClient, item.rawJdText).toLowerCase();
      const candidate = (item.candidateName || '').toLowerCase();
      const recruiter = (item.recruiterName || '').toLowerCase();
      const rawJd = (item.rawJdText || '').toLowerCase();
      const q = search.toLowerCase();

      const matchesSearch =
        !q ||
        role.includes(q) ||
        company.includes(q) ||
        candidate.includes(q) ||
        recruiter.includes(q) ||
        rawJd.includes(q);

      const matchesCandidate =
        !selectedCandidate ||
        item.candidateId === selectedCandidate ||
        item.candidateName === selectedCandidate;

      const matchesRecruiter =
        !selectedRecruiter ||
        item.recruiterId === selectedRecruiter ||
        item.recruiterName === selectedRecruiter;

      const matchesVerdict = !verdictFilter || item.verdict === verdictFilter;

      // Score filter
      let matchesScore = true;
      if (scoreFilter === 'high') matchesScore = item.matchScore >= 80;
      else if (scoreFilter === 'moderate') matchesScore = item.matchScore >= 50 && item.matchScore < 80;
      else if (scoreFilter === 'low') matchesScore = item.matchScore < 50;

      // Timeframe filter
      let matchesTimeframe = true;
      if (timeframeFilter && item.appliedAt) {
        const itemTime = new Date(item.appliedAt).getTime();
        const now = Date.now();
        if (timeframeFilter === 'today') {
          const todayStart = new Date().setHours(0, 0, 0, 0);
          matchesTimeframe = itemTime >= todayStart;
        } else if (timeframeFilter === '7d') {
          matchesTimeframe = itemTime >= now - 7 * 24 * 60 * 60 * 1000;
        } else if (timeframeFilter === '30d') {
          matchesTimeframe = itemTime >= now - 30 * 24 * 60 * 60 * 1000;
        }
      }

      return matchesSearch && matchesCandidate && matchesRecruiter && matchesVerdict && matchesScore && matchesTimeframe;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
      }
      if (sortBy === 'score-desc') {
        return b.matchScore - a.matchScore;
      }
      if (sortBy === 'score-asc') {
        return a.matchScore - b.matchScore;
      }
      return 0;
    });

  const handleExportExcel = () => {
    if (filtered.length === 0) return;

    const exportRows = filtered.map((item) => ({
      'Role / Position': getDisplayRole(item.jobTitle, item.rawJdText),
      'Company / Client': getDisplayCompany(item.companyOrClient, item.rawJdText),
      'Candidate': item.candidateName || 'Bench Candidate',
      'Recruiter': item.recruiterName || 'Agency Recruiter',
      'Verdict': item.verdict,
      'Match Score (%)': item.matchScore,
      'Date Evaluated': formatDate(item.appliedAt),
      'Job URL': item.jobUrl || 'N/A',
      'AI Evaluation Reasoning': item.matchReasoning,
      'Full Job Description': item.rawJdText,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 30 }, // Role
      { wch: 25 }, // Company
      { wch: 22 }, // Candidate
      { wch: 20 }, // Recruiter
      { wch: 10 }, // Verdict
      { wch: 15 }, // Match Score
      { wch: 20 }, // Date
      { wch: 35 }, // URL
      { wch: 60 }, // Reasoning
      { wch: 70 }, // Raw JD
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Matched JDs');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Agency_Matched_JDs_${today}.xlsx`);
  };

  const hasActiveFilters = Boolean(
    search || selectedCandidate || selectedRecruiter || verdictFilter || scoreFilter || timeframeFilter || sortBy !== 'newest'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Matched Job Descriptions</h1>
            <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              {filtered.length !== items.length ? `${filtered.length} of ${items.length} Evaluated` : `${items.length} Evaluated`}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review matched job descriptions, match scores, and export evaluations.
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData(false)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-xs"
            title="Silent background live sync every 10 seconds"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-emerald-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Live Sync</span>
            {lastSynced && (
              <span className="hidden sm:inline text-[10px] text-slate-400">
                • {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </button>

          {/* Export to Excel Button */}
          <button
            onClick={handleExportExcel}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export matched jobs to Excel (.xlsx)"
          >
            <Download className="h-4 w-4" />
            <span>Export to Excel ({filtered.length})</span>
          </button>
        </div>
      </div>

      {/* Multi-Factor Filter Bar */}
      <div className="space-y-3">
        {/* Primary Row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          {/* Search */}
          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3.5 py-2 shadow-xs backdrop-blur sm:col-span-4">
            <Search className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search role, company, candidate, recruiter..."
              className="ml-2.5 w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
            />
          </div>

          {/* Filter by Candidate */}
          <div className="sm:col-span-3">
            <CustomDropdown
              value={selectedCandidate}
              onChange={setSelectedCandidate}
              options={candidateDropdownOptions}
              icon={<User className="h-4 w-4" />}
              placeholder="Select Candidate"
            />
          </div>

          {/* Filter by Recruiter */}
          <div className="sm:col-span-3">
            <CustomDropdown
              value={selectedRecruiter}
              onChange={setSelectedRecruiter}
              options={recruiterDropdownOptions}
              icon={<Users className="h-4 w-4" />}
              placeholder="Select Recruiter"
            />
          </div>

          {/* Verdict Filter */}
          <div className="sm:col-span-2">
            <CustomDropdown
              value={verdictFilter}
              onChange={setVerdictFilter}
              options={verdictDropdownOptions}
              icon={<Filter className="h-3.5 w-3.5" />}
              placeholder="Select Verdict"
            />
          </div>
        </div>

        {/* Secondary Row: Score, Date, Sort */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <CustomDropdown
              value={scoreFilter}
              onChange={setScoreFilter}
              options={scoreDropdownOptions}
              icon={<Gauge className="h-3.5 w-3.5" />}
              placeholder="Filter by Match Score"
            />
          </div>

          <div className="sm:col-span-4">
            <CustomDropdown
              value={timeframeFilter}
              onChange={setTimeframeFilter}
              options={timeframeDropdownOptions}
              icon={<Calendar className="h-3.5 w-3.5" />}
              placeholder="Filter by Date"
            />
          </div>

          <div className="sm:col-span-4">
            <CustomDropdown
              value={sortBy}
              onChange={setSortBy}
              options={sortDropdownOptions}
              icon={<ArrowUpDown className="h-3.5 w-3.5" />}
              placeholder="Sort By"
            />
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>Showing {filtered.length} of {items.length} evaluated opportunities</span>
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:underline"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Clear filters</span>
          </button>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {isInitialLoading ? (
          <div className="flex h-64 w-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : (
          filtered.map((item) => {
            const isExpanded = expandedId === item.id;
            const isApply = item.verdict === 'APPLY';
            const displayRole = getDisplayRole(item.jobTitle, item.rawJdText);
            const displayCompany = getDisplayCompany(item.companyOrClient, item.rawJdText);

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl transition hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                          isApply
                            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border border-red-500/30 bg-red-500/10 text-red-400'
                        }`}
                      >
                        {isApply ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        <span>{item.verdict}</span>
                      </span>

                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Score: {item.matchScore}%
                      </span>

                      {/* Prominent Extracted Company Badge */}
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        <Building2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span>{displayCompany}</span>
                      </span>
                    </div>

                    {/* Prominent Extracted Role Heading */}
                    <div className="flex items-center gap-2 pt-1.5">
                      <Briefcase className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                        {displayRole}
                      </h3>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        Candidate: <strong className="text-slate-800 dark:text-slate-200">{item.candidateName || 'Bench Candidate'}</strong>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        Recruiter: <strong className="text-indigo-700 dark:text-indigo-300">{item.recruiterName || 'Agency Recruiter'}</strong>
                      </span>
                      <span>•</span>
                      <span>Company: <strong className="text-indigo-700 dark:text-indigo-200">{displayCompany}</strong></span>
                    </div>

                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl line-clamp-3">
                      {item.matchReasoning}
                    </p>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(item.appliedAt)}
                    </span>

                    <div className="flex items-center gap-2">
                      {item.jobUrl && (
                        <a
                          href={item.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Posting</span>
                        </a>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                      >
                        <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{isExpanded ? 'Hide Details' : 'View Details'}</span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Raw JD text block with Copy Button */}
                {isExpanded && (
                  <div className="mt-4 border-t border-slate-800/80 pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Job Description
                      </label>
                      <button
                        onClick={() => handleCopyText(item.rawJdText, item.id, 'jd')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition"
                        title="Copy job description text"
                      >
                        {copiedJdId === item.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="font-semibold">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 leading-relaxed scrollbar-thin">
                      {item.rawJdText}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}

        {!isInitialLoading && filtered.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-500">
            <Briefcase className="mx-auto h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-400">No matched JDs found</p>
            <p className="mt-1 text-xs text-slate-500">
              {hasActiveFilters
                ? 'Try adjusting your search criteria, candidate filter, or recruiter filter.'
                : 'Recruiters can save evaluations from the Chrome Extension using "Save as Applied".'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear all filters</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
