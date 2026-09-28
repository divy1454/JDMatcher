'use client';

import React, { useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { LoginBrandLogo } from '@/components/brand';
import { ShieldCheck, Lock, Mail, ArrowRight, Sparkles, Building2, UserCheck } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      login(data.token, data.user, data.organization);
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  // One-click quick login for testing seeded accounts
  const quickFill = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setErrorMessage('');
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 p-4">
      {/* Background glow accents */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <LoginBrandLogo size={60} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">JDMatcher Enterprise</h1>
          <p className="mt-1 text-sm text-slate-400">
            Zero-Trust IT Bench Sales & Match Intelligence
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Private Tenant Portal • No Public Signups</span>
          </div>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Work Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@agency.com"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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

        {/* Quick Demo Credentials Switcher */}
        <div className="mt-8 border-t border-slate-800/80 pt-6">
          <div className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
            Quick Fill Demo Accounts
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => quickFill('admin@jdmatcher.internal', 'ChangeMeInProd123!')}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-left text-slate-300 transition hover:border-indigo-500/50 hover:bg-indigo-950/20"
            >
              <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0" />
              <div className="truncate">
                <p className="font-semibold text-white">Super Admin</p>
                <p className="text-[10px] text-slate-500 truncate">Platform Telemetry</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickFill('admin@apexit.com', 'ApexAdmin2026!')}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-left text-slate-300 transition hover:border-violet-500/50 hover:bg-violet-950/20"
            >
              <Building2 className="h-4 w-4 text-violet-400 shrink-0" />
              <div className="truncate">
                <p className="font-semibold text-white">Org Admin</p>
                <p className="text-[10px] text-slate-500 truncate">Billing & Candidates</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => quickFill('recruiter@apexit.com', 'Recruiter2026!')}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-left text-slate-300 transition hover:border-emerald-500/50 hover:bg-emerald-950/20"
            >
              <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="font-semibold text-white">Recruiter</p>
                <p className="text-[10px] text-slate-500 truncate">Candidates & Matches</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
