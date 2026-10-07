'use client';

import React, { useState, useEffect } from 'react';
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
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [hudRes, analyticsRes] = await Promise.all([
        apiRequest('/orgs/my-org'),
        apiRequest('/orgs/my-org/analytics').catch(() => null),
      ]);
      setData(hudRes);
      setAnalytics(analyticsRes);
    } catch (err) {
      console.error('Failed to load billing & analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (isLoading || !data) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  const { hud, recruiterConsumption } = data;
  const isWarning = hud.usagePercentage >= 80 && !hud.isLocked;

  const totalEvaluations =
    analytics?.verdictStats
      ? analytics.verdictStats.applyCount +
        analytics.verdictStats.skipCount +
        analytics.verdictStats.otherCount
      : recruiterConsumption.reduce((acc, r) => acc + r.totalEvaluations, 0);

  return (
    <div className="space-y-6">
      {/* Page Title & Meters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>API Usage & Billing</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Candidate evaluation metrics, token usage, and deposit limits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-950/40 px-3.5 py-1.5 text-xs shadow-xs">
            <FileText className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            <span className="font-medium text-purple-700 dark:text-purple-300">Resume Analyses:</span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">{hud.resumeAnalysisCount || 0}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-3.5 py-1.5 text-xs shadow-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Deposit Billed:</span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">{formatCurrency(hud.totalBilledAmount)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-3.5 py-1.5 text-xs shadow-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Deposit Limit:</span>
            <span className="font-bold text-violet-600 dark:text-violet-400 font-mono">{formatCurrency(hud.securityDepositLimit)}</span>
          </div>
        </div>
      </div>

      {/* Banner Linking to New Billing Ledger Tab */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-violet-200 dark:border-violet-500/30 bg-gradient-to-r from-violet-50 via-white to-indigo-50 dark:from-violet-950/40 dark:via-slate-900 dark:to-indigo-950/30 p-4 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-600/20 text-violet-600 dark:text-violet-400">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Monthly Invoices & Payments</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Download monthly billing statements and scan UPI QR codes in the Billing Ledger.
            </p>
          </div>
        </div>

        <Link
          href="/org-portal/ledger"
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-violet-600/25 hover:bg-violet-500 transition active:scale-95 shrink-0 w-fit"
        >
          <span>View Ledger</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* 402 Hard Lockout Banner */}
      {hud.isLocked && (
        <div className="flex items-start gap-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-5 backdrop-blur-xl">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-red-200">
              Deposit Limit Reached • Account Locked
            </h3>
            <p className="mt-1 text-xs text-red-300">
              Your agency has reached the deposit limit ({formatCurrency(hud.securityDepositLimit)}). Evaluations are paused. Contact Super Admin to settle funds and unlock your account.
            </p>
          </div>
        </div>
      )}

      {/* 80% Warning Banner */}
      {isWarning && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <span className="text-xs font-medium">
            Attention: You have consumed {hud.usagePercentage}% of your security deposit limit. Settle with Super Admin soon to avoid automated 402 evaluation pauses.
          </span>
        </div>
      )}

      {/* Interactive Charts (Client-only dynamically loaded) */}
      <BillingCharts
        dailyStats={analytics?.dailyStats}
        recruiterBreakdown={analytics?.recruiterBreakdown}
        verdictStats={analytics?.verdictStats}
        totalEvaluations={totalEvaluations}
      />

      {/* Recruiter Token Consumption Ledger Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-xl">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Recruiter Consumption Meter</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregated candidate match & resume analysis consumption broken down by recruiter seat
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
              {recruiterConsumption.map((recruiter) => (
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

              {recruiterConsumption.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    No evaluations executed yet by any recruiter seats.
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
