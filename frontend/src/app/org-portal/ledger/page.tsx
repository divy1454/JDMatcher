'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Filter,
  RefreshCw,
  ExternalLink,
  DollarSign,
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
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PAYMENT_DUE' | 'UNBILLED'>('ALL');
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_desc' | 'amount_asc'>('newest');

  // Invoice Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetails | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  const fetchData = async (isSilent = false) => {
    if (!isSilent && expenses.length === 0) {
      setIsInitialLoading(true);
    } else if (!isSilent) {
      setIsRefreshing(true);
    }

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
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  // 10s silent background auto-refresh
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchData(true);
      }
    }, 10000);
    return () => clearInterval(interval);
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

  // Available Years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    expenses.forEach((e) => {
      const y = e.billingMonth.split('-')[0];
      if (y) years.add(y);
    });
    return Array.from(years).sort().reverse();
  }, [expenses]);

  // Filtered & Sorted Expenses
  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        // Search filter
        if (search.trim()) {
          const s = search.toLowerCase().trim();
          const matches =
            e.monthLabel.toLowerCase().includes(s) ||
            e.billingMonth.toLowerCase().includes(s) ||
            (e.invoice?.invoiceNumber && e.invoice.invoiceNumber.toLowerCase().includes(s));
          if (!matches) return false;
        }

        // Status filter
        if (statusFilter !== 'ALL' && e.status !== statusFilter) {
          return false;
        }

        // Year filter
        if (yearFilter !== 'ALL' && !e.billingMonth.startsWith(yearFilter)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return b.billingMonth.localeCompare(a.billingMonth);
        if (sortBy === 'oldest') return a.billingMonth.localeCompare(b.billingMonth);
        if (sortBy === 'amount_desc') return b.totalAmountUsd - a.totalAmountUsd;
        if (sortBy === 'amount_asc') return a.totalAmountUsd - b.totalAmountUsd;
        return 0;
      });
  }, [expenses, search, statusFilter, yearFilter, sortBy]);

  // Overall Reconciled KPI Totals
  const totalBilledUsd = expenses.reduce((acc, e) => acc + e.totalAmountUsd, 0);
  const totalBilledInr = expenses.reduce((acc, e) => acc + e.totalAmountInr, 0);
  const totalTokens = expenses.reduce((acc, e) => acc + e.totalTokens, 0);

  const paidExpenses = expenses.filter((e) => e.status === 'PAID');
  const paidUsd = paidExpenses.reduce((acc, e) => acc + e.totalAmountUsd, 0);

  const pendingExpenses = expenses.filter((e) => e.status === 'PAYMENT_DUE');
  const pendingUsd = pendingExpenses.reduce((acc, e) => acc + e.totalAmountUsd, 0);

  const unbilledExpenses = expenses.filter((e) => e.status === 'UNBILLED');
  const unbilledUsd = unbilledExpenses.reduce((acc, e) => acc + e.totalAmountUsd, 0);

  // Total Outstanding Balance (matches HUD Deposit Consumed)
  const outstandingBalanceUsd = pendingUsd + unbilledUsd;

  if (isInitialLoading && expenses.length === 0) {
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
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Monthly statements, tax invoices, and UPI payment settlement.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/org-portal/billing"
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <span>Billing HUD</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
          </Link>
          <button
            onClick={() => fetchData(false)}
            disabled={isRefreshing}
            className="rounded-xl border border-slate-800 bg-slate-900/80 p-2 text-slate-400 hover:text-white transition disabled:opacity-50"
            title="Auto-refreshes every 10s. Click to refresh live."
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-violet-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards: Reconciled with Billing HUD and Super Admin */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Cumulative Volume (All-Time) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-slate-400">Cumulative Volume (All-Time)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">${totalBilledUsd.toFixed(2)}</span>
            <span className="text-xs font-semibold text-emerald-400 font-mono">
              (₹{totalBilledInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Across {expenses.length} monthly cycles • Reconciled with HUD</p>
        </div>

        {/* Outstanding / Deposit Consumed */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-amber-400">Outstanding / Unpaid Balance</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-400 font-mono">${outstandingBalanceUsd.toFixed(2)}</span>
            <span className="text-xs text-slate-400 font-mono">
              ({pendingExpenses.length} due, {unbilledExpenses.length} ongoing)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Current unpaid deposit exposure</p>
        </div>

        {/* Paid In Full */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-emerald-400">Settled to Date</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400 font-mono">${paidUsd.toFixed(2)}</span>
            <span className="text-xs text-slate-400 font-mono">({paidExpenses.length} paid)</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Official tax invoices available</p>
        </div>

        {/* Tokens Consumed */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-violet-400">Tokens Incurred</p>
          <p className="mt-2 text-2xl font-black text-white font-mono">
            {(totalTokens / 1_000_000).toFixed(2)}M
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Pure token billing basis</p>
        </div>
      </div>

      {/* Official Billing Notice */}
      <div className="flex items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-950/20 p-4 text-xs text-violet-300">
        <ShieldCheck className="h-5 w-5 shrink-0 text-violet-400" />
        <span>
          <strong>Token Billing Policy:</strong> Invoices are generated strictly on Enterprise AI token consumption. Monthly invoices become downloadable as soon as issued by the Super Admin. Each invoice contains official business details and an instant, auto-filled UPI QR code.
        </span>
      </div>

      {/* Main Ledger Table Card */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-6 backdrop-blur-xl shadow-sm dark:shadow-xl space-y-6">
        {/* Table Filter Controls */}
        <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Monthly Expense Statements</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">Download official tax invoices and review monthly token consumption.</p>
            </div>

            {/* Quick Text Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search month or invoice #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Agency Admin Filter Options Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-1 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  statusFilter === 'ALL'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Cycles ({expenses.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PAID')}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  statusFilter === 'PAID'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Paid ({paidExpenses.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PAYMENT_DUE')}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  statusFilter === 'PAYMENT_DUE'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Payment Due ({pendingExpenses.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('UNBILLED')}
                className={`rounded-lg px-3 py-1 font-semibold transition ${
                  statusFilter === 'UNBILLED'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Unbilled ({unbilledExpenses.length})
              </button>
            </div>

            {/* Year & Sort Dropdowns */}
            <div className="flex items-center gap-2.5">
              {/* Year Filter */}
              {availableYears.length > 0 && (
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-violet-500 focus:outline-none"
                >
                  <option value="ALL">All Years</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Year {yr}
                    </option>
                  ))}
                </select>
              )}

              {/* Sort By */}
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-violet-500 focus:outline-none"
              >
                <option value="newest">Newest Month First</option>
                <option value="oldest">Oldest Month First</option>
                <option value="amount_desc">Highest Amount ($)</option>
                <option value="amount_asc">Lowest Amount ($)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
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
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {filteredExpenses.map((item) => {
                const isPaid = item.status === 'PAID';
                const isDue = item.status === 'PAYMENT_DUE';
                const isUnbilled = item.status === 'UNBILLED';
                const canDownload = item.canDownload && item.invoice !== null;

                return (
                  <tr key={item.billingMonth} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                    {/* Period */}
                    <td className="py-4 pl-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-600/10 border border-violet-200 dark:border-violet-500/20 text-violet-600 dark:text-violet-400">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{item.monthLabel}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {item.billingMonth} • {item.invoice?.invoiceNumber || 'Pending Generation'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Evaluations */}
                    <td className="py-4 font-bold text-slate-800 dark:text-slate-200">
                      {item.totalEvaluations.toLocaleString()} evals
                    </td>

                    {/* Tokens */}
                    <td className="py-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {item.totalTokens.toLocaleString()} tokens
                    </td>

                    {/* USD */}
                    <td className="py-4 font-bold font-mono text-slate-900 dark:text-white">
                      ${item.totalAmountUsd.toFixed(2)}
                    </td>

                    {/* INR */}
                    <td className="py-4 font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      ₹{item.totalAmountInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 text-center">
                      {isPaid && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Paid</span>
                        </span>
                      )}
                      {isDue && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Payment Due</span>
                        </span>
                      )}
                      {isUnbilled && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Unbilled (Ongoing)</span>
                        </span>
                      )}
                    </td>

                    {/* Invoice Action Button */}
                    <td className="py-4 pr-2 text-right">
                      {canDownload ? (
                        <button
                          onClick={() => handleDownloadInvoice(item.invoice!.id)}
                          disabled={loadingInvoiceId === item.invoice!.id}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-violet-500 transition disabled:opacity-50"
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
                          className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 cursor-not-allowed"
                          title="Invoice will become downloadable once issued by Super Admin at monthly close."
                        >
                          <Lock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                          <span>Awaiting Bill</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-500">
                    No monthly cycles matched the selected filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Modal Preview */}
      {selectedInvoice && (
        <BusinessInvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          invoice={selectedInvoice}
        />
      )}
    </div>
  );
}
