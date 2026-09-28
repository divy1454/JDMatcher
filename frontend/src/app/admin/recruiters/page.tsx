'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Laptop, RotateCcw, ShieldAlert, CheckCircle, Search, Clock } from 'lucide-react';

interface RecruiterItem {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  organizationName: string;
  deviceId: string | null;
  deviceLastLockedAt: string | null;
  deviceSwitchAllowedAfter: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function RecruitersHardwarePage() {
  const [recruiters, setRecruiters] = useState<RecruiterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');

  const fetchRecruiters = async () => {
    try {
      const data = await apiRequest('/recruiters');
      setRecruiters(data);
    } catch (err) {
      console.error('Failed to load recruiters:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecruiters();
  }, []);

  const handleResetDevice = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to force-reset the hardware lock for ${name}? This bypasses the 30-day cooldown.`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiRequest(`/recruiters/${id}/reset-device`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setResetSuccessMsg(res.message);
      setTimeout(() => setResetSuccessMsg(''), 4000);
      await fetchRecruiters();
    } catch (err: any) {
      alert('Failed to reset device lock: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = recruiters.filter(
    (r) =>
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase()) ||
      (r.organizationName && r.organizationName.toLowerCase().includes(search.toLowerCase())) ||
      (r.deviceId && r.deviceId.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Recruiters & Hardware Locks</h1>
          <p className="mt-1 text-sm text-slate-400">
            Audit machine identity locks (`x-device-id`), enforce 30-day anti-sharing rules, and perform emergency hardware unbinds.
          </p>
        </div>
      </div>

      {resetSuccessMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-300">
          ✓ {resetSuccessMsg}
        </div>
      )}

      {/* Search Input */}
      <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 backdrop-blur">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by recruiter name, email, agency, or hardware ID..."
          className="ml-2 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
        />
      </div>

      {/* Recruiters Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4">Recruiter</th>
                <th className="px-6 py-4">Agency</th>
                <th className="px-6 py-4">Hardware Fingerprint</th>
                <th className="px-6 py-4">Lock Status</th>
                <th className="px-6 py-4">30-Day Transfer Window</th>
                <th className="px-6 py-4 text-right">Emergency Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filtered.map((r) => {
                const isLocked = Boolean(r.deviceId);
                const now = new Date();
                const canSwitch = !r.deviceSwitchAllowedAfter || now >= new Date(r.deviceSwitchAllowedAfter);

                return (
                  <tr key={r.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-white">{r.fullName}</p>
                        <p className="text-xs text-slate-500">{r.email}</p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-300">{r.organizationName || '—'}</span>
                    </td>

                    <td className="px-6 py-4 font-mono text-xs">
                      {r.deviceId ? (
                        <span className="rounded bg-slate-800 px-2 py-1 text-slate-300">
                          {r.deviceId.slice(0, 18)}...
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Unbound (Will bind on next login)</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">
                          <Laptop className="h-3 w-3" />
                          <span>Hardware Locked</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
                          <span>Unassigned</span>
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-xs">
                      {r.deviceSwitchAllowedAfter ? (
                        canSwitch ? (
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
                      {isLocked && (
                        <button
                          onClick={() => handleResetDevice(r.id, r.fullName)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reset Lock</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                    No recruiters found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
