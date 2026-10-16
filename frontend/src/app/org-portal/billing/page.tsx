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
  Calendar,
  X,
  SlidersHorizontal,
  ChevronDown,
  Layers,
  Sparkles,
  Users,
} from 'lucide-react';

// Dynamically import BillingCharts with ssr: false to prevent SSR execution of Recharts
const BillingCharts = dynamic(() => import('@/components/BillingCharts'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
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
  filteredStats?: {
    totalEvaluations: number;
    totalTokens: number;
    totalBilledCostUsd: number;
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

type TimeframePreset = 'all' | 'today' | '7d' | '14d' | '30d' | 'this_month' | 'last_month' | 'custom';
type ActionTypeFilter = 'all' | 'jd_evaluation' | 'resume_analysis';
type SpendTierFilter = 'all' | 'high' | 'medium' | 'low' | 'zero';
type ActivityStatusFilter = 'all' | 'active' | 'inactive';
type SortOption = 'cost_desc' | 'cost_asc' | 'evals_desc' | 'tokens_desc' | 'resume_desc' | 'name_asc' | 'recent_desc';

export default function BillingHUDPage() {
  const [data, setData] = useState<BillingHUDData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // HUD Filter States
  const [timeframe, setTimeframe] = useState<TimeframePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState<ActionTypeFilter>('all');
  const [selectedRecruiterId, setSelectedRecruiterId] = useState<string>('all');
  const [spendTierFilter, setSpendTierFilter] = useState<SpendTierFilter>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityStatusFilter>('all');
  const [recruiterSearch, setRecruiterSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('cost_desc');
  const [isFilterExpanded, setIsFilterExpanded] = useState(true);

  // Resolve dates for timeframe presets
  const { activeStartDate, activeEndDate } = useMemo(() => {
    const today = new Date();
    const formatDateYMD = (d: Date) => d.toISOString().slice(0, 10);

    if (timeframe === 'today') {
      const start = formatDateYMD(today);
      return { activeStartDate: start, activeEndDate: start };
    }
    if (timeframe === '7d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { activeStartDate: formatDateYMD(d), activeEndDate: formatDateYMD(today) };
    }
    if (timeframe === '14d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 14);
      return { activeStartDate: formatDateYMD(d), activeEndDate: formatDateYMD(today) };
    }
    if (timeframe === '30d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { activeStartDate: formatDateYMD(d), activeEndDate: formatDateYMD(today) };
    }
    if (timeframe === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { activeStartDate: formatDateYMD(firstDay), activeEndDate: formatDateYMD(today) };
    }
    if (timeframe === 'last_month') {
      const firstDayPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayPrev = new Date(today.getFullYear(), today.getMonth(), 0);
      return { activeStartDate: formatDateYMD(firstDayPrev), activeEndDate: formatDateYMD(lastDayPrev) };
    }
    if (timeframe === 'custom') {
      return { activeStartDate: customStartDate, activeEndDate: customEndDate };
    }
    return { activeStartDate: '', activeEndDate: '' };
  }, [timeframe, customStartDate, customEndDate]);

  const fetchData = async (isSilent = false) => {
    if (!isSilent && !data) {
      setIsInitialLoading(true);
    } else if (!isSilent) {
      setIsRefreshing(true);
    }

    try {
      const params = new URLSearchParams();
      if (activeStartDate) params.set('startDate', activeStartDate);
      if (activeEndDate) params.set('endDate', activeEndDate);
      if (actionTypeFilter !== 'all') params.set('actionType', actionTypeFilter);
      if (selectedRecruiterId !== 'all') params.set('recruiterId', selectedRecruiterId);
      const queryString = params.toString() ? `?${params.toString()}` : '';

      const [hudRes, analyticsRes] = await Promise.all([
        apiRequest(`/orgs/my-org${queryString}`),
        apiRequest(`/orgs/my-org/analytics${queryString}`).catch(() => null),
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

  // Re-fetch when server-side filter params change
  useEffect(() => {
    fetchData();
  }, [activeStartDate, activeEndDate, actionTypeFilter, selectedRecruiterId]);

  // Silent 15s auto-refresh interval when visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchData(true);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [activeStartDate, activeEndDate, actionTypeFilter, selectedRecruiterId]);

  const hasActiveFilters = useMemo(() => {
    return (
      timeframe !== 'all' ||
      actionTypeFilter !== 'all' ||
      selectedRecruiterId !== 'all' ||
      spendTierFilter !== 'all' ||
      activityFilter !== 'all' ||
      recruiterSearch.trim().length > 0 ||
      sortBy !== 'cost_desc'
    );
  }, [timeframe, actionTypeFilter, selectedRecruiterId, spendTierFilter, activityFilter, recruiterSearch, sortBy]);

  const handleResetFilters = () => {
    setTimeframe('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setActionTypeFilter('all');
    setSelectedRecruiterId('all');
    setSpendTierFilter('all');
    setActivityFilter('all');
    setRecruiterSearch('');
    setSortBy('cost_desc');
  };

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

  // Filtered & Sorted Recruiters
  const filteredRecruiters = recruiterConsumption
    .filter((r) => {
      // Recruiter search keyword
      const q = recruiterSearch.toLowerCase().trim();
      if (q) {
        const matches =
          r.recruiterName.toLowerCase().includes(q) ||
          r.recruiterEmail.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Selected Recruiter dropdown
      if (selectedRecruiterId !== 'all' && r.recruiterId !== selectedRecruiterId) {
        return false;
      }

      // Activity Status filter
      if (activityFilter === 'active' && r.totalEvaluations === 0) {
        return false;
      }
      if (activityFilter === 'inactive' && r.totalEvaluations > 0) {
        return false;
      }

      // Spend tier filter
      const cost = parseFloat(r.totalBilledCostUsd) || 0;
      if (spendTierFilter === 'high' && cost < 10) return false;
      if (spendTierFilter === 'medium' && (cost < 1 || cost >= 10)) return false;
      if (spendTierFilter === 'low' && (cost <= 0 || cost >= 1)) return false;
      if (spendTierFilter === 'zero' && cost > 0) return false;

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'cost_desc') {
        return parseFloat(b.totalBilledCostUsd) - parseFloat(a.totalBilledCostUsd);
      }
      if (sortBy === 'cost_asc') {
        return parseFloat(a.totalBilledCostUsd) - parseFloat(b.totalBilledCostUsd);
      }
      if (sortBy === 'evals_desc') {
        return b.totalEvaluations - a.totalEvaluations;
      }
      if (sortBy === 'tokens_desc') {
        return b.totalTokens - a.totalTokens;
      }
      if (sortBy === 'resume_desc') {
        return (b.resumeAnalysisCount || 0) - (a.resumeAnalysisCount || 0);
      }
      if (sortBy === 'name_asc') {
        return a.recruiterName.localeCompare(b.recruiterName);
      }
      if (sortBy === 'recent_desc') {
        const dateA = a.lastEvaluationAt ? new Date(a.lastEvaluationAt).getTime() : 0;
        const dateB = b.lastEvaluationAt ? new Date(b.lastEvaluationAt).getTime() : 0;
        return dateB - dateA;
      }
      return 0;
    });

  // Calculate dynamic totals for the currently filtered recruiters
  const filteredTotalCost = filteredRecruiters.reduce(
    (sum, r) => sum + (parseFloat(r.totalBilledCostUsd) || 0),
    0
  );
  const filteredTotalEvals = filteredRecruiters.reduce(
    (sum, r) => sum + r.totalEvaluations,
    0
  );
  const filteredTotalTokens = filteredRecruiters.reduce(
    (sum, r) => sum + r.totalTokens,
    0
  );
  const filteredTotalResumeAnalyses = filteredRecruiters.reduce(
    (sum, r) => sum + (r.resumeAnalysisCount || 0),
    0
  );

  const totalEvaluations =
    analytics?.verdictStats
      ? analytics.verdictStats.applyCount +
        analytics.verdictStats.skipCount +
        analytics.verdictStats.otherCount
      : recruiterConsumption.reduce((acc, r) => acc + r.totalEvaluations, 0);

  const outstandingBalance = hud.outstandingDepositUsed ?? hud.totalBilledAmount;
  const cumulativeSpend = hud.cumulativeLifetimeSpend ?? hud.totalBilledAmount;
  const settledAmount = hud.totalPaidAmount ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
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
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xs transition ${
              hasActiveFilters
                ? 'border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-violet-500" />
            <span>HUD Filters</span>
            {hasActiveFilters && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                !
              </span>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform ${isFilterExpanded ? 'rotate-180' : ''}`} />
          </button>

          <button
            onClick={() => fetchData(false)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Auto-refreshes every 15s. Click to refresh immediately."
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

      {/* COMPREHENSIVE BILLING HUD FILTERS PANEL */}
      {isFilterExpanded && (
        <div className="rounded-2xl border border-violet-200/70 dark:border-violet-500/20 bg-gradient-to-br from-white via-violet-50/20 to-slate-50 dark:from-slate-900 dark:via-slate-900/90 dark:to-violet-950/20 p-5 shadow-xs backdrop-blur-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">
                <Filter className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Billing HUD Analytics Filters</span>
                  {hasActiveFilters && (
                    <span className="rounded-md bg-violet-100 dark:bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                      Active
                    </span>
                  )}
                </h3>
              </div>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition self-start sm:self-auto"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>

          {/* Filter Rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Timeframe Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-violet-500" />
                <span>Time Period</span>
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as TimeframePreset)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none shadow-xs"
              >
                <option value="all">All Time (Lifetime)</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 Days</option>
                <option value="14d">Last 14 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Date Range...</option>
              </select>
            </div>

            {/* 2. Service / Action Type Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-violet-500" />
                <span>Service Category</span>
              </label>
              <select
                value={actionTypeFilter}
                onChange={(e) => setActionTypeFilter(e.target.value as ActionTypeFilter)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none shadow-xs"
              >
                <option value="all">All Service Activities</option>
                <option value="jd_evaluation">JD Matching Evaluations Only</option>
                <option value="resume_analysis">Resume Deep Dive Analyses Only</option>
              </select>
            </div>

            {/* 3. Recruiter Seat Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-violet-500" />
                <span>Recruiter Seat</span>
              </label>
              <select
                value={selectedRecruiterId}
                onChange={(e) => setSelectedRecruiterId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none shadow-xs"
              >
                <option value="all">All Recruiter Seats ({recruiterConsumption.length})</option>
                {recruiterConsumption.map((r) => (
                  <option key={r.recruiterId} value={r.recruiterId}>
                    {r.recruiterName} ({r.totalEvaluations} evals - ${parseFloat(r.totalBilledCostUsd).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Spend Volume Tier */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-violet-500" />
                <span>Consumption Volume</span>
              </label>
              <select
                value={spendTierFilter}
                onChange={(e) => setSpendTierFilter(e.target.value as SpendTierFilter)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none shadow-xs"
              >
                <option value="all">All Spend Tiers</option>
                <option value="high">High Consumption (&gt; $10)</option>
                <option value="medium">Medium Consumption ($1 - $10)</option>
                <option value="low">Low Consumption (&lt; $1)</option>
                <option value="zero">Zero Consumption ($0)</option>
              </select>
            </div>
          </div>

          {/* Custom Date Range Row (Conditional) */}
          {timeframe === 'custom' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none shadow-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:border-violet-500 focus:outline-none shadow-xs"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Clear dates
                </button>
              )}
            </div>
          )}

          {/* Active Filter Chips Strip */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Active Filters:
              </span>

              {timeframe !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-100/70 dark:bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                  <span>Period: {timeframe.replace('_', ' ').toUpperCase()}</span>
                  <button onClick={() => setTimeframe('all')} className="hover:text-violet-900 dark:hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {actionTypeFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-100/70 dark:bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
                  <span>Service: {actionTypeFilter === 'jd_evaluation' ? 'JD Matching' : 'Resume Deep Dive'}</span>
                  <button onClick={() => setActionTypeFilter('all')} className="hover:text-purple-900 dark:hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedRecruiterId !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-100/70 dark:bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  <span>
                    Recruiter:{' '}
                    {recruiterConsumption.find((r) => r.recruiterId === selectedRecruiterId)?.recruiterName || selectedRecruiterId}
                  </span>
                  <button onClick={() => setSelectedRecruiterId('all')} className="hover:text-blue-900 dark:hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {spendTierFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-100/70 dark:bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <span>Tier: {spendTierFilter.toUpperCase()}</span>
                  <button onClick={() => setSpendTierFilter('all')} className="hover:text-emerald-900 dark:hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {activityFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-100/70 dark:bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <span>Status: {activityFilter.toUpperCase()}</span>
                  <button onClick={() => setActivityFilter('all')} className="hover:text-amber-900 dark:hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {recruiterSearch && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Search: &quot;{recruiterSearch}&quot;</span>
                  <button onClick={() => setRecruiterSearch('')} className="hover:text-slate-900 dark:hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Filtered Results Quick Banner */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200/80 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-950/30 px-3.5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-slate-700 dark:text-slate-300">
                <span>
                  Showing <strong className="font-bold text-slate-900 dark:text-white">{filteredRecruiters.length}</strong> of {recruiterConsumption.length} seats
                </span>
                <span>•</span>
                <span>
                  Filtered Evals: <strong className="font-bold text-slate-900 dark:text-white">{filteredTotalEvals}</strong>
                </span>
                <span>•</span>
                <span>
                  Filtered Tokens: <strong className="font-bold font-mono text-slate-900 dark:text-white">{filteredTotalTokens.toLocaleString()}</strong>
                </span>
                <span>•</span>
                <span>
                  Filtered Spend: <strong className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">${filteredTotalCost.toFixed(4)}</strong> (₹{(filteredTotalCost * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards: Reconciled across HUD, Ledger, and Super Admin */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Outstanding Deposit Consumed */}
        <div className="rounded-2xl border border-violet-200 dark:border-violet-500/20 bg-gradient-to-br from-violet-50/80 via-white to-violet-50/30 dark:from-violet-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-violet-700 dark:text-violet-400">
              Deposit Consumed
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-500/20">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {formatCurrency(outstandingBalance)}
            </span>
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 font-mono">
              ({hud.usagePercentage}%)
            </span>
          </div>
          <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                hud.usagePercentage > 80
                  ? 'bg-rose-500'
                  : hud.usagePercentage > 50
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(3, hud.usagePercentage))}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
            Limit: {formatCurrency(hud.securityDepositLimit)} • Balance: {formatCurrency(hud.remainingDeposit)} left
          </p>
        </div>

        {/* Cumulative Volume (All-Time) */}
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/30 dark:from-indigo-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-indigo-700 dark:text-indigo-400">
              Cumulative Volume
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {formatCurrency(cumulativeSpend)}
            </span>
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 font-mono">
              (₹{(cumulativeSpend * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
            Matches Monthly Billing Ledger grand total
          </p>
        </div>

        {/* Settled / Paid to Date */}
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 dark:from-emerald-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400">
              Settled to Date
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
              {formatCurrency(settledAmount)}
            </span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-300 font-mono">
              (₹{(settledAmount * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
            Cleared via tax invoices & receipts
          </p>
        </div>

        {/* Filtered Window / Resume Deep Dives */}
        <div className="rounded-2xl border border-purple-200 dark:border-purple-500/20 bg-gradient-to-br from-purple-50/80 via-white to-purple-50/30 dark:from-purple-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-purple-700 dark:text-purple-400">
              {hasActiveFilters ? 'Filtered Spend' : 'Resume Analyses'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-700 dark:text-purple-300 font-mono">
              {hasActiveFilters ? `$${filteredTotalCost.toFixed(4)}` : `${hud.resumeAnalysisCount || 0}`}
            </span>
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
              {hasActiveFilters ? `(${filteredTotalEvals} actions)` : 'deep dives'}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
            {hasActiveFilters ? 'Across currently active filter criteria' : `Billed total: $${hud.resumeAnalysisBilledAmount?.toFixed(4) || '0.0000'}`}
          </p>
        </div>
      </div>

      {/* Banner Linking to Billing Ledger */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-violet-200 dark:border-violet-500/30 bg-gradient-to-r from-violet-50 via-white to-indigo-50 dark:from-violet-950/40 dark:via-slate-900 dark:to-indigo-950/30 p-4 shadow-xs backdrop-blur-xl">
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
        <div className="flex items-center gap-3 rounded-2xl border border-rose-300 dark:border-red-500/30 bg-rose-50/90 dark:bg-red-500/10 p-4 text-xs text-rose-800 dark:text-red-300 shadow-xs">
          <Lock className="h-5 w-5 shrink-0 text-rose-600 dark:text-red-400" />
          <div>
            <strong className="font-bold">Evaluation Limit Reached:</strong>
            <p className="mt-0.5">
              Your agency has reached the deposit limit ({formatCurrency(hud.securityDepositLimit)}). Evaluations are paused. Contact Super Admin to settle funds and reset your balance.
            </p>
          </div>
        </div>
      )}

      {isWarning && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-300 dark:border-amber-500/30 bg-amber-50/90 dark:bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300 shadow-xs">
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
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Recruiter Consumption Meter</span>
              <span className="text-xs font-normal text-slate-500">
                ({filteredRecruiters.length} of {recruiterConsumption.length} seats)
              </span>
            </h3>
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

        {/* Agency Admin Table Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search recruiter name or email..."
              value={recruiterSearch}
              onChange={(e) => setRecruiterSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-violet-500 focus:outline-none"
            />
            {recruiterSearch && (
              <button
                type="button"
                onClick={() => setRecruiterSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Activity Status Toggle */}
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
                Active
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
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:border-violet-500 focus:outline-none"
            >
              <option value="cost_desc">Sort by Billed Cost (High to Low)</option>
              <option value="cost_asc">Sort by Billed Cost (Low to High)</option>
              <option value="evals_desc">Sort by Evaluations (Most First)</option>
              <option value="tokens_desc">Sort by Tokens (Most First)</option>
              <option value="resume_desc">Sort by Resume Analyses (Most First)</option>
              <option value="name_asc">Sort by Recruiter Name (A-Z)</option>
              <option value="recent_desc">Sort by Last Active (Recent First)</option>
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
                  <td className="py-3.5 font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
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
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                      <Filter className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No recruiters match current filters</p>
                      <p className="text-xs mt-1">Try resetting or adjusting the timeframe, search keyword, or volume tier.</p>
                      <button
                        onClick={handleResetFilters}
                        className="mt-3 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition"
                      >
                        Reset All Filters
                      </button>
                    </div>
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
