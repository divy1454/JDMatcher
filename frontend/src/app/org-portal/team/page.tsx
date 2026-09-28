'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { UserCheck, Plus, Laptop, RotateCcw, Clock, Search } from 'lucide-react';

interface RecruiterItem {
  id: string;
  fullName: string;
  email: string;
  deviceId: string | null;
  deviceLastLockedAt: string | null;
  deviceSwitchAllowedAfter: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function RecruiterTeamPage() {
  const [team, setTeam] = useState<RecruiterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [modalError, setModalError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
  });

  const fetchTeam = async () => {
    try {
      const data = await apiRequest('/recruiters');
      setTeam(data);
    } catch (err) {
      console.error('Failed to load team:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
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
      await fetchTeam();
    } catch (err: any) {
      setModalError(err.message || 'Failed to provision recruiter');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetDevice = async (id: string, name: string) => {
    if (!confirm(`Reset physical machine lock for ${name}?`)) return;
    try {
      const res = await apiRequest(`/recruiters/${id}/reset-device`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMsg(res.message);
      setTimeout(() => setMsg(''), 4000);
      await fetchTeam();
    } catch (err: any) {
      alert('Failed to reset lock: ' + err.message);
    }
  };

  const filtered = team.filter(
    (t) =>
      t.fullName.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Recruiter Team Seats</h1>
          <p className="mt-1 text-sm text-slate-400">
            Provision unlimited recruiter seats for your agency. Each seat is automatically hardware-bound to the recruiter's physical computer.
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
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-300">
          ✓ {msg}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 backdrop-blur">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recruiters by name or email..."
          className="ml-2 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
        />
      </div>

      {/* Team Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-6 py-4">Recruiter Name</th>
              <th className="px-6 py-4">Hardware Binding</th>
              <th className="px-6 py-4">Seat Status</th>
              <th className="px-6 py-4">30-Day Transfer Window</th>
              <th className="px-6 py-4 text-right">Equipment Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {filtered.map((r) => {
              const isBound = Boolean(r.deviceId);
              const now = new Date();
              const canTransfer = !r.deviceSwitchAllowedAfter || now >= new Date(r.deviceSwitchAllowedAfter);

              return (
                <tr key={r.id} className="hover:bg-slate-800/30 transition">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-white">{r.fullName}</p>
                      <p className="text-xs text-slate-500">{r.email}</p>
                    </div>
                  </td>

                  <td className="px-6 py-4 font-mono text-xs">
                    {r.deviceId ? (
                      <span className="rounded bg-slate-800 px-2 py-1 text-slate-300">
                        {r.deviceId.slice(0, 16)}...
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Unbound (Binds on Chrome Extension login)</span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    {isBound ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
                        <Laptop className="h-3 w-3" />
                        <span>Machine Locked</span>
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-400">
                        Ready to Bind
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4 text-xs">
                    {r.deviceSwitchAllowedAfter ? (
                      canTransfer ? (
                        <span className="text-emerald-400 font-medium">Eligible for Machine Transfer</span>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-400 font-medium">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Locked until {formatDate(r.deviceSwitchAllowedAfter)}</span>
                        </div>
                      )
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="px-6 py-4 text-right">
                    {isBound && (
                      <button
                        onClick={() => handleResetDevice(r.id, r.fullName)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
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
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                  No recruiters provisioned yet. Click "Provision Recruiter Seat" to add team members.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Provision Recruiter Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Provision Recruiter Seat</h3>
            <p className="mt-1 text-xs text-slate-400">
              Provide login credentials. The recruiter will use these credentials in the Chrome Extension.
            </p>

            {modalError && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleCreateRecruiter} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Mike Ross"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Work Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="recruiter@agency.com"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="•••••••••••• (min 6 chars)"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-violet-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">Minimum 6 characters for Chrome Extension sign-in</p>
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
                  {actionLoading ? 'Provisioning...' : 'Provision Recruiter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
