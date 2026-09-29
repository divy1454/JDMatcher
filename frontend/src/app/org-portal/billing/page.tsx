'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { apiRequest } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  CreditCard,
  AlertTriangle,
  Lock,
  Cpu,
  Download,
  FileText,
  Clock,
  CheckCircle2,
  QrCode,
  IndianRupee,
  Calendar,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { BusinessInvoiceModal, InvoiceDetails } from '@/components/invoice/BusinessInvoiceModal';

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

interface MonthlyExpenseItem {
  billingMonth: string;
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
  totalEvaluations: number;
  totalTokens: number;
  totalAmountUsd: number;
  totalAmountInr: number;
  exchangeRateInr: number;
  status: 'PAID' | 'PAYMENT_DUE' | 'UNBILLED';
  isBillGenerated: boolean;
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    isGenerated: boolean;
    dueDate: string;
    issueDate: string;
    paidAt: string | null;
  } | null;
  canDownload: boolean;
}

export default function BillingHUDPage() {
  const [data, setData] = useState<BillingHUDData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [expenses, setExpenses] = useState<MonthlyExpenseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Invoice Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetails | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [hudRes, analyticsRes, expensesRes] = await Promise.all([
        apiRequest('/orgs/my-org'),
        apiRequest('/orgs/my-org/analytics').catch(() => null),
        apiRequest('/invoices/my-expenses').catch(() => []),
      ]);
      setData(hudRes);
      setAnalytics(analyticsRes);
      setExpenses(expensesRes || []);
    } catch (err) {
      console.error('Failed to load billing & analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDownloadInvoice = async (invoiceId: string) => {
    setLoadingInvoiceId(invoiceId);
    try {
      const res = await apiRequest(`/invoices/${invoiceId}`);
      if (res && res.invoice) {
        setSelectedInvoice({
          ...res.invoice,
          organizationName: res.organization?.name || data?.organization.name,
          organizationSlug: res.organization?.slug || data?.organization.slug,
        });
        setIsInvoiceModalOpen(true);
      }
    } catch (err: any) {
      alert(`Could not load invoice: ${err.message || 'Invoice unavailable'}`);
    } finally {
      setLoadingInvoiceId(null);
    }
  };

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

  // Calculate cumulative stats
  const totalExpensesUsd = expenses.reduce((acc, e) => acc + e.totalAmountUsd, 0);
  const totalExpensesInr = expenses.reduce((acc, e) => acc + e.totalAmountInr, 0);
  const settledInvoicesCount = expenses.filter((e) => e.status === 'PAID').length;

  return (
    <div className="space-y-8">
      {/* Page Title & Quick Meters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span>Billing & Expense Center</span>
            <span className="rounded-full bg-violet-500/10 border border-violet-500/30 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
              UPI Integrated
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Monthly expense tracking, real-life business tax invoices, and real-time security deposit meters.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-1.5 text-xs shadow-sm">
            <span className="text-slate-400">Current Deposit Billed:</span>
            <span className="font-bold text-white font-mono">{formatCurrency(hud.totalBilledAmount)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-1.5 text-xs shadow-sm">
            <span className="text-slate-400">Deposit Limit:</span>
            <span className="font-bold text-violet-400 font-mono">{formatCurrency(hud.securityDepositLimit)}</span>
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
              Candidate evaluations in the Chrome Extension are paused. Please contact your Super Admin to wire/settle funds via UPI or bank transfer.
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

      {/* MONTHLY EXPENSE TRACKING & INVOICES (User's Primary Feature Requirement) */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl space-y-6">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Monthly Expense Tracking & Invoices
              </h2>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                Live Ledger
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Track candidate evaluations and token expenses by month. Download official business tax invoices with auto-filled UPI QR codes.
            </p>
          </div>

          {/* Quick Summary Pill Counters */}
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-right">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">All-Time Expense</p>
              <p className="text-sm font-bold text-white font-mono">
                ${totalExpensesUsd.toFixed(2)}{' '}
                <span className="text-xs font-medium text-emerald-400">
                  (₹{totalExpensesInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-right">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Settled Invoices</p>
              <p className="text-sm font-bold text-emerald-400 font-mono">
                {settledInvoicesCount} / {expenses.length}
              </p>
            </div>
          </div>
        </div>

        {/* Informational Notice about Super Admin Bill Generation */}
        <div className="flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-950/20 px-4 py-2.5 text-xs text-indigo-300">
          <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-400" />
          <span>
            <strong>Official Billing Notice:</strong> Monthly invoice download buttons are made available once Super Admin generates and verifies the monthly statement. Invoices include official owner details (Divy Patel) and an instant UPI QR code with amount auto-fill.
          </span>
        </div>

        {/* Monthly Expenses Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="pb-3 pl-2">Billing Month</th>
                <th className="pb-3">Evaluations</th>
                <th className="pb-3">Tokens Consumed</th>
                <th className="pb-3">Expense (USD)</th>
                <th className="pb-3">Amount (INR)</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 pr-2 text-right">Invoice Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {expenses.map((item) => {
                const isPaid = item.status === 'PAID';
                const isDue = item.status === 'PAYMENT_DUE';
                const isUnbilled = item.status === 'UNBILLED';
                const canDownload = item.canDownload && item.invoice !== null;

                return (
                  <tr key={item.billingMonth} className="hover:bg-slate-800/30 transition">
                    {/* Month Label */}
                    <td className="py-4 pl-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/10 border border-violet-500/20 text-violet-400">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-bold text-white">{item.monthLabel}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {item.billingMonth} • {item.invoice?.invoiceNumber || 'Pending Bill'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Evaluations */}
                    <td className="py-4 font-bold text-slate-200">
                      {item.totalEvaluations.toLocaleString()} evals
                    </td>

                    {/* Tokens */}
                    <td className="py-4 font-mono text-xs text-slate-400">
                      {(item.totalTokens / 1_000_000).toFixed(2)}M tokens
                    </td>

                    {/* USD Expense */}
                    <td className="py-4 font-bold text-white font-mono">
                      ${item.totalAmountUsd.toFixed(2)}
                    </td>

                    {/* INR Amount (Auto-converted) */}
                    <td className="py-4 font-bold text-emerald-400 font-mono">
                      ₹{item.totalAmountInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 text-center">
                      {isPaid && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          PAID
                        </span>
                      )}
                      {isDue && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                          PAYMENT DUE
                        </span>
                      )}
                      {isUnbilled && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-medium text-slate-400">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          UNBILLED
                        </span>
                      )}
                    </td>

                    {/* Download Button (Only available if Super Admin generated the bill!) */}
                    <td className="py-4 pr-2 text-right">
                      {canDownload ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadInvoice(item.invoice!.id)}
                          disabled={loadingInvoiceId === item.invoice!.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-violet-600/25 hover:from-violet-500 hover:to-indigo-500 transition active:scale-95 disabled:opacity-50"
                        >
                          {loadingInvoiceId === item.invoice!.id ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          <span>Download Invoice</span>
                        </button>
                      ) : (
                        <div
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[11px] font-medium text-slate-500"
                          title="This month's invoice will become downloadable once generated by Super Admin"
                        >
                          <Lock className="h-3 w-3 text-slate-600" />
                          <span>Pending Super Admin Generation</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {expenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                    No monthly billing data recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                  <td className="py-3.5 font-semibold text-emerald-400 font-mono">
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

      {/* Real-Life Business Tax Invoice Modal with Scannable UPI QR */}
      <BusinessInvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoice={selectedInvoice}
      />
    </div>
  );
}
