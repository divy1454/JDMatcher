'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Users,
  Search,
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  Edit2,
  X,
  Check,
  Trash2,
} from 'lucide-react';

interface CandidateItem {
  id: string;
  fullName: string;
  primaryTitle: string;
  isActive: boolean;
  createdAt: string;
  resumeLength?: number;
  rawResumeText?: string;
}

export default function RecruiterCandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedResumeId, setExpandedResumeId] = useState<string | null>(null);

  // Modal State for Add & Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form State - strictly Full Name, Primary Role, Raw Resume Text
  const [formData, setFormData] = useState({
    fullName: '',
    primaryTitle: '',
    rawResumeText: '',
  });

  const fetchCandidates = async () => {
    try {
      const data = await apiRequest('/candidates');
      setCandidates(data);
    } catch (err) {
      console.error('Failed to load candidates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  const openAddModal = () => {
    setEditingCandidateId(null);
    setFormData({
      fullName: '',
      primaryTitle: '',
      rawResumeText: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = async (c: CandidateItem) => {
    setEditingCandidateId(c.id);
    let fullResume = c.rawResumeText || '';
    if (!fullResume) {
      try {
        const full = await apiRequest(`/candidates/${c.id}`);
        fullResume = full.rawResumeText || '';
      } catch (err) {
        console.error('Failed to fetch full candidate resume:', err);
      }
    }

    setFormData({
      fullName: c.fullName,
      primaryTitle: c.primaryTitle,
      rawResumeText: fullResume,
    });
    setIsModalOpen(true);
  };

  const handleSaveCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);

    const payload = {
      fullName: formData.fullName.trim(),
      primaryTitle: formData.primaryTitle.trim(),
      rawResumeText: formData.rawResumeText.trim(),
    };

    try {
      if (editingCandidateId) {
        await apiRequest(`/candidates/${editingCandidateId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/candidates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setIsModalOpen(false);
      await fetchCandidates();
    } catch (err: any) {
      alert('Failed to save candidate: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete candidate "${name}"?`)) return;
    try {
      await apiRequest(`/candidates/${id}`, { method: 'DELETE' });
      await fetchCandidates();
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
      c.primaryTitle.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">My Talent Bench</h1>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              {candidates.length} Profiles
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Private candidate pool accessible by you. These candidates sync automatically into your Chrome Extension for job matching.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:from-emerald-500 hover:to-teal-500"
        >
          <Plus className="h-4 w-4" />
          <span>Add Candidate</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 backdrop-blur">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search candidates by name or role title..."
          className="ml-2.5 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
        />
      </div>

      {/* Candidates List */}
      {isLoading ? (
        <div className="flex h-64 w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((candidate) => {
            const isExpanded = expandedResumeId === candidate.id;

            return (
              <div
                key={candidate.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl transition hover:border-slate-700"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-bold text-white">{candidate.fullName}</h3>
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                        {candidate.primaryTitle}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                      <span>Added {formatDate(candidate.createdAt)}</span>
                      <span>•</span>
                      <span>{candidate.resumeLength ? `${candidate.resumeLength} chars resume` : 'Resume attached'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(candidate)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white"
                      title="Edit Candidate Details"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => toggleResume(candidate.id)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                    >
                      <FileText className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{isExpanded ? 'Hide Resume' : 'View Resume'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    <button
                      onClick={() => handleDelete(candidate.id, candidate.fullName)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition"
                      title="Delete Candidate"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Raw Resume Text */}
                {isExpanded && (
                  <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-400">
                      <span>Candidate Raw Resume</span>
                      <span className="font-mono text-[10px] text-slate-500">ID: {candidate.id}</span>
                    </div>
                    <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-slate-300 leading-relaxed scrollbar-thin">
                      {candidate.rawResumeText || 'No resume text available for this candidate.'}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-500">
              <Users className="mx-auto h-8 w-8 text-slate-600 mb-2" />
              <p className="text-sm">No bench candidates found.</p>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Candidate Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white">
                {editingCandidateId ? 'Edit Candidate Profile' : 'Add Candidate Profile'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCandidate} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">Primary Role</label>
                  <input
                    type="text"
                    required
                    value={formData.primaryTitle}
                    onChange={(e) => setFormData({ ...formData, primaryTitle: e.target.value })}
                    placeholder="e.g. Senior Java Backend Engineer"
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Raw Resume Text
                </label>
                <p className="text-[11px] text-slate-500 mb-1.5">
                  Paste the full candidate resume. The natural-fit blueprint matches qualifications directly from this content.
                </p>
                <textarea
                  required
                  rows={8}
                  value={formData.rawResumeText}
                  onChange={(e) => setFormData({ ...formData, rawResumeText: e.target.value })}
                  placeholder="Paste candidate resume here (work history, tech stack, certifications)..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs font-mono text-white placeholder-slate-500 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>{editingCandidateId ? 'Update Candidate' : 'Save Candidate'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
