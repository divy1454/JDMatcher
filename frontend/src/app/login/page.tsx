'use client';

import React, { useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { LoginBrandLogo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme';
import { ShieldCheck, Lock, Mail, ArrowRight, Laptop, AlertTriangle, CheckCircle, X } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deviceLockData, setDeviceLockData] = useState<{
    lockedDeviceId?: string;
    incomingDeviceId?: string;
    approvalTier?: 'org_admin' | 'super_admin';
    message?: string;
  } | null>(null);

  // Request Unlock Modal State
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockFeedback, setUnlockFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setDeviceLockData(null);

    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      login(data.token, data.user, data.organization);
    } catch (err: any) {
      if (err.code === 'DEVICE_LOCKED' || err.data?.code === 'DEVICE_LOCKED') {
        setDeviceLockData({
          lockedDeviceId: err.data?.lockedDeviceId,
          incomingDeviceId: err.data?.incomingDeviceId,
          approvalTier: err.data?.approvalTier || 'org_admin',
          message: err.message,
        });
      } else {
        setErrorMessage(err.message || 'Invalid email or password');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockLoading(true);
    setUnlockFeedback(null);

    try {
      const res = await apiRequest('/recruiters/request-unlock', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          reason: unlockReason,
        }),
      });

      setUnlockFeedback({
        type: 'success',
        message: res.message || 'Unlock request submitted successfully.',
      });
      setTimeout(() => {
        setIsUnlockModalOpen(false);
        setUnlockFeedback(null);
        setUnlockReason('');
      }, 3500);
    } catch (err: any) {
      setUnlockFeedback({
        type: 'error',
        message: err.message || 'Failed to submit unlock request.',
      });
    } finally {
      setUnlockLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-950 p-4 text-slate-900 dark:text-slate-100">
      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle variant="pill" />
      </div>

      {/* Background glow accents */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <LoginBrandLogo size={60} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">JDMatcher Enterprise</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Zero-Trust IT Bench Sales & Match Intelligence
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Private Tenant Portal • No Public Signups</span>
          </div>
        </div>

        {/* Machine Locked Validation Banner */}
        {deviceLockData && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400 shrink-0">
                <Laptop className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-amber-800 dark:text-amber-300">Machine Locked to Another Device</h4>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-200 leading-relaxed">
                  This recruiter ID is locked to another physical computer. Login from this machine is blocked.
                </p>
                <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-[11px] text-amber-800 dark:text-amber-300">
                  {deviceLockData.approvalTier === 'super_admin' ? (
                    <span>
                      ⚠️ <strong>Monthly Limit Exceeded:</strong> Recruiters can only change machines once per month with Org Admin approval. An additional change requires <strong>Super Admin approval</strong>.
                    </span>
                  ) : (
                    <span>
                      ℹ️ Contact your <strong>Organization Admin</strong> to unlock this account for a new computer (1 transfer allowed per month).
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsUnlockModalOpen(true)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-md hover:bg-amber-500 transition"
                >
                  <Laptop className="h-3.5 w-3.5" />
                  <span>Request Machine Unlock</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Standard Error banner */}
        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-600 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Work Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@agency.com"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/60 py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/60 py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
          >
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Request Machine Unlock Modal */}
      {isUnlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Laptop className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Request Machine Unlock</h3>
              </div>
              <button
                onClick={() => setIsUnlockModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Submit an authorization request to transfer your recruiter seat to this physical machine.
              {deviceLockData?.approvalTier === 'super_admin' ? (
                <span className="block mt-1 font-semibold text-amber-700 dark:text-amber-400">
                  ⚠️ Monthly change limit reached: This request will be routed directly to the Super Admin.
                </span>
              ) : (
                <span className="block mt-1 font-semibold text-indigo-600 dark:text-indigo-400">
                  ℹ️ This request will be routed to your Organization Admin for 1-click approval.
                </span>
              )}
            </p>

            {unlockFeedback && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${
                  unlockFeedback.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                }`}
              >
                {unlockFeedback.type === 'success' ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                )}
                <span>{unlockFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handleRequestUnlock} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Recruiter Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Verify your account password"
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reason for Machine Transfer
                </label>
                <textarea
                  required
                  rows={3}
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="e.g. Switched to new laptop assigned by agency, hardware repair completed..."
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUnlockModalOpen(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={unlockLoading}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50"
                >
                  {unlockLoading ? 'Submitting...' : 'Submit Unlock Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
