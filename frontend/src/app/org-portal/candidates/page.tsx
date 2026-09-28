'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Users,
  Plus,
  Search,
  FileText,
  ChevronDown,
  ChevronUp,
  Trash2,
  UserCheck,
  Briefcase,
  UserPlus,
} from 'lucide-react';

interface CandidateItem {
  id: string;
  fullName: string;
  primaryTitle: string;
  createdByRecruiterId: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  isActive: boolean;
  createdAt: string;
  resumeLength?: number;
  rawResumeText?: string;
}

interface RecruiterOption {
  id: string;
  fullName: string;
  email: string;
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState('');
  const [expandedResumeId, setExpandedResumeId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  // Form State - strictly Full Name, Primary Role, Recruiter Assign, Raw Resume
  const [formData, setFormData] = useState({
    fullName: '',
    primaryTitle: '',
    createdByRecruiterId: '',
    rawResumeText: '',
  });

  const fetchData = async () => {
    try {
      const [candData, recData] = await Promise.all([
        apiRequest('/candidates'),
        apiRequest('/recruiters').catch(() => []),
      ]);
      setCandidates(candData);
      setRecruiters(recData);
    } catch (err) {
      console.error('Failed to load candidates data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);

    try {
      await apiRequest('/candidates', {
        method: 'POST',
        body: JSON.stringify({
          fullName: formData.fullName.trim(),
          primaryTitle: formData.primaryTitle.trim(),
          createdByRecruiterId: formData.createdByRecruiterId || null,
          rawResumeText: formData.rawResumeText.trim(),
        }),
      });

      setIsModalOpen(false);
      setFormData({
        fullName: '',
        primaryTitle: '',
        createdByRecruiterId: '',
        rawResumeText: '',
      });
      await fetchData();
    } catch (err: any) {
      alert('Failed to add candidate: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReassignRecruiter = async (candidateId: string, newRecruiterId: string) => {
    setReassigningId(candidateId);
    try {
      await apiRequest(`/candidates/${candidateId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          createdByRecruiterId: newRecruiterId || null,
        }),
      });
      await fetchData();
    } catch (err: any) {
      alert('Failed to reassign recruiter: ' + err.message);
    } finally {
      setReassigningId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete candidate profile "${name}"?`)) return;
    try {
      await apiRequest(`/candidates/${id}`, { method: 'DELETE' });
      await fetchData();
    } catch (err: any) {
      alert('Failed to delete candidate: ' + err.message);
    }
  };

  const toggleResume = async (id: string) => {
    if (expandedResumeId === id) {
      setExpandedResumeId(null);
      return;
    }
    try {
      const full = await apiRequest(`/candidates/${id}`);
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, rawResumeText: full.rawResumeText } : c))
      );
      setExpandedResumeId(id);
    } catch (err) {
      console.error('Failed to load resume text:', err);
    }
  };

  const filtered = candidates.filter((c) => {
    const matchesSearch =
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.primaryTitle.toLowerCase().includes(search.toLowerCase()) ||
      (c.recruiterName && c.recruiterName.toLowerCase().includes(search.toLowerCase()));

    const matchesRecruiter =
      !recruiterFilter ||
      (recruiterFilter === 'unassigned'
        ? !c.createdByRecruiterId
        : c.createdByRecruiterId === recruiterFilter);

    return matchesSearch && matchesRecruiter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Talent Profiles</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage candidates and assign them to dedicated recruiters. Recruiters only access their assigned profiles in the Chrome Extension.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:from-violet-500 hover:to-indigo-500"
        >
          <Plus className="h-4 w-4" />
          <span>Add Candidate</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 backdrop-blur">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidate by name, title, or recruiter..."
            className="ml-2 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
        </div>

        {/* Recruiter Filter Dropdown */}
        <select
          value={recruiterFilter}
          onChange={(e) => setRecruiterFilter(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 outline-none"
        >
          <option value="">All Recruiters</option>
          <option value="unassigned">Unassigned Only</option>
          {recruiters.map((r) => (
            <option key={r.id} value={r.id}>
              Assigned to: {r.fullName}
            </option>
          ))}
        </select>
      </div>

      {/* Candidates List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-500">
            Loading talent profiles...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-500">
            No candidates match the filter criteria.
          </div>
        ) : (
          filtered.map((candidate) => {
            const isExpanded = expandedResumeId === candidate.id;

            return (
              <div
                key={candidate.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl transition hover:border-slate-700"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-bold text-white">{candidate.fullName}</h3>
                      <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-300">
                        {candidate.primaryTitle}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>Added {formatDate(candidate.createdAt)}</span>
                      <span>•</span>
                      <span>{candidate.resumeLength ? `${candidate.resumeLength} chars resume` : 'Resume attached'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Recruiter Assignment Dropdown */}
                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-violet-400" />
                      <span className="text-xs text-slate-400">Assigned:</span>
                      <select
                        disabled={reassigningId === candidate.id}
                        value={candidate.createdByRecruiterId || ''}
                        onChange={(e) => handleReassignRecruiter(candidate.id, e.target.value)}
                        className="bg-transparent text-xs font-medium text-slate-200 outline-none disabled:opacity-50 cursor-pointer"
                      >
                        <option value="" className="bg-slate-900 text-slate-400">
                          Unassigned
                        </option>
                        {recruiters.map((r) => (
                          <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                            {r.fullName} ({r.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* View/Hide Resume Button */}
                    <button
                      onClick={() => toggleResume(candidate.id)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>{isExpanded ? 'Hide Resume' : 'View Resume'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDelete(candidate.id, candidate.fullName)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition"
                      title="Delete Candidate"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Hidden / Collapsible Raw Resume Block */}
                {isExpanded && (
                  <div className="mt-4 border-t border-slate-800/80 pt-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Raw Candidate Resume (Fed into Natural Fit Blueprint)
                    </label>
                    <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300">
                      {candidate.rawResumeText || 'Loading resume text...'}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Candidate Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-8 w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Add Candidate Profile</h3>
            <p className="mt-1 text-xs text-slate-400">
              Only Full Name, Primary Role, and Resume are required. Assign to a recruiter so they can evaluate against job postings.
            </p>

            <form onSubmit={handleCreateCandidate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="e.g. Vikram Sharma"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Primary Role</label>
                <input
                  type="text"
                  required
                  value={formData.primaryTitle}
                  onChange={(e) => setFormData({ ...formData, primaryTitle: e.target.value })}
                  placeholder="e.g. Senior Full Stack Engineer"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Assign to Recruiter</label>
                <select
                  value={formData.createdByRecruiterId}
                  onChange={(e) => setFormData({ ...formData, createdByRecruiterId: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-violet-500"
                >
                  <option value="">Leave Unassigned</option>
                  {recruiters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fullName} ({r.email})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Assigned recruiters will immediately see this candidate in their Chrome Extension candidate dropdown.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Raw Resume Text
                </label>
                <textarea
                  rows={8}
                  required
                  value={formData.rawResumeText}
                  onChange={(e) => setFormData({ ...formData, rawResumeText: e.target.value })}
                  placeholder="Paste complete raw text of the candidate's resume..."
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-white outline-none focus:border-violet-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Candidate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
