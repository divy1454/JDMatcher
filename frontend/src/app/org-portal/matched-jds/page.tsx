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
} from 'lucide-react';

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
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [selectedRecruiter, setSelectedRecruiter] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedJdId, setCopiedJdId] = useState<string | null>(null);
  const [copiedReasoningId, setCopiedReasoningId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [jdsData, candidatesData, recruitersData] = await Promise.all([
        apiRequest('/analyze/matched-jds'),
        apiRequest('/candidates').catch(() => []),
        apiRequest('/recruiters').catch(() => []),
      ]);
      setItems(jdsData);
      if (Array.isArray(candidatesData)) setCandidates(candidatesData);
      if (Array.isArray(recruitersData)) setRecruiters(recruitersData);
    } catch (err) {
      console.error('Failed to load matched JDs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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

  const resetFilters = () => {
    setSearch('');
    setSelectedCandidate('');
    setSelectedRecruiter('');
    setVerdictFilter('');
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

  const filtered = items.filter((item) => {
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

    return matchesSearch && matchesCandidate && matchesRecruiter && matchesVerdict;
  });

  const hasActiveFilters = Boolean(search || selectedCandidate || selectedRecruiter || verdictFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Agency Matched Job Descriptions</h1>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              {items.length} Evaluated
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Persistent repository of job postings evaluated by recruiters and saved with "Save as Applied". Filter by recruiter or candidate, export to Excel, and copy full descriptions.
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

      {/* Multi-Factor Filter Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        {/* Search */}
        <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 backdrop-blur sm:col-span-4">
          <Search className="h-4 w-4 text-slate-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search role, company, candidate, recruiter..."
            className="ml-2.5 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
        </div>

        {/* Filter by Candidate */}
        <div className="sm:col-span-3">
          <div className="group relative flex items-center rounded-xl border border-slate-800 bg-slate-900/60 transition-all duration-200 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 backdrop-blur">
            <User className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-500 transition-colors group-hover:text-indigo-400 group-focus-within:text-indigo-400" />
            <select
              value={selectedCandidate}
              onChange={(e) => setSelectedCandidate(e.target.value)}
              className="w-full appearance-none bg-transparent py-2.5 pl-9 pr-9 text-xs sm:text-sm font-medium text-slate-200 outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-slate-300">All Candidates ({uniqueCandidateMap.size})</option>
              {Array.from(uniqueCandidateMap.entries()).map(([id, name]) => (
                <option key={id} value={id} className="bg-slate-900 text-white">
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:text-indigo-400 group-hover:translate-y-0.5" />
          </div>
        </div>

        {/* Filter by Recruiter */}
        <div className="sm:col-span-3">
          <div className="group relative flex items-center rounded-xl border border-slate-800 bg-slate-900/60 transition-all duration-200 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 backdrop-blur">
            <Users className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-500 transition-colors group-hover:text-indigo-400 group-focus-within:text-indigo-400" />
            <select
              value={selectedRecruiter}
              onChange={(e) => setSelectedRecruiter(e.target.value)}
              className="w-full appearance-none bg-transparent py-2.5 pl-9 pr-9 text-xs sm:text-sm font-medium text-slate-200 outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-slate-300">All Recruiters ({uniqueRecruiterMap.size})</option>
              {Array.from(uniqueRecruiterMap.entries()).map(([id, name]) => (
                <option key={id} value={id} className="bg-slate-900 text-white">
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:text-indigo-400 group-hover:translate-y-0.5" />
          </div>
        </div>

        {/* Verdict Filter */}
        <div className="sm:col-span-2">
          <div className="group relative flex items-center rounded-xl border border-slate-800 bg-slate-900/60 transition-all duration-200 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 backdrop-blur">
            <Filter className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-slate-500 transition-colors group-hover:text-indigo-400 group-focus-within:text-indigo-400" />
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="w-full appearance-none bg-transparent py-2.5 pl-9 pr-9 text-xs sm:text-sm font-medium text-slate-200 outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-slate-300">All Verdicts</option>
              <option value="APPLY" className="bg-slate-900 text-emerald-300">✓ APPLY Only</option>
              <option value="SKIP" className="bg-slate-900 text-rose-300">✕ SKIP Only</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:text-indigo-400 group-hover:translate-y-0.5" />
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
        {isLoading ? (
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
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl transition hover:border-slate-700"
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

                      <span className="text-xs font-bold text-slate-300">
                        Score: {item.matchScore}%
                      </span>

                      {/* Prominent Extracted Company Badge */}
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
                        <Building2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span>{displayCompany}</span>
                      </span>
                    </div>

                    {/* Prominent Extracted Role Heading */}
                    <div className="flex items-center gap-2 pt-1.5">
                      <Briefcase className="h-4 w-4 text-emerald-400 shrink-0" />
                      <h3 className="text-base font-bold text-white tracking-tight">
                        {displayRole}
                      </h3>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-slate-500" />
                        Candidate: <strong className="text-slate-200">{item.candidateName || 'Bench Candidate'}</strong>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-slate-500" />
                        Recruiter: <strong className="text-indigo-300">{item.recruiterName || 'Agency Recruiter'}</strong>
                      </span>
                      <span>•</span>
                      <span>Company: <strong className="text-indigo-200">{displayCompany}</strong></span>
                    </div>

                    <p className="mt-2 text-xs text-slate-300 leading-relaxed max-w-3xl line-clamp-3">
                      {item.matchReasoning}
                    </p>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(item.appliedAt)}
                    </span>

                    <div className="flex items-center gap-2">
                      {item.jobUrl && (
                        <a
                          href={item.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white transition"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Link</span>
                        </a>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                      >
                        <FileText className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{isExpanded ? 'Hide Raw JD' : 'View Raw JD'}</span>
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
                        Raw Job Description Text Scraped from Extension
                      </label>
                      <button
                        onClick={() => handleCopyText(item.rawJdText, item.id, 'jd')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition"
                        title="Copy raw job description text"
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

        {!isLoading && filtered.length === 0 && (
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
