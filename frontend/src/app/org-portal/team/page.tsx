'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  UserCheck,
  Plus,
  Laptop,
  RotateCcw,
  Clock,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  X,
  ShieldAlert,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface RecruiterItem {
  id: string;
  fullName: string;
  email: string;
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
  organizationName?: string;
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

export default function RecruiterTeamPage() {
  const [team, setTeam] = useState<RecruiterItem[]>([]);
  const [unlockRequests, setUnlockRequests] = useState<UnlockRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [modalError, setModalError] = useState('');
  const [activeTab, setActiveTab] = useState<'team' | 'requests'>('team');

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
  });

  const fetchData = async () => {
    try {
      const [teamData, requestsData] = await Promise.all([
        apiRequest('/recruiters'),
        apiRequest('/recruiters/unlock-requests').catch(() => []),
      ]);
      setTeam(teamData || []);
      setUnlockRequests(requestsData || []);
    } catch (err) {
      console.error('Failed to load team data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateRecruiter = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setModalError('');

    try {
      await apiRequest('/recruiters', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      setIsModalOpen(false);
      setFormData({ fullName: '', email: '', password: '' });
      setMsg('Recruiter seat provisioned successfully!');
      setTimeout(() => setMsg(''), 4000);
      await fetchData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to provision recruiter');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetDevice = async (r: RecruiterItem) => {
    const now = new Date();
    const canTransfer = !r.deviceSwitchAllowedAfter || now >= new Date(r.deviceSwitchAllowedAfter);
    const switchCount = canTransfer ? 0 : (r.deviceMonthlySwitchCount || 0);

    if (switchCount >= 1) {
      alert(
        `Monthly Limit Exceeded: Recruiter ${r.fullName} has already changed machines once within the past 30 days (locked until ${
          r.deviceSwitchAllowedAfter ? new Date(r.deviceSwitchAllowedAfter).toLocaleDateString() : '30 days'
        }). According to security policy, additional machine changes must be authorized by Super Admin.`
      );
      return;
    }

    if (!confirm(`Reset physical machine lock for ${r.fullName}? Next login will auto-bind to their new physical computer.`)) return;

    try {
      const res = await apiRequest(`/recruiters/${r.id}/reset-device`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMsg(res.message);
      setTimeout(() => setMsg(''), 4000);
      await fetchData();
    } catch (err: any) {
      alert('Failed to reset lock: ' + err.message);
    }
  };

  const handleApproveRequest = async (req: UnlockRequestItem) => {
    if (req.approvalTier === 'super_admin') {
      alert('This recruiter has already changed machines this month. Super Admin authorization is required to approve this request.');
      return;
    }

    if (!confirm(`Approve machine transfer for ${req.recruiterName}?`)) return;

    setActionLoading(true);
    try {
      const res = await apiRequest(`/recruiters/unlock-requests/${req.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMsg(res.message);
      setTimeout(() => setMsg(''), 4000);
      await fetchData();
    } catch (err: any) {
      alert('Failed to approve request: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async (req: UnlockRequestItem) => {
    const reason = prompt(`Enter rejection reason for ${req.recruiterName}:`, 'Denied by agency administrator');
    if (reason === null) return;

    setActionLoading(true);
    try {
      const res = await apiRequest(`/recruiters/unlock-requests/${req.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setMsg(res.message);
      setTimeout(() => setMsg(''), 4000);
      await fetchData();
    } catch (err: any) {
      alert('Failed to reject request: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const pendingRequests = unlockRequests.filter((r) => r.status === 'pending');

  const filtered = team.filter(
    (t) =>
      t.fullName.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Recruiter Team Seats</h1>
            <span className="rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-400">
              {team.length} Active Seats
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Recruiter seats are hardware-locked. 1 machine change allowed per month via Org Admin; additional changes require Super Admin approval.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:from-violet-500 hover:to-indigo-500"
        >
          <Plus className="h-4 w-4" />
          <span>Provision Recruiter Seat</span>
        </button>
      </div>

      {msg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-700 dark:text-emerald-300">
          ✓ {msg}
        </div>
      )}

      {/* Pending Machine Unlock Banner if any */}
      {pendingRequests.length > 0 && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400">
                <Laptop className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900 dark:text-amber-300">
                  {pendingRequests.length} Pending Machine Unlock {pendingRequests.length === 1 ? 'Request' : 'Requests'}
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Recruiters attempting to log in from new machines awaiting administrator authorization.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('requests')}
              className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-500 transition"
            >
              View Requests
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('team')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'team'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Recruiter Team ({team.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'requests'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Laptop className="h-4 w-4" />
          <span>Machine Unlock Requests</span>
          {pendingRequests.length > 0 && (
            <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px] font-extrabold">
              {pendingRequests.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'team' ? (
        <>
          {/* Search */}
          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 shadow-xs backdrop-blur">
            <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recruiters by name or email..."
              className="ml-2 w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
            />
          </div>

          {/* Team Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs backdrop-blur-xl">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">Recruiter Name</th>
                  <th className="px-6 py-4">Hardware Binding</th>
                  <th className="px-6 py-4">Seat Status</th>
                  <th className="px-6 py-4">30-Day Transfer Window</th>
                  <th className="px-6 py-4 text-right">Equipment Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
                {filtered.map((r) => {
                  const isBound = Boolean(r.deviceId);
                  const now = new Date();
                  const canTransfer = !r.deviceSwitchAllowedAfter || now >= new Date(r.deviceSwitchAllowedAfter);
                  const switchCount = canTransfer ? 0 : (r.deviceMonthlySwitchCount || 0);

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{r.fullName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{r.email}</p>
                        </div>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs">
                        {r.deviceId ? (
                          <span className="rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-700 dark:text-slate-300">
                            {r.deviceId.slice(0, 16)}...
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic">Unbound (Binds on 1st login)</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {isBound ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                            <Laptop className="h-3 w-3" />
                            <span>Machine Locked</span>
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Ready to Bind
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-xs">
                        {r.deviceSwitchAllowedAfter ? (
                          canTransfer ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Eligible for Machine Transfer</span>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Locked until {formatDate(r.deviceSwitchAllowedAfter)}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {switchCount}/1 monthly switch used (Extra changes require Super Admin)
                              </p>
                            </div>
                          )
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {isBound && (
                          <button
                            onClick={() => handleResetDevice(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400 transition hover:bg-red-100 dark:hover:bg-red-500/20"
                            title={
                              switchCount >= 1
                                ? 'Monthly limit reached - Super Admin approval required'
                                : 'Reset machine lock (1 allowed per month)'
                            }
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reset Machine</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      No recruiters provisioned yet. Click "Provision Recruiter Seat" to add team members.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* Machine Unlock Requests Tab */
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs backdrop-blur-xl">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4">Recruiter</th>
                <th className="px-6 py-4">Reason / Notes</th>
                <th className="px-6 py-4">Approval Level</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Submitted</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
              {unlockRequests.map((req) => {
                const isSuperAdminTier = req.approvalTier === 'super_admin';
                const isPending = req.status === 'pending';

                return (
                  <tr key={req.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{req.recruiterName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{req.recruiterEmail}</p>
                      </div>
                    </td>

                    <td className="px-6 py-4 max-w-xs">
                      <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                        {req.reason || 'No reason provided'}
                      </p>
                      {req.rejectionReason && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                          Rejection note: {req.rejectionReason}
                        </p>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {isSuperAdminTier ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                          <ShieldAlert className="h-3 w-3" />
                          <span>Super Admin Only (&gt;1/mo)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-400">
                          <ShieldCheck className="h-3 w-3" />
                          <span>Org Admin (1st of month)</span>
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          req.status === 'approved'
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                            : req.status === 'rejected'
                            ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400'
                            : 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 animate-pulse'
                        }`}
                      >
                        {req.status.toUpperCase()}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(req.createdAt)}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {isPending && (
                        <div className="flex items-center justify-end gap-2">
                          {!isSuperAdminTier ? (
                            <>
                              <button
                                onClick={() => handleApproveRequest(req)}
                                disabled={actionLoading}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition disabled:opacity-50"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => handleRejectRequest(req)}
                                disabled={actionLoading}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Reject</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 italic">
                              Escalated to Super Admin
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {unlockRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No machine unlock requests received yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Provision Recruiter Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Provision Recruiter Seat</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Provide login credentials. The recruiter seat will automatically lock to their physical computer on 1st login.
            </p>

            {modalError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateRecruiter} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Recruiter Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Alex Rivera"
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Work Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="alex@agency.com"
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Initial Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 disabled:opacity-50"
                >
                  {actionLoading ? 'Provisioning...' : 'Provision Seat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
