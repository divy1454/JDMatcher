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
  Copy,
  Check,
  RotateCcw,
  RefreshCw,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { CustomDropdown, DropdownOption } from '@/components/ui/CustomDropdown';

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
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const [expandedResumeId, setExpandedResumeId] = useState<string | null>(null);
  const [copiedResumeId, setCopiedResumeId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  const handleCopyResume = async (resumeText: string, id: string) => {
    if (!resumeText) return;
    try {
      await navigator.clipboard.writeText(resumeText);
      setCopiedResumeId(id);
      setTimeout(() => setCopiedResumeId(null), 2000);
    } catch (err) {
      console.error('Failed to copy resume:', err);
    }
  };

  // Form State - strictly Full Name, Primary Role, Recruiter Assign, Raw Resume
  const [formData, setFormData] = useState({
    fullName: '',
    primaryTitle: '',
    createdByRecruiterId: '',
    rawResumeText: '',
  });

  const fetchData = async (silent = false) => {
    if (!silent) {
      if (candidates.length === 0) setIsInitialLoading(true);
      else setIsRefreshing(true);
    }
    try {
      const [candData, recData] = await Promise.all([
        apiRequest('/candidates'),
        apiRequest('/recruiters').catch(() => []),
      ]);
      setCandidates((prev) => {
        const prevResumeMap = new Map(prev.map((c) => [c.id, c.rawResumeText]));
        return (Array.isArray(candData) ? candData : []).map((c: CandidateItem) => ({
          ...c,
          rawResumeText: prevResumeMap.get(c.id) || c.rawResumeText,
        }));
      });
      if (Array.isArray(recData)) setRecruiters(recData);
      setLastSynced(new Date());
    } catch (err) {
      console.error('Failed to load candidates data:', err);
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

  const resetFilters = () => {
    setSearch('');
    setRecruiterFilter('');
    setAssignmentFilter('');
    setSortBy('newest');
  };

  const filtered = candidates
    .filter((c) => {
      const matchesSearch =
        c.fullName.toLowerCase().includes(search.toLowerCase()) ||
        c.primaryTitle.toLowerCase().includes(search.toLowerCase()) ||
        (c.recruiterName && c.recruiterName.toLowerCase().includes(search.toLowerCase()));

      const matchesRecruiter =
        !recruiterFilter ||
        (recruiterFilter === 'unassigned'
          ? !c.createdByRecruiterId
          : c.createdByRecruiterId === recruiterFilter);

      let matchesAssignment = true;
      if (assignmentFilter === 'assigned') matchesAssignment = Boolean(c.createdByRecruiterId);
      else if (assignmentFilter === 'unassigned') matchesAssignment = !c.createdByRecruiterId;

      return matchesSearch && matchesRecruiter && matchesAssignment;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'name-asc') {
        return a.fullName.localeCompare(b.fullName);
      }
      if (sortBy === 'name-desc') {
        return b.fullName.localeCompare(a.fullName);
      }
      if (sortBy === 'resume-len') {
        return (b.resumeLength || 0) - (a.resumeLength || 0);
      }
      return 0;
    });

  const recruiterFilterOptions: DropdownOption[] = [
    { value: '', label: 'All Recruiters' },
    { value: 'unassigned', label: 'Unassigned Only', badge: '⚡ Open', color: 'text-amber-300' },
    ...recruiters.map((r) => ({
      value: r.id,
      label: `Assigned: ${r.fullName}`,
      sublabel: r.email,
    })),
  ];

  const assignmentDropdownOptions: DropdownOption[] = [
    { value: '', label: 'All Assignment Status' },
    { value: 'assigned', label: 'Assigned to Recruiter', badge: 'Assigned', color: 'text-emerald-400' },
    { value: 'unassigned', label: 'Unassigned / Open Bench', badge: 'Open', color: 'text-amber-400' },
  ];

  const sortDropdownOptions: DropdownOption[] = [
    { value: 'newest', label: 'Sort: Newest Added' },
    { value: 'oldest', label: 'Sort: Oldest Added' },
    { value: 'name-asc', label: 'Sort: Name (A - Z)' },
    { value: 'name-desc', label: 'Sort: Name (Z - A)' },
    { value: 'resume-len', label: 'Sort: Resume Length' },
  ];

  const candidateAssignmentOptions: DropdownOption[] = [
    { value: '', label: 'Unassigned', badge: '⚡ Open', color: 'text-slate-400' },
    ...recruiters.map((r) => ({
      value: r.id,
      label: r.fullName,
      sublabel: r.email,
    })),
  ];

  const modalAssignmentOptions: DropdownOption[] = [
    { value: '', label: 'Leave Unassigned', badge: '⚡ Open', color: 'text-slate-400' },
    ...recruiters.map((r) => ({
      value: r.id,
      label: r.fullName,
      sublabel: r.email,
    })),
  ];

  const hasActiveFilters = Boolean(
    search || recruiterFilter || assignmentFilter || sortBy !== 'newest'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Talent Profiles</h1>
            <span className="rounded-full bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:text-violet-400">
              {filtered.length !== candidates.length ? `${filtered.length} of ${candidates.length} Profiles` : `${candidates.length} Profiles`}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage candidates and recruiter assignments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData(false)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-xs"
            title="Silent background live sync every 10 seconds"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-violet-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Live Sync</span>
            {lastSynced && (
              <span className="hidden sm:inline text-[10px] text-slate-400">
                • {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:from-violet-500 hover:to-indigo-500"
          >
            <Plus className="h-4 w-4" />
            <span>Add Candidate</span>
          </button>
        </div>
      </div>

      {/* Multi-Factor Filter and Search Bar */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          {/* Search */}
          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3.5 py-2 shadow-xs backdrop-blur sm:col-span-4">
            <Search className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidate by name, title, or recruiter..."
              className="ml-2.5 w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
            />
          </div>

          {/* Recruiter Filter Dropdown */}
          <div className="sm:col-span-3">
            <CustomDropdown
              value={recruiterFilter}
              onChange={setRecruiterFilter}
              options={recruiterFilterOptions}
              icon={<Users className="h-4 w-4" />}
              placeholder="Filter by Recruiter"
            />
          </div>

          {/* Assignment Status Filter */}
          <div className="sm:col-span-3">
            <CustomDropdown
              value={assignmentFilter}
              onChange={setAssignmentFilter}
              options={assignmentDropdownOptions}
              icon={<Filter className="h-4 w-4" />}
              placeholder="Filter by Status"
            />
          </div>

          {/* Sort By Dropdown */}
          <div className="sm:col-span-2">
            <CustomDropdown
              value={sortBy}
              onChange={setSortBy}
              options={sortDropdownOptions}
              icon={<ArrowUpDown className="h-3.5 w-3.5" />}
              placeholder="Sort By"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Showing {filtered.length} of {candidates.length} talent profiles</span>
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 font-semibold text-violet-400 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Clear filters</span>
            </button>
          </div>
        )}
      </div>

      {/* Candidates List */}
      <div className="space-y-3">
        {isInitialLoading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-12 text-center text-slate-500 shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent mb-3" />
            Loading talent profiles...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-12 text-center text-slate-500 shadow-sm">
            <Users className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No candidates match the filter criteria.</p>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-400 hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear all filters</span>
              </button>
            )}
          </div>
        ) : (
          filtered.map((candidate) => {
            const isExpanded = expandedResumeId === candidate.id;

            return (
              <div
                key={candidate.id}
                className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm dark:shadow-none transition hover:border-slate-300 dark:hover:border-slate-700 hover:z-20 focus-within:z-30 [&:has([aria-expanded='true'])]:z-40"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{candidate.fullName}</h3>
                      <span className="rounded-md border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                        {candidate.primaryTitle}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>Added {formatDate(candidate.createdAt)}</span>
                      <span>•</span>
                      <span>{candidate.resumeLength ? `${candidate.resumeLength} chars resume` : 'Resume attached'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Recruiter Assignment Dropdown */}
                    <div className="w-48 sm:w-56">
                      <CustomDropdown
                        size="sm"
                        disabled={reassigningId === candidate.id}
                        value={candidate.createdByRecruiterId || ''}
                        onChange={(val) => handleReassignRecruiter(candidate.id, val)}
                        options={candidateAssignmentOptions}
                        icon={<UserCheck className="h-3.5 w-3.5 text-violet-500" />}
                        placeholder="Assign Recruiter"
                      />
                    </div>

                    {/* View/Hide Resume Button */}
                    <button
                      onClick={() => toggleResume(candidate.id)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition shadow-xs"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>{isExpanded ? 'Hide Resume' : 'View Resume'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDelete(candidate.id, candidate.fullName)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition"
                      title="Delete Candidate"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Hidden / Collapsible Raw Resume Block with Copy Button */}
                {isExpanded && (
                  <div className="mt-4 border-t border-slate-200 dark:border-slate-800/80 pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Candidate Resume
                      </label>
                      <button
                        onClick={() => handleCopyResume(candidate.rawResumeText || '', candidate.id)}
                        disabled={!candidate.rawResumeText}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition disabled:opacity-50 shadow-xs"
                        title="Copy full candidate resume"
                      >
                        {copiedResumeId === candidate.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">Copied Resume!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Copy Resume</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 font-mono text-xs text-slate-800 dark:text-slate-300">
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
          <div className="my-8 w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add Candidate Profile</h3>

            <form onSubmit={handleCreateCandidate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="e.g. Vikram Sharma"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Primary Role</label>
                <input
                  type="text"
                  required
                  value={formData.primaryTitle}
                  onChange={(e) => setFormData({ ...formData, primaryTitle: e.target.value })}
                  placeholder="e.g. Senior Full Stack Engineer"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Assign to Recruiter</label>
                <CustomDropdown
                  value={formData.createdByRecruiterId}
                  onChange={(val) => setFormData({ ...formData, createdByRecruiterId: val })}
                  options={modalAssignmentOptions}
                  icon={<UserCheck className="h-4 w-4 text-violet-500" />}
                  placeholder="Assign to Recruiter"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Resume Content
                </label>
                <textarea
                  rows={8}
                  required
                  value={formData.rawResumeText}
                  onChange={(e) => setFormData({ ...formData, rawResumeText: e.target.value })}
                  placeholder="Paste candidate's resume..."
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs text-slate-900 dark:text-white outline-none focus:border-violet-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
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
