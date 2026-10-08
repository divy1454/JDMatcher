'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { apiRequest } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  CreditCard,
  AlertTriangle,
  Lock,
  Cpu,
  Receipt,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  FileText,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  DollarSign,
} from 'lucide-react';

// Dynamically import BillingCharts with ssr: false to prevent SSR execution of Recharts
const BillingCharts = dynamic(() => import('@/components/BillingCharts'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
    </div>
  ),
});

interface BillingHUDData {
  organization: {
    id: string;
    name: string;
    slug: string;
    securityDepositLimit: string;
    totalBilledAmount: string;
  };
  hud: {
    securityDepositLimit: number;
    totalBilledAmount: number;
    outstandingDepositUsed?: number;
    cumulativeLifetimeSpend?: number;
    totalPaidAmount?: number;
    remainingDeposit: number;
    usagePercentage: number;
    isLocked: boolean;
    resumeAnalysisCount?: number;
    resumeAnalysisBilledAmount?: number;
  };
  recruiterConsumption: Array<{
    recruiterId: string;
    recruiterName: string;
    recruiterEmail: string;
    totalEvaluations: number;
    regularEvalCount?: number;
    resumeAnalysisCount?: number;
    totalTokens: number;
    totalBilledCostUsd: string;
    lastEvaluationAt: string | null;
  }>;
}

interface AnalyticsData {
  dailyStats: Array<{
    date: string;
    evaluations: number;
    totalTokens?: number;
    cost?: string;
  }>;
  recruiterBreakdown: Array<{
    recruiterId: string;
    recruiterName: string;
    count: number;
    evaluations?: number;
    totalTokens?: number;
    cost?: string;
  }>;
  verdictStats: {
    applyCount: number;
    skipCount: number;
    otherCount: number;
  };
}

export default function BillingHUDPage() {
  const [data, setData] = useState<BillingHUDData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Recruiter Filter Controls
  const [recruiterSearch, setRecruiterSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'cost_desc' | 'evals_desc' | 'tokens_desc' | 'name_asc'>('cost_desc');

  const fetchData = async (isSilent = false) => {
    if (!isSilent && !data) {
      setIsInitialLoading(true);
    } else if (!isSilent) {
      setIsRefreshing(true);
    }

    try {
      const [hudRes, analyticsRes] = await Promise.all([
        apiRequest('/orgs/my-org'),
        apiRequest('/orgs/my-org/analytics').catch(() => null),
      ]);
      if (hudRes) setData(hudRes);
      if (analyticsRes) setAnalytics(analyticsRes);
    } catch (err) {
      console.error('Failed to load billing & analytics data:', err);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial load and silent 10s auto-refresh interval
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchData(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (isInitialLoading && !data) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  const hud = data?.hud || {
    securityDepositLimit: 500,
    totalBilledAmount: 0,
    outstandingDepositUsed: 0,
    cumulativeLifetimeSpend: 0,
    totalPaidAmount: 0,
    remainingDeposit: 500,
    usagePercentage: 0,
    isLocked: false,
    resumeAnalysisCount: 0,
    resumeAnalysisBilledAmount: 0,
  };
  const recruiterConsumption = data?.recruiterConsumption || [];

  const isWarning = hud.usagePercentage >= 80 && !hud.isLocked;

  const totalEvaluations =
    analytics?.verdictStats
      ? analytics.verdictStats.applyCount +
        analytics.verdictStats.skipCount +
        analytics.verdictStats.otherCount
      : recruiterConsumption.reduce((acc, r) => acc + r.totalEvaluations, 0);

  // Filtered & Sorted Recruiters
  const filteredRecruiters = recruiterConsumption
    .filter((r) => {
      const q = recruiterSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        r.recruiterName.toLowerCase().includes(q) ||
        r.recruiterEmail.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (activityFilter === 'active') {
        return r.totalEvaluations > 0;
      }
      if (activityFilter === 'inactive') {
        return r.totalEvaluations === 0;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'cost_desc') {
        return parseFloat(b.totalBilledCostUsd) - parseFloat(a.totalBilledCostUsd);
      }
      if (sortBy === 'evals_desc') {
        return b.totalEvaluations - a.totalEvaluations;
      }
      if (sortBy === 'tokens_desc') {
        return b.totalTokens - a.totalTokens;
      }
      if (sortBy === 'name_asc') {
        return a.recruiterName.localeCompare(b.recruiterName);
      }
      return 0;
    });

  const outstandingBalance = hud.outstandingDepositUsed ?? hud.totalBilledAmount;
  const cumulativeSpend = hud.cumulativeLifetimeSpend ?? hud.totalBilledAmount;
  const settledAmount = hud.totalPaidAmount ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Title & Meters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>API Usage & Billing HUD</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time deposit exposure, all-time cumulative volume, and recruiter seat consumption.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => fetchData(false)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Auto-refreshes every 10s. Click to refresh immediately."
          >
            <RefreshCw className={`h-3.5 w-3.5 text-violet-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Updating...' : 'Live Sync'}</span>
          </button>

          <Link
            href="/org-portal/ledger"
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-violet-500 transition"
          >
            <Receipt className="h-3.5 w-3.5" />
            <span>Monthly Ledger</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards: Reconciled across HUD, Ledger, and Super Admin */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Outstanding Deposit Consumed */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Deposit Consumed</span>
            <span className="font-mono text-violet-600 dark:text-violet-400 font-bold">
              {hud.usagePercentage}%
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {formatCurrency(outstandingBalance)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              / {formatCurrency(hud.securityDepositLimit)} Limit
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Current unpaid balance towards deposit limit
          </p>
        </div>

        {/* Cumulative Volume (All-Time) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Cumulative Volume</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {formatCurrency(cumulativeSpend)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Matches Monthly Billing Ledger grand total
          </p>
        </div>

        {/* Settled / Paid to Date */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <span>Settled to Date</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {formatCurrency(settledAmount)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Cleared via invoices & receipts
          </p>
        </div>

        {/* Resume Analyses */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
            <span>Resume Analyses</span>
            <FileText className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {hud.resumeAnalysisCount || 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Cost: {formatCurrency(hud.resumeAnalysisBilledAmount || 0)}
          </p>
        </div>
      </div>

      {/* Banner Linking to Billing Ledger */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-violet-200 dark:border-violet-500/30 bg-gradient-to-r from-violet-50 via-white to-indigo-50 dark:from-violet-950/40 dark:via-slate-900 dark:to-indigo-950/30 p-4 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-600/20 text-violet-600 dark:text-violet-400">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Monthly Statements & UPI Payments</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Review monthly breakdown ({formatCurrency(cumulativeSpend)} lifetime), download official invoices, and scan instant UPI QR codes.
            </p>
          </div>
        </div>
        <Link
          href="/org-portal/ledger"
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-violet-500 hover:to-indigo-500 self-start sm:self-auto shrink-0"
        >
          <span>Open Ledger</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Security Deposit Limit Warning/Locked Alerts */}
      {hud.isLocked && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-700 dark:text-red-300">
          <Lock className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <strong className="font-bold">Evaluation Limit Reached:</strong>
            <p className="mt-0.5">
              Your agency has reached the deposit limit ({formatCurrency(hud.securityDepositLimit)}). Evaluations are paused. Contact Super Admin to settle funds and reset your balance.
            </p>
          </div>
        </div>
      )}

      {isWarning && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Attention: You have consumed {hud.usagePercentage}% of your security deposit limit. Settle with Super Admin soon to avoid automated evaluation pauses.
          </span>
        </div>
      )}

      {/* Interactive Charts */}
      <BillingCharts
        dailyStats={analytics?.dailyStats}
        recruiterBreakdown={analytics?.recruiterBreakdown}
        verdictStats={analytics?.verdictStats}
        totalEvaluations={totalEvaluations}
      />

      {/* Recruiter Token Consumption Ledger Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Recruiter Consumption Meter</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregated candidate match & resume analysis consumption broken down by recruiter seat.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-950/30 px-3 py-1.5 text-xs text-purple-700 dark:text-purple-300">
              <FileText className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              <span>Agency Resume Analyses: <strong className="text-slate-900 dark:text-white font-bold">{hud.resumeAnalysisCount || 0}</strong></span>
            </div>
            <Cpu className="h-5 w-5 text-violet-500 dark:text-violet-400" />
          </div>
        </div>

        {/* Agency Admin Filter Options for Recruiters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search recruiter name or email..."
              value={recruiterSearch}
              onChange={(e) => setRecruiterSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Activity Filter */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1 text-xs">
              <button
                type="button"
                onClick={() => setActivityFilter('all')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  activityFilter === 'all'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Seats ({recruiterConsumption.length})
              </button>
              <button
                type="button"
                onClick={() => setActivityFilter('active')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  activityFilter === 'active'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Active Only
              </button>
              <button
                type="button"
                onClick={() => setActivityFilter('inactive')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  activityFilter === 'inactive'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Inactive
              </button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:border-violet-500 focus:outline-none"
            >
              <option value="cost_desc">Sort by Billed Cost (High to Low)</option>
              <option value="evals_desc">Sort by Evaluations (Most First)</option>
              <option value="tokens_desc">Sort by Tokens (Most First)</option>
              <option value="name_asc">Sort by Recruiter Name (A-Z)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="pb-3 pl-2">Recruiter</th>
                <th className="pb-3">JD Evals</th>
                <th className="pb-3">Resume Analyses</th>
                <th className="pb-3">Total Activity</th>
                <th className="pb-3">Tokens Consumed</th>
                <th className="pb-3">Billed Cost (USD)</th>
                <th className="pb-3 pr-2 text-right">Last Match Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {filteredRecruiters.map((recruiter) => (
                <tr key={recruiter.recruiterId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                  <td className="py-3.5 pl-2">
                    <div className="font-medium text-slate-900 dark:text-white">{recruiter.recruiterName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{recruiter.recruiterEmail}</div>
                  </td>
                  <td className="py-3.5 font-bold text-slate-800 dark:text-slate-200">
                    {recruiter.regularEvalCount ?? recruiter.totalEvaluations}
                  </td>
                  <td className="py-3.5">
                    <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
                      <FileText className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                      {recruiter.resumeAnalysisCount ?? 0}
                    </span>
                  </td>
                  <td className="py-3.5 font-medium text-slate-700 dark:text-slate-300">
                    {recruiter.totalEvaluations}
                  </td>
                  <td className="py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {recruiter.totalTokens.toLocaleString()} tokens
                  </td>
                  <td className="py-3.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    ${parseFloat(recruiter.totalBilledCostUsd).toFixed(4)}
                  </td>
                  <td className="py-3.5 pr-2 text-right text-xs text-slate-500 dark:text-slate-400">
                    {recruiter.lastEvaluationAt
                      ? new Date(recruiter.lastEvaluationAt).toLocaleString()
                      : 'Never'}
                  </td>
                </tr>
              ))}

              {filteredRecruiters.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    No recruiter seats matched the selected filter criteria.
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
