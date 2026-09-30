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
  Clock,
  Sparkles,
  Building2,
  Download,
  Copy,
  Check,
  User,
  RotateCcw,
} from 'lucide-react';

interface MatchedJdItem {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  companyOrClient: string | null;
  jobUrl: string | null;
  rawJdText: string;
  verdict: 'APPLY' | 'SKIP' | 'PENDING';
  matchScore: number;
  matchReasoning: string;
  appliedAt: string;
}

interface CandidateOption {
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

export default function RecruiterMatchedJdsPage() {
  const [items, setItems] = useState<MatchedJdItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedJdId, setCopiedJdId] = useState<string | null>(null);
  const [copiedReasoningId, setCopiedReasoningId] = useState<string | null>(null);
  const [updatingVerdictId, setUpdatingVerdictId] = useState<string | null>(null);

  const handleUpdateVerdict = async (id: string, newVerdict: 'APPLY' | 'SKIP') => {
    setUpdatingVerdictId(id);
    try {
      await apiRequest(`/analyze/matched-jds/${id}/verdict`, {
        method: 'PATCH',
        body: JSON.stringify({ verdict: newVerdict }),
      });
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              verdict: newVerdict,
              rawJdText: newVerdict === 'SKIP' ? '' : item.rawJdText,
            };
          }
          return item;
        })
      );
    } catch (err: any) {
      console.error('Failed to update verdict:', err);
    } finally {
      setUpdatingVerdictId(null);
    }
  };

  const fetchMatchedJds = async () => {
    try {
      const [jdsData, candidatesData] = await Promise.all([
        apiRequest('/analyze/matched-jds'),
        apiRequest('/candidates').catch(() => []),
      ]);
      setItems(jdsData);
      if (Array.isArray(candidatesData)) {
        setCandidates(candidatesData);
      }
    } catch (err) {
      console.error('Failed to load matched JDs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatchedJds();
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

  const handleExportExcel = () => {
    if (filtered.length === 0) return;

    const exportRows = filtered.map((item) => ({
      'Role / Position': getDisplayRole(item.jobTitle, item.rawJdText),
      'Company / Client': getDisplayCompany(item.companyOrClient, item.rawJdText),
      'Candidate': item.candidateName || 'N/A',
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
    XLSX.writeFile(workbook, `Matched_JDs_${today}.xlsx`);
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedCandidate('');
    setVerdictFilter('');
  };

  // Compile candidate options from both API and items
  const uniqueCandidateMap = new Map<string, string>();
  candidates.forEach((c) => uniqueCandidateMap.set(c.id, c.fullName));
  items.forEach((item) => {
    if (item.candidateId && item.candidateName) {
      uniqueCandidateMap.set(item.candidateId, item.candidateName);
    }
  });

  const filtered = items.filter((item) => {
    const role = getDisplayRole(item.jobTitle, item.rawJdText).toLowerCase();
    const company = getDisplayCompany(item.companyOrClient, item.rawJdText).toLowerCase();
    const candidate = (item.candidateName || '').toLowerCase();
    const rawJd = (item.rawJdText || '').toLowerCase();
    const q = search.toLowerCase();

    const matchesSearch =
      !q ||
      role.includes(q) ||
      company.includes(q) ||
      candidate.includes(q) ||
      rawJd.includes(q);

    const matchesCandidate =
      !selectedCandidate ||
      item.candidateId === selectedCandidate ||
      item.candidateName === selectedCandidate;

    const matchesVerdict = !verdictFilter || item.verdict === verdictFilter;

    return matchesSearch && matchesCandidate && matchesVerdict;
  });

  const hasActiveFilters = Boolean(search || selectedCandidate || verdictFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Agency Matched JDs</h1>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              {items.length} Evaluated
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Repository of job evaluations saved via the JDMatcher Chrome Extension. Filter, review match scores, export to Excel, and copy details.
          </p>
        </div>

        {/* Export to Excel Button */}
        <button
          onClick={handleExportExcel}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export matched jobs to Excel (.xlsx)"
        >
          <Download className="h-4 w-4" />
          <span>Export to Excel ({filtered.length})</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        {/* Search Bar */}
        <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 backdrop-blur sm:col-span-5">
          <Search className="h-4 w-4 text-slate-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by job title, company, candidate, or keywords..."
            className="ml-2.5 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
        </div>

        {/* Filter by Candidate */}
        <div className="sm:col-span-3">
          <div className="relative">
            <select
              value={selectedCandidate}
              onChange={(e) => setSelectedCandidate(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 pr-8 text-sm text-slate-300 outline-none focus:border-slate-700"
            >
              <option value="">All Candidates ({uniqueCandidateMap.size})</option>
              {Array.from(uniqueCandidateMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500" />
          </div>
        </div>

        {/* Verdict Filter */}
        <div className="sm:col-span-2">
          <div className="relative">
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 pr-8 text-sm text-slate-300 outline-none focus:border-slate-700"
            >
              <option value="">All Verdicts</option>
              <option value="PENDING">PENDING Only</option>
              <option value="APPLY">APPLY Only</option>
              <option value="SKIP">SKIP Only</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500" />
          </div>
        </div>

        {/* Reset Filters */}
        <div className="sm:col-span-2 flex items-center">
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-800/50 px-3 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Matched JDs List */}
      {isLoading ? (
        <div className="flex h-64 w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const isExpanded = expandedId === item.id;
            const isApply = item.verdict === 'APPLY';
            const isPending = item.verdict === 'PENDING';
            const isSkip = item.verdict === 'SKIP';
            const isUpdating = updatingVerdictId === item.id;
            const displayRole = getDisplayRole(item.jobTitle, item.rawJdText);
            const displayCompany = getDisplayCompany(item.companyOrClient, item.rawJdText);

            return (
              <div
                key={item.id}
                className={`rounded-2xl border bg-slate-900/60 p-5 backdrop-blur-xl transition ${
                  isPending ? 'border-amber-500/40 bg-amber-950/10' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isApply
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isPending
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {isApply && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {isPending && <Clock className="h-3.5 w-3.5" />}
                        {isSkip && <XCircle className="h-3.5 w-3.5" />}
                        {isPending ? 'PENDING DECISION' : isApply ? 'APPLIED' : 'NOT APPLIED'}
                      </span>

                      <span className="text-xs font-black text-slate-200">
                        Score: <span className={item.matchScore >= 75 ? 'text-emerald-400' : 'text-amber-400'}>{item.matchScore}/100</span>
                      </span>

                      {/* Prominent Extracted Company Badge */}
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
                        <Building2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span>{displayCompany}</span>
                      </span>
                    </div>

                    {/* Prominent Extracted Role Heading */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <Briefcase className="h-4 w-4 text-emerald-400 shrink-0" />
                      <h3 className="text-base font-bold text-white tracking-tight">
                        {displayRole}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-slate-500" />
                        Candidate: <b className="text-slate-200">{item.candidateName || 'Bench Candidate'}</b>
                      </span>
                      <span>•</span>
                      <span>Company / Client: <b className="text-indigo-300 font-semibold">{displayCompany}</b></span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(item.appliedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Requirement 2: Action buttons for jobs without verdict from extension */}
                    {isPending && (
                      <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-1">
                        <span className="px-2 text-[11px] font-semibold text-amber-300">Choose Action:</span>
                        <button
                          onClick={() => handleUpdateVerdict(item.id, 'APPLY')}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition active:scale-95 disabled:opacity-50"
                          title="Confirm applied to this job"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Applied</span>
                        </button>
                        <button
                          onClick={() => handleUpdateVerdict(item.id, 'SKIP')}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-600/90 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:bg-rose-500 transition active:scale-95 disabled:opacity-50"
                          title="Mark as not applied"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Not Applied</span>
                        </button>
                      </div>
                    )}

                    {/* Requirement 3: If already selected as Applied, recruiter can change mind to Not Applied */}
                    {isApply && (
                      <button
                        onClick={() => handleUpdateVerdict(item.id, 'SKIP')}
                        disabled={isUpdating}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
                        title="Change mind to Not Applied (raw JD will be purged)"
                      >
                        <XCircle className="h-3.5 w-3.5 text-rose-400" />
                        <span>Change to Not Applied</span>
                      </button>
                    )}

                    {item.jobUrl && (
                      <a
                        href={item.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Job Source</span>
                      </a>
                    )}

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                    >
                      <FileText className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{isExpanded ? 'Hide Details' : 'View AI Reasoning & JD'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {/* Expanded AI Evaluation Reasoning and Raw JD */}
                {isExpanded && (
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 pt-4 border-t border-slate-800/80">
                    {/* Left: AI Reasoning */}
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex flex-col justify-between">
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-violet-400">
                            <Sparkles className="h-4 w-4" />
                            <span>AI Reasoning & Evaluation</span>
                          </div>
                          <button
                            onClick={() => handleCopyText(item.matchReasoning, item.id, 'reasoning')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
                            title="Copy AI Reasoning"
                          >
                            {copiedReasoningId === item.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                <span className="text-emerald-400 font-semibold">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5 text-slate-400" />
                                <span>Copy Reasoning</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed scrollbar-thin">
                          {item.matchReasoning}
                        </pre>
                      </div>
                    </div>

                    {/* Right: Full Raw JD Text or Data Privacy Notice */}
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex flex-col justify-between">
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400">
                            Raw Job Description Text
                          </span>
                          {item.rawJdText && (
                            <button
                              onClick={() => handleCopyText(item.rawJdText, item.id, 'jd')}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition"
                              title="Copy full raw job description text"
                            >
                              {copiedJdId === item.id ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="font-semibold">Copied JD!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>Copy JD</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        {item.rawJdText ? (
                          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-400 leading-relaxed scrollbar-thin">
                            {item.rawJdText}
                          </pre>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
                            <XCircle className="mx-auto h-6 w-6 text-slate-600 mb-2" />
                            <p className="font-medium text-slate-300">Raw JD text omitted</p>
                            <p className="mt-1 text-slate-500">
                              Raw job description text was removed per data governance upon marking as Not Applied. Evaluation count and metrics are retained for agency reporting.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-500">
              <Briefcase className="mx-auto h-8 w-8 text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-400">No matched JDs found</p>
              <p className="mt-1 text-xs text-slate-500">
                {hasActiveFilters
                  ? 'Try adjusting your search query, candidate filter, or verdict filter.'
                  : 'Start matching jobs using the Chrome Extension and click "Save as Applied" to view them here.'}
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
      )}
    </div>
  );
}
