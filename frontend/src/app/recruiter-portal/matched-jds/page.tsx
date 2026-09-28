'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
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
} from 'lucide-react';

interface MatchedJdItem {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  companyOrClient: string | null;
  jobUrl: string | null;
  rawJdText: string;
  verdict: 'APPLY' | 'SKIP';
  matchScore: number;
  matchReasoning: string;
  appliedAt: string;
}

export default function RecruiterMatchedJdsPage() {
  const [items, setItems] = useState<MatchedJdItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchMatchedJds = async () => {
    try {
      const data = await apiRequest('/analyze/matched-jds');
      setItems(data);
    } catch (err) {
      console.error('Failed to load matched JDs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatchedJds();
  }, []);

  const filtered = items.filter((item) => {
    const matchesSearch =
      item.jobTitle.toLowerCase().includes(search.toLowerCase()) ||
      (item.candidateName && item.candidateName.toLowerCase().includes(search.toLowerCase())) ||
      (item.companyOrClient && item.companyOrClient.toLowerCase().includes(search.toLowerCase()));
    const matchesVerdict = !verdictFilter || item.verdict === verdictFilter;
    return matchesSearch && matchesVerdict;
  });

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
            Repository of job evaluations saved via the JDMatcher Chrome Extension. Review match scores, Gemini reasoning, and candidate alignment.
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 backdrop-blur">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by job title, candidate name, or client..."
            className="ml-2.5 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
        </div>

        {/* Verdict Filter */}
        <select
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-300 outline-none"
        >
          <option value="">All Verdicts</option>
          <option value="APPLY">APPLY Only</option>
          <option value="SKIP">SKIP Only</option>
        </select>
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

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl transition hover:border-slate-700"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isApply
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {isApply ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {item.verdict}
                      </span>

                      <span className="text-xs font-black text-slate-200">
                        Score: <span className={item.matchScore >= 75 ? 'text-emerald-400' : 'text-amber-400'}>{item.matchScore}/100</span>
                      </span>

                      <h3 className="text-base font-bold text-white">{item.jobTitle}</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>Candidate: <b className="text-slate-200">{item.candidateName}</b></span>
                      {item.companyOrClient && (
                        <>
                          <span>•</span>
                          <span>Client: <b className="text-slate-200">{item.companyOrClient}</b></span>
                        </>
                      )}
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(item.appliedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
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
                      <span>{isExpanded ? 'Hide Details' : 'View AI Reasoning'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {/* Expanded AI Evaluation Reasoning and Raw JD */}
                {isExpanded && (
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 pt-4 border-t border-slate-800/80">
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-violet-400">
                        <Sparkles className="h-4 w-4" />
                        <span>AI Reasoning & Evaluation Criteria</span>
                      </div>
                      <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed scrollbar-thin">
                        {item.matchReasoning}
                      </pre>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <div className="mb-2 text-xs font-bold text-slate-400">
                        Raw Job Description Text
                      </div>
                      <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-400 leading-relaxed scrollbar-thin">
                        {item.rawJdText}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-500">
              <Briefcase className="mx-auto h-8 w-8 text-slate-600 mb-2" />
              <p className="text-sm">No matched JDs found matching your filter criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
