'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { apiRequest } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  CreditCard,
  AlertTriangle,
  Lock,
  Cpu,
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
  };
  recruiterConsumption: Array<{
    recruiterId: string;
    recruiterName: string;
    recruiterEmail: string;
    totalEvaluations: number;
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
      {/* Page Title */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            API Usage & Evaluation Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time analytics of candidate evaluations, token usage trends, and recruiter performance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-1.5 text-xs">
            <span className="text-slate-400">Total Billed:</span>
            <span className="font-bold text-white">{formatCurrency(hud.totalBilledAmount)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-1.5 text-xs">
            <span className="text-slate-400">Limit:</span>
            <span className="font-bold text-violet-400">{formatCurrency(hud.securityDepositLimit)}</span>
          </div>
        </div>
      </div>

      {/* 402 Hard Lockout Banner */}
      {hud.isLocked && (
        <div className="flex items-start gap-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-5 backdrop-blur-xl">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-red-200">
              Security Deposit Limit Reached • Extension Locked (HTTP 402)
            </h3>
            <p className="mt-1 text-xs text-red-300">
              Your agency has reached 100% of the assigned security deposit limit ({formatCurrency(hud.securityDepositLimit)}).
              Candidate evaluations in the Chrome Extension are paused. Please contact your Super Admin to wire/settle funds and reset your balance.
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white">Recruiter Consumption Ledger</h3>
            <p className="text-xs text-slate-400">
              Aggregated candidate match consumption broken down by recruiter seat
            </p>
          </div>
          <Cpu className="h-5 w-5 text-violet-400" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="pb-3 pl-2">Recruiter</th>
                <th className="pb-3">Total Evaluations</th>
                <th className="pb-3">Tokens Consumed</th>
                <th className="pb-3">Billed Cost (USD)</th>
                <th className="pb-3 pr-2 text-right">Last Match Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {recruiterConsumption.map((recruiter) => (
                <tr key={recruiter.recruiterId} className="hover:bg-slate-800/30 transition">
                  <td className="py-3.5 pl-2">
                    <div className="font-medium text-white">{recruiter.recruiterName}</div>
                    <div className="text-xs text-slate-500">{recruiter.recruiterEmail}</div>
                  </td>
                  <td className="py-3.5 font-bold text-slate-200">
                    {recruiter.totalEvaluations}
                  </td>
                  <td className="py-3.5 font-mono text-xs text-slate-400">
                    {recruiter.totalTokens.toLocaleString()} tokens
                  </td>
                  <td className="py-3.5 font-semibold text-emerald-400">
                    ${parseFloat(recruiter.totalBilledCostUsd).toFixed(4)}
                  </td>
                  <td className="py-3.5 pr-2 text-right text-xs text-slate-400">
                    {recruiter.lastEvaluationAt
                      ? new Date(recruiter.lastEvaluationAt).toLocaleString()
                      : 'Never'}
                  </td>
                </tr>
              ))}

              {recruiterConsumption.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
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
