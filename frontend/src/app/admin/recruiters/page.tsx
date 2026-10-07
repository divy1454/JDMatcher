'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Laptop,
  RotateCcw,
  ShieldAlert,
  CheckCircle,
  Search,
  Clock,
  AlertTriangle,
  UserCheck,
  XCircle,
  FileText,
  Filter,
} from 'lucide-react';

interface RecruiterItem {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  organizationName: string;
  deviceId: string | null;
  deviceLastLockedAt: string | null;
  deviceSwitchAllowedAfter: string | null;
  deviceMonthlySwitchCount?: number;
  isActive: boolean;
  createdAt: string;
}

interface UnlockRequestItem {
  id: string;
  organizationId: string;
  organizationName: string | null;
  recruiterId: string;
  recruiterName: string;
  recruiterEmail: string;
  requestedDeviceId: string;
  currentDeviceId: string | null;
  reason: string | null;
  approvalTier: 'org_admin' | 'super_admin';
  status: 'pending' | 'approved' | 'rejected';
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export default function RecruitersHardwarePage() {
  const [activeTab, setActiveTab] = useState<'roster' | 'unlock_requests'>('roster');
  const [recruiters, setRecruiters] = useState<RecruiterItem[]>([]);
  const [unlockRequests, setUnlockRequests] = useState<UnlockRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Rejection modal state
  const [rejectModal, setRejectModal] = useState<{
    isOpen: boolean;
    requestId: string | null;
    recruiterName: string;
    reason: string;
  }>({
    isOpen: false,
    requestId: null,
    recruiterName: '',
    reason: '',
  });

  const fetchData = async () => {
    try {
      const [recruiterData, requestData] = await Promise.all([
        apiRequest('/recruiters'),
        apiRequest('/recruiters/unlock-requests').catch(() => []),
      ]);
      setRecruiters(recruiterData || []);
      setUnlockRequests(requestData || []);
    } catch (err: any) {
      console.error('Failed to load data:', err);
      setErrorMsg(err.message || 'Failed to load recruiter security records');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResetDevice = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to force-reset the hardware lock for ${name}? As Super Admin, this completely clears the machine binding and resets the monthly cooldown.`
      )
    ) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiRequest(`/recruiters/${id}/reset-device`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(''), 4500);
      await fetchData();
    } catch (err: any) {
      alert('Failed to reset device lock: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveUnlock = async (req: UnlockRequestItem) => {
    const isEscalated = req.approvalTier === 'super_admin';
    const confirmPrompt = isEscalated
      ? `Approve machine transfer for ${req.recruiterName}? (Note: This recruiter has exceeded their monthly 1-machine limit; Super Admin override will authorize this switch).`
      : `Approve machine transfer for ${req.recruiterName}?`;

    if (!confirm(confirmPrompt)) return;

    setActionLoading(true);
    try {
      const res = await apiRequest(`/recruiters/unlock-requests/${req.id}/approve`, {
        method: 'POST',
      });
      setSuccessMsg(res.message || `Unlocked machine for ${req.recruiterName}`);
      setTimeout(() => setSuccessMsg(''), 5000);
      await fetchData();
    } catch (err: any) {
      alert('Approval failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModal.requestId) return;

    setActionLoading(true);
    try {
      const res = await apiRequest(`/recruiters/unlock-requests/${rejectModal.requestId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectModal.reason }),
      });
      setSuccessMsg(res.message || 'Unlock request rejected');
      setTimeout(() => setSuccessMsg(''), 4500);
      setRejectModal({ isOpen: false, requestId: null, recruiterName: '', reason: '' });
      await fetchData();
    } catch (err: any) {
      alert('Rejection failed: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const pendingRequests = unlockRequests.filter((r) => r.status === 'pending');
  const superAdminEscalations = pendingRequests.filter((r) => r.approvalTier === 'super_admin');

  const filteredRecruiters = recruiters.filter(
    (r) =>
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase()) ||
      (r.organizationName && r.organizationName.toLowerCase().includes(search.toLowerCase())) ||
      (r.deviceId && r.deviceId.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredRequests = unlockRequests.filter(
    (r) =>
      r.recruiterName.toLowerCase().includes(search.toLowerCase()) ||
      r.recruiterEmail.toLowerCase().includes(search.toLowerCase()) ||
      (r.organizationName && r.organizationName.toLowerCase().includes(search.toLowerCase())) ||
      (r.requestedDeviceId && r.requestedDeviceId.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Recruiters & Machine Locking
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enforce physical device identity (<code className="text-xs font-mono font-bold">x-device-id</code>), review monthly machine change requests, and arbitrate escalated approvals.
          </p>
        </div>
      </div>

      {/* Escalation Alert Banner */}
      {superAdminEscalations.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-4 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <h4 className="font-semibold text-sm">
              {superAdminEscalations.length} Escalated Machine Change Request{superAdminEscalations.length > 1 ? 's' : ''} Pending Super Admin Approval
            </h4>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Recruiters who exceed 1 machine change within a 30-day window cannot be approved by Organization Admins and require Super Admin authorization.
            </p>
            <button
              onClick={() => setActiveTab('unlock_requests')}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-amber-700 transition"
            >
              Review Escalated Requests ({superAdminEscalations.length})
            </button>
          </div>
        </div>
      )}

      {/* Notifications */}
      {successMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-3.5 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/20 p-3.5 text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tab Controls & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('roster')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'roster'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Laptop className="h-4 w-4" />
            <span>Machine Roster ({recruiters.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('unlock_requests')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'unlock_requests'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Unlock Requests</span>
            {pendingRequests.length > 0 && (
              <span className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
                superAdminEscalations.length > 0
                  ? 'bg-amber-500 text-white'
                  : 'bg-indigo-600 text-white'
              }`}>
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Search Input */}
        <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 text-sm shadow-sm">
          <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === 'roster'
                ? 'Search recruiter, agency, or hardware ID...'
                : 'Search requests by recruiter or agency...'
            }
            className="ml-2 w-64 sm:w-80 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
          />
        </div>
      </div>

      {/* TAB 1: MACHINE ROSTER */}
      {activeTab === 'roster' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">Recruiter</th>
                  <th className="px-6 py-4">Agency</th>
                  <th className="px-6 py-4">Hardware Fingerprint</th>
                  <th className="px-6 py-4">Lock Status</th>
                  <th className="px-6 py-4">Monthly Switch Limit</th>
                  <th className="px-6 py-4">Next Transfer Allowed</th>
                  <th className="px-6 py-4 text-right">Master Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                {filteredRecruiters.map((r) => {
                  const isLocked = Boolean(r.deviceId);
                  const now = new Date();
                  const canSwitch = !r.deviceSwitchAllowedAfter || now >= new Date(r.deviceSwitchAllowedAfter);
                  const switchCount = canSwitch ? 0 : (r.deviceMonthlySwitchCount || 0);

                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{r.fullName}</p>
                          <p className="text-xs text-slate-500">{r.email}</p>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{r.organizationName || '—'}</span>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs">
                        {r.deviceId ? (
                          <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {r.deviceId.slice(0, 20)}...
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic">Unbound (Binds on 1st login)</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                            <Laptop className="h-3 w-3" />
                            <span>Machine Locked</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <span>Unassigned</span>
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
                            switchCount >= 1
                              ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50'
                              : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50'
                          }`}
                        >
                          {switchCount >= 1 ? '1/1 used in 30d' : '0/1 used in 30d'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-xs">
                        {r.deviceSwitchAllowedAfter ? (
                          canSwitch ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Eligible (Cooldown Expired)</span>
                          ) : (
                            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Locked until {formatDate(r.deviceSwitchAllowedAfter)}</span>
                            </div>
                          )
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">Eligible (Never transferred)</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {isLocked && (
                          <button
                            onClick={() => handleResetDevice(r.id, r.fullName)}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-50 dark:bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400 transition hover:bg-red-100 dark:hover:bg-red-500/20 disabled:opacity-50"
                            title="Force clear hardware lock and reset monthly count (Super Admin override)"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Force Reset</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredRecruiters.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
                      No recruiters match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: UNLOCK REQUESTS */}
      {activeTab === 'unlock_requests' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">Recruiter</th>
                  <th className="px-6 py-4">Agency</th>
                  <th className="px-6 py-4">Requested Machine</th>
                  <th className="px-6 py-4">Reason / Justification</th>
                  <th className="px-6 py-4">Approval Tier</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                {filteredRequests.map((req) => {
                  const isPending = req.status === 'pending';
                  const isSuperAdminTier = req.approvalTier === 'super_admin';

                  return (
                    <tr
                      key={req.id}
                      className={`transition ${
                        isPending && isSuperAdminTier
                          ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{req.recruiterName}</p>
                          <p className="text-xs text-slate-500">{req.recruiterEmail}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            Requested {formatDate(req.createdAt)}
                          </p>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{req.organizationName || '—'}</span>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs">
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {req.requestedDeviceId.slice(0, 18)}...
                        </span>
                      </td>

                      <td className="px-6 py-4 text-xs max-w-xs">
                        <p className="text-slate-600 dark:text-slate-300 italic truncate" title={req.reason || ''}>
                          "{req.reason || 'No description provided'}"
                        </p>
                        {req.rejectionReason && (
                          <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                            Rejection note: {req.rejectionReason}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {isSuperAdminTier ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-100 dark:bg-amber-950/50 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Super Admin Escalation (&gt;1/mo)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                            <span>Standard (Org Admin / Super)</span>
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {req.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                            <Clock className="h-3 w-3" />
                            <span>Pending Review</span>
                          </span>
                        ) : req.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle className="h-3 w-3" />
                            <span>Approved</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-50 dark:bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
                            <XCircle className="h-3 w-3" />
                            <span>Rejected</span>
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApproveUnlock(req)}
                              disabled={actionLoading}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() =>
                                setRejectModal({
                                  isOpen: true,
                                  requestId: req.id,
                                  recruiterName: req.recruiterName,
                                  reason: '',
                                })
                              }
                              disabled={actionLoading}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-50 dark:bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {req.reviewedAt ? `Processed ${formatDate(req.reviewedAt)}` : 'Completed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredRequests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
                      No machine unlock requests recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Reject Machine Unlock</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Provide a reason for denying the machine switch for{' '}
              <strong className="text-slate-700 dark:text-slate-300">{rejectModal.recruiterName}</strong>.
            </p>

            <form onSubmit={handleRejectUnlockSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Rejection Reason / Guidance
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectModal.reason}
                  onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                  placeholder="e.g. Unverified physical hardware location, or transfer not approved by agency management."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModal({ isOpen: false, requestId: null, recruiterName: '', reason: '' })}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-500 transition disabled:opacity-50"
                >
                  {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
