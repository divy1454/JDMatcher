'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Receipt,
  Download,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Lock,
  QrCode,
  ShieldCheck,
  ArrowRight,
  Cpu,
  Search,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { BusinessInvoiceModal, InvoiceDetails } from '@/components/invoice/BusinessInvoiceModal';

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

interface OrgInfo {
  name: string;
  slug: string;
}

export default function AgencyBillingLedgerPage() {
  const [expenses, setExpenses] = useState<MonthlyExpenseItem[]>([]);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Invoice Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetails | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [expensesRes, orgRes] = await Promise.all([
        apiRequest('/invoices/my-expenses').catch(() => []),
        apiRequest('/orgs/my-org').catch(() => null),
      ]);
      setExpenses(expensesRes || []);
      if (orgRes && orgRes.organization) {
        setOrg({
          name: orgRes.organization.name,
          slug: orgRes.organization.slug,
        });
      }
    } catch (err) {
      console.error('Failed to load agency billing ledger:', err);
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
          organizationName: res.organization?.name || org?.name,
          organizationSlug: res.organization?.slug || org?.slug,
        });
        setIsInvoiceModalOpen(true);
      }
    } catch (err: any) {
      alert(`Could not load invoice: ${err.message || 'Invoice unavailable'}`);
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const filteredExpenses = expenses.filter((e) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      e.monthLabel.toLowerCase().includes(s) ||
      e.billingMonth.toLowerCase().includes(s) ||
      (e.invoice?.invoiceNumber && e.invoice.invoiceNumber.toLowerCase().includes(s))
    );
  });

  const totalBilledUsd = expenses.reduce((acc, e) => acc + e.totalAmountUsd, 0);
  const totalBilledInr = expenses.reduce((acc, e) => acc + e.totalAmountInr, 0);
  const totalEvaluations = expenses.reduce((acc, e) => acc + e.totalEvaluations, 0);
  const totalTokens = expenses.reduce((acc, e) => acc + e.totalTokens, 0);
  const settledCount = expenses.filter((e) => e.status === 'PAID').length;
  const pendingCount = expenses.filter((e) => e.status === 'PAYMENT_DUE').length;

  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Receipt className="h-6 w-6 text-violet-400" />
            <span>Monthly Billing Ledger</span>
            <span className="rounded-full bg-violet-500/10 border border-violet-500/30 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
              Invoices & UPI
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Official monthly statements, pure token consumption accounting, and tax invoices with instant UPI QR payments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/org-portal/billing"
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <span>View Billing HUD</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
          <button
            onClick={() => {
              setIsLoading(true);
              fetchData();
            }}
            className="rounded-xl border border-slate-800 bg-slate-900/80 p-2 text-slate-400 hover:text-white transition"
            title="Refresh Ledger"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Billed */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-slate-400">Cumulative Expense</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">${totalBilledUsd.toFixed(2)}</span>
            <span className="text-xs font-semibold text-emerald-400 font-mono">
              (₹{totalBilledInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Across {expenses.length} monthly cycles</p>
        </div>

        {/* Tokens Consumed */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-violet-400">Tokens Incurred</p>
          <p className="mt-2 text-2xl font-black text-white font-mono">
            {(totalTokens / 1_000_000).toFixed(2)}M
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Pure token billing basis</p>
        </div>

        {/* Paid Invoices */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-emerald-400">Paid Invoices</p>
          <p className="mt-2 text-2xl font-black text-emerald-400 font-mono">{settledCount}</p>
          <p className="mt-1 text-[11px] text-slate-500">Settled receipts available</p>
        </div>

        {/* Payment Due */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-amber-400">Payment Due</p>
          <p className="mt-2 text-2xl font-black text-amber-400 font-mono">{pendingCount}</p>
          <p className="mt-1 text-[11px] text-slate-500">Awaiting UPI settlement</p>
        </div>
      </div>

      {/* Official Billing Notice */}
      <div className="flex items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-950/20 p-4 text-xs text-violet-300">
        <ShieldCheck className="h-5 w-5 shrink-0 text-violet-400" />
        <span>
          <strong>Token Billing Policy:</strong> Invoices are generated strictly on Gemini 3.5 Flash-Lite LLM token consumption. Monthly invoices become downloadable as soon as issued by the Super Admin. Each invoice contains official business details and an instant, auto-filled UPI QR code.
        </span>
      </div>

      {/* Main Ledger Table Card */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl space-y-6">
        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Monthly Expense Statements</h2>
            <p className="text-xs text-slate-400">Download official tax invoices and review monthly token consumption.</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by month or invoice #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="pb-3 pl-2">Billing Period</th>
                <th className="pb-3">Evaluations</th>
                <th className="pb-3">Tokens Consumed</th>
                <th className="pb-3">Total (USD)</th>
                <th className="pb-3">Payable (INR)</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 pr-2 text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredExpenses.map((item) => {
                const isPaid = item.status === 'PAID';
                const isDue = item.status === 'PAYMENT_DUE';
                const isUnbilled = item.status === 'UNBILLED';
                const canDownload = item.canDownload && item.invoice !== null;

                return (
                  <tr key={item.billingMonth} className="hover:bg-slate-800/30 transition">
                    {/* Period */}
                    <td className="py-4 pl-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-bold text-white">{item.monthLabel}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {item.billingMonth} • {item.invoice?.invoiceNumber || 'Pending Generation'}
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

                    {/* USD Total */}
                    <td className="py-4 font-bold text-white font-mono">
                      ${item.totalAmountUsd.toFixed(2)}
                    </td>

                    {/* INR Total */}
                    <td className="py-4 font-bold text-emerald-400 font-mono">
                      ₹{item.totalAmountInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Status */}
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

                    {/* Download Button (Only enabled if Super Admin generated the bill!) */}
                    <td className="py-4 pr-2 text-right">
                      {canDownload ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadInvoice(item.invoice!.id)}
                          disabled={loadingInvoiceId === item.invoice!.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-violet-600/25 hover:from-violet-500 hover:to-indigo-500 transition active:scale-95 disabled:opacity-50"
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

              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-500">
                    No billing statements found matching your criteria.
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
