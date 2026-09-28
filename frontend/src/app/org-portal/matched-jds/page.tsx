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

export default function MatchedJdsPage() {
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Agency Matched Job Descriptions</h1>
        <p className="mt-1 text-sm text-slate-400">
          Persistent repository of job postings evaluated by recruiters and saved with "Save as Applied".
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 backdrop-blur">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by job title, candidate, or client..."
            className="ml-2 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
        </div>

        <select
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 outline-none"
        >
          <option value="">All Verdicts</option>
          <option value="APPLY">APPLY Only</option>
          <option value="SKIP">SKIP Only</option>
        </select>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((item) => {
          const isExpanded = expandedId === item.id;
          const isApply = item.verdict === 'APPLY';

          return (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl transition hover:border-slate-700"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
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
                    {item.companyOrClient && (
                      <span className="text-xs font-medium text-slate-400">
                        • Client: <strong className="text-slate-200">{item.companyOrClient}</strong>
                      </span>
                    )}
                  </div>

                  <h3 className="mt-1.5 text-base font-bold text-white">{item.jobTitle}</h3>
                  <p className="text-xs text-indigo-400 font-medium">
                    Matched Candidate: {item.candidateName || 'Bench Candidate'}
                  </p>
                  <p className="mt-2 text-xs text-slate-300 leading-relaxed max-w-3xl">
                    {item.matchReasoning}
                  </p>
                </div>

                <div className="flex flex-col sm:items-end gap-2 shrink-0">
                  <span className="text-xs text-slate-500">{formatDate(item.appliedAt)}</span>

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
                      <FileText className="h-3.5 w-3.5" />
                      <span>{isExpanded ? 'Hide Raw JD' : 'Raw JD'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Raw JD text block */}
              {isExpanded && (
                <div className="mt-4 border-t border-slate-800/80 pt-4">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Raw Job Description Text Scraped from Extension
                  </label>
                  <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300">
                    {item.rawJdText}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-500">
            No matched JDs found. Recruiters can save evaluations from the Chrome Extension using "Save as Applied".
          </div>
        )}
      </div>
    </div>
  );
}
