'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Receipt,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  Download,
  Filter,
  Search,
  Building2,
  Calendar,
  ToggleLeft,
  ToggleRight,
  QrCode,
  DollarSign,
  ShieldCheck,
  X,
  ChevronDown,
  RefreshCw,
  TrendingUp,
  RotateCcw,
  ArrowUpDown,
  Zap,
  Users,
  Briefcase,
  ArrowRight,
} from 'lucide-react';
import { BusinessInvoiceModal, InvoiceDetails } from '@/components/invoice/BusinessInvoiceModal';
import { CustomDropdown, DropdownOption } from '@/components/ui/CustomDropdown';

interface AdminInvoiceItem {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  invoiceNumber: string;
  billingMonth: string;
  issueDate: string;
  dueDate: string;
  status: 'draft' | 'pending' | 'generated' | 'paid' | 'overdue' | 'void';
  isGenerated: boolean;
  totalEvaluations: number;
  totalTokens: number;
  totalAmountUsd: string;
  totalAmountInr: string;
  exchangeRateInr: string;
  generatedAt: string | null;
  generatedBy: string | null;
  paidAt: string | null;
}

interface OrgSimple {
  id: string;
  name: string;
  slug: string;
}

export interface AgencyBreakdownItem {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  isActive: boolean;
  adminEmail: string | null;
  recruiterCount: number;
  totalInvoicedUsd: number;
  totalPaidUsd: number;
  totalPendingUsd: number;
  totalUnbilledUsd: number;
  totalLifetimeVolumeUsd: number;
  totalRawCostUsd?: number;
  totalProfitUsd?: number;
  totalSettledProfitUsd?: number;
  profitMarginPercent?: number;
  depositUsed: number;
  depositAllowed: number;
  depositRemaining: number;
  depositUsagePercent: number;
  invoicesCount: number;
  paidCount: number;
  pendingCount: number;
  latestInvoiceMonth: string | null;
  latestInvoiceStatus: string | null;
  status: 'good_standing' | 'pending_payment' | 'deposit_alert';
}

interface AdminSummary {
  totalInvoicedUsd: number;
  totalPaidUsd: number;
  totalPendingUsd: number;
  totalUnbilledUsd: number;
  totalPlatformVolumeUsd: number;
  totalRawCostUsd?: number;
  totalProfitUsd?: number;
  totalSettledProfitUsd?: number;
  profitMarginPercent?: number;
  totalSecurityDepositPoolUsd?: number;
  totalDepositUsedUsd?: number;
  invoicesCount: number;
  paidInvoicesCount?: number;
  pendingInvoicesCount?: number;
  agenciesCount?: number;
  activeAgenciesCount?: number;
  agenciesBreakdown?: AgencyBreakdownItem[];
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<AdminInvoiceItem[]>([]);
  const [organizations, setOrganizations] = useState<OrgSimple[]>([]);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filters
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('month-desc');
  const [search, setSearch] = useState<string>('');

  // Invoice Preview Modal
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetails | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  // Generate Bill Modal
  const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [agencyConsumption, setAgencyConsumption] = useState<{
    evaluations: number;
    totalTokens: number;
    subtotalUsd: number;
    exchangeRateInr: number;
    isLiveRate: boolean;
    totalInr: number;
  } | null>(null);

  const [generateForm, setGenerateForm] = useState({
    organizationId: '',
    billingMonth: getCurrentMonth(),
    exchangeRateInr: 86.50,
    customSubtotalUsd: 0.00,
    dueDateDays: 15,
    notes: 'Scan the UPI QR code to settle via Google Pay, PhonePe, or Paytm.',
  });
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Automatically fetch exact agency consumption & live USD to INR rate
  const loadAgencyConsumption = async (orgId: string, month: string) => {
    if (!orgId || !month) return;
    setConsumptionLoading(true);
    try {
      const data = await apiRequest(`/invoices/admin/agency-consumption?organizationId=${orgId}&billingMonth=${month}`);
      if (data) {
        setAgencyConsumption(data);
        setGenerateForm((prev) => ({
          ...prev,
          customSubtotalUsd: data.subtotalUsd,
          exchangeRateInr: data.exchangeRateInr,
        }));
      }
    } catch (err: any) {
      console.error('Failed to load agency consumption:', err);
    } finally {
      setConsumptionLoading(false);
    }
  };

  useEffect(() => {
    if (isGenerateModalOpen && generateForm.organizationId && generateForm.billingMonth) {
      loadAgencyConsumption(generateForm.organizationId, generateForm.billingMonth);
    }
  }, [isGenerateModalOpen, generateForm.organizationId, generateForm.billingMonth]);

  // Notification Banner
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  const fetchInvoices = async (isSilent = false) => {
    if (!isSilent && invoices.length === 0) {
      setIsInitialLoading(true);
    } else if (!isSilent) {
      setIsRefreshing(true);
    }

    try {
      const [invData, orgData, summaryData] = await Promise.all([
        apiRequest('/invoices/admin/all'),
        apiRequest('/orgs'),
        apiRequest('/invoices/admin/summary').catch(() => null),
      ]);
      setInvoices(invData || []);
      setOrganizations(orgData || []);
      if (summaryData) setSummary(summaryData);

      if (orgData && orgData.length > 0 && !generateForm.organizationId) {
        setGenerateForm((prev) => ({ ...prev, organizationId: orgData[0].id }));
      }
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
      if (!isSilent) {
        showNotification('error', 'Failed to load invoices: ' + (err.message || 'Server error'));
      }
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchInvoices(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handle toggling Super Admin bill generation approval
  const handleToggleGeneration = async (invoiceId: string, currentIsGenerated: boolean) => {
    setActionLoadingId(invoiceId);
    try {
      await apiRequest(`/invoices/admin/${invoiceId}/toggle-generation`, {
        method: 'PATCH',
        body: JSON.stringify({ isGenerated: !currentIsGenerated }),
      });
      showNotification(
        'success',
        !currentIsGenerated
          ? 'Bill generated and published! Agency can now download this invoice.'
          : 'Bill un-published. Invoice download is now hidden from the agency.'
      );
      await fetchInvoices(true);
    } catch (err: any) {
      showNotification('error', 'Error toggling generation: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle marking an invoice as Paid / Pending
  const handleTogglePaidStatus = async (invoiceId: string, currentStatus: string) => {
    setActionLoadingId(invoiceId);
    const newStatus = currentStatus === 'paid' ? 'generated' : 'paid';
    try {
      await apiRequest(`/invoices/admin/${invoiceId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      showNotification(
        'success',
        newStatus === 'paid'
          ? 'Invoice marked as PAID! Transaction receipt updated.'
          : 'Invoice status reverted to PAYMENT DUE.'
      );
      await fetchInvoices(true);
    } catch (err: any) {
      showNotification('error', 'Failed to update invoice status: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open full real-life business invoice preview
  const handlePreviewInvoice = async (invoiceId: string) => {
    setActionLoadingId(invoiceId);
    try {
      const res = await apiRequest(`/invoices/${invoiceId}`);
      if (res && res.invoice) {
        setSelectedInvoice({
          ...res.invoice,
          organizationName: res.organization?.name,
          organizationSlug: res.organization?.slug,
        });
        setIsInvoiceModalOpen(true);
      }
    } catch (err: any) {
      showNotification('error', 'Failed to preview invoice: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle generating a new monthly invoice
  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!generateForm.organizationId) {
      setGenerateError('Please select an agency');
      return;
    }

    setGenerateLoading(true);
    setGenerateError('');

    try {
      await apiRequest('/invoices/admin/generate', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: generateForm.organizationId,
          billingMonth: generateForm.billingMonth,
          exchangeRateInr: Number(generateForm.exchangeRateInr),
          customSubtotalUsd: Number(generateForm.customSubtotalUsd),
          dueDateDays: Number(generateForm.dueDateDays),
          notes: generateForm.notes,
        }),
      });

      showNotification('success', `Monthly bill for ${generateForm.billingMonth} generated successfully! Agency can now download it.`);
      setIsGenerateModalOpen(false);
      await fetchInvoices();
    } catch (err: any) {
      setGenerateError(err.message || 'Failed to generate invoice');
    } finally {
      setGenerateLoading(false);
    }
  };

  // Filtered Invoices
  const filteredInvoices = invoices
    .filter((inv) => {
      if (selectedOrgId !== 'all' && inv.organizationId !== selectedOrgId) return false;
      if (selectedStatus === 'generated' && (!inv.isGenerated || inv.status === 'paid')) return false;
      if (selectedStatus === 'paid' && inv.status !== 'paid') return false;
      if (selectedStatus === 'unbilled' && inv.isGenerated) return false;
      if (selectedMonth !== 'all' && inv.billingMonth !== selectedMonth) return false;

      if (search.trim()) {
        const s = search.toLowerCase();
        const matchName = inv.organizationName?.toLowerCase().includes(s);
        const matchNum = inv.invoiceNumber?.toLowerCase().includes(s);
        const matchMonth = inv.billingMonth?.toLowerCase().includes(s);
        if (!matchName && !matchNum && !matchMonth) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'month-desc') return b.billingMonth.localeCompare(a.billingMonth);
      if (sortBy === 'month-asc') return a.billingMonth.localeCompare(b.billingMonth);
      if (sortBy === 'amount-desc') return (parseFloat(b.totalAmountUsd) || 0) - (parseFloat(a.totalAmountUsd) || 0);
      if (sortBy === 'amount-asc') return (parseFloat(a.totalAmountUsd) || 0) - (parseFloat(b.totalAmountUsd) || 0);
      return 0;
    });

  // Calculate high level stats from invoices list
  const totalBilledUsd = invoices.reduce((acc, i) => acc + (parseFloat(i.totalAmountUsd) || 0), 0);
  const paidCount = invoices.filter((i) => i.status === 'paid').length;
  const pendingCount = invoices.filter((i) => i.isGenerated && i.status !== 'paid').length;

  // Selected agency lookup from breakdown
  const selectedAgency = summary?.agenciesBreakdown?.find((a) => a.organizationId === selectedOrgId);

  // Financial KPI calculations responsive to selected agency
  const displayIncomeUsd = selectedAgency
    ? selectedAgency.totalPaidUsd
    : (summary?.totalPaidUsd ?? 0);

  const displayBilledUsd = selectedAgency
    ? selectedAgency.totalInvoicedUsd
    : (summary?.totalInvoicedUsd ?? totalBilledUsd);

  const displayUnbilledUsd = selectedAgency
    ? selectedAgency.totalUnbilledUsd
    : (summary?.totalUnbilledUsd ?? 0);

  const displayPlatformVolumeUsd = selectedAgency
    ? selectedAgency.totalLifetimeVolumeUsd
    : (summary?.totalPlatformVolumeUsd ?? (displayBilledUsd + displayUnbilledUsd));

  const displayPendingUsd = selectedAgency
    ? selectedAgency.totalPendingUsd
    : (summary?.totalPendingUsd ?? 0);

  const displaySecurityDepositPool = selectedAgency
    ? selectedAgency.depositAllowed
    : (summary?.totalSecurityDepositPoolUsd ?? 500);

  const displayDepositUsed = selectedAgency
    ? selectedAgency.depositUsed
    : (summary?.totalDepositUsedUsd ?? 0);

  // Super Admin Net Profit calculations
  const displayProfitUsd = selectedAgency
    ? (selectedAgency.totalProfitUsd ?? Number((selectedAgency.totalLifetimeVolumeUsd * 0.75).toFixed(2)))
    : (summary?.totalProfitUsd ?? Number((displayPlatformVolumeUsd * 0.75).toFixed(2)));

  const displayRawCostUsd = selectedAgency
    ? (selectedAgency.totalRawCostUsd ?? Number((selectedAgency.totalLifetimeVolumeUsd * 0.25).toFixed(2)))
    : (summary?.totalRawCostUsd ?? Number((displayPlatformVolumeUsd * 0.25).toFixed(2)));

  const displayProfitMarginPercent = selectedAgency
    ? (selectedAgency.profitMarginPercent ?? 75)
    : (summary?.profitMarginPercent ?? 75);

  // Unique billing months from invoices for month filter
  const uniqueMonths = Array.from(new Set(invoices.map((i) => i.billingMonth).filter(Boolean))).sort().reverse();

  const monthFilterOptions: DropdownOption[] = [
    { value: 'all', label: 'All Billing Months' },
    ...uniqueMonths.map((m) => ({
      value: m,
      label: `Month: ${m}`,
    })),
  ];

  const sortFilterOptions: DropdownOption[] = [
    { value: 'month-desc', label: 'Sort: Newest Month' },
    { value: 'month-asc', label: 'Sort: Oldest Month' },
    { value: 'amount-desc', label: 'Sort: Highest Amount' },
    { value: 'amount-asc', label: 'Sort: Lowest Amount' },
  ];

  const resetFilters = () => {
    setSelectedOrgId('all');
    setSelectedStatus('all');
    setSelectedMonth('all');
    setSearch('');
    setSortBy('month-desc');
  };

  const hasActiveFilters = Boolean(
    selectedOrgId !== 'all' || selectedStatus !== 'all' || selectedMonth !== 'all' || search.trim() || sortBy !== 'month-desc'
  );

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-2xl backdrop-blur-xl transition-all ${
            notification.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
              : 'border-red-500/40 bg-red-950/90 text-red-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 rounded-lg p-1 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 shadow-xs">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Multi-Agency Invoicing & Billing</span>
                <span className="rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-400">
                  {organizations.length} Agencies
                </span>
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Enterprise billing command center: profit tracking, unbilled token usage, and UPI reconciliation.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchInvoices(false)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            title="Auto-refreshes every 10s. Click to refresh live."
          >
            <RefreshCw className={`h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Updating...' : 'Live Sync'}</span>
          </button>
          <button
            onClick={() => setIsGenerateModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition active:scale-95 w-fit"
          >
            <Plus className="h-4 w-4" />
            <span>Generate Bill</span>
          </button>
        </div>
      </div>

      {/* Custom Agency Selector Strip (z-40 so popover menu opens cleanly OVER below cards) */}
      <div className="relative z-40 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3.5 shadow-xs backdrop-blur-xl">
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 whitespace-nowrap">
            Billing Portfolio Scope:
          </span>
          <div className="w-full sm:w-64">
            <CustomDropdown
              size="sm"
              value={selectedOrgId}
              onChange={setSelectedOrgId}
              options={[
                { value: 'all', label: 'All Agencies (Global Portfolio)', badge: `${organizations.length}` },
                ...organizations.map((org) => ({
                  value: org.id,
                  label: org.name,
                  sublabel: org.slug,
                })),
              ]}
              icon={<Building2 className="h-3.5 w-3.5" />}
              placeholder="Select Agency"
            />
          </div>
        </div>

        {selectedOrgId !== 'all' && (
          <button
            onClick={() => setSelectedOrgId('all')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Switch to Global All Agencies View</span>
          </button>
        )}
      </div>

      {/* Selected Agency Business Profile Card (When an Agency is Chosen) */}
      {selectedAgency && (
        <div className="relative z-20 rounded-2xl border border-indigo-200 dark:border-indigo-500/30 bg-gradient-to-r from-indigo-50/90 via-white to-purple-50/80 dark:from-indigo-950/40 dark:via-slate-900/60 dark:to-purple-950/30 p-5 backdrop-blur-xl shadow-xs dark:shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{selectedAgency.organizationName}</span>
                    <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-500/20 font-bold">
                      @{selectedAgency.organizationSlug}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                    <span>Admin: <strong className="text-slate-900 dark:text-slate-300">{selectedAgency.adminEmail || 'Admin Account'}</strong></span>
                    <span>•</span>
                    <span>Active Recruiter Seats: <strong className="text-indigo-700 dark:text-indigo-300">{selectedAgency.recruiterCount}</strong></span>
                    <span>•</span>
                    <span>Latest Month: <strong className="text-slate-900 dark:text-slate-300">{selectedAgency.latestInvoiceMonth || 'None'}</strong></span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Deposit meter */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/80 px-3.5 py-2 shadow-xs">
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Security Deposit</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    ${selectedAgency.depositUsed.toFixed(2)} / ${selectedAgency.depositAllowed.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-44 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      selectedAgency.depositUsagePercent > 80
                        ? 'bg-rose-500'
                        : selectedAgency.depositUsagePercent > 50
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(3, selectedAgency.depositUsagePercent))}%` }}
                  />
                </div>
              </div>

              {/* Quick Action: Generate Bill for this Agency */}
              <button
                onClick={() => {
                  setGenerateForm((prev) => ({ ...prev, organizationId: selectedAgency.organizationId }));
                  setIsGenerateModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Generate {selectedAgency.organizationName} Bill</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6 Executive Real Business Financial KPI Cards (relative z-10) */}
      <div className="relative z-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Net Profit (Instead of All-Time Income) */}
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 dark:from-emerald-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400">
              {selectedAgency ? `${selectedAgency.organizationName} Net Profit` : 'My Net Profit (Platform)'}
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
              ${displayProfitUsd.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-300 font-mono">
              (₹{(displayProfitUsd * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
            {displayProfitMarginPercent}% net margin • Volume ${displayPlatformVolumeUsd.toFixed(2)} − AI Cost ${displayRawCostUsd.toFixed(2)}
          </p>
        </div>

        {/* 2. Total Invoiced Volume */}
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/30 dark:from-indigo-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase font-bold tracking-wider text-indigo-700 dark:text-indigo-400">Total Billed (Invoiced)</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              ${displayBilledUsd.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 font-mono">
              (₹{(displayBilledUsd * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
            {selectedAgency ? selectedAgency.invoicesCount : (summary?.invoicesCount ?? invoices.length)} billing statements issued
          </p>
        </div>

        {/* 3. Ongoing Unbilled (WIP) */}
        <div className="rounded-2xl border border-sky-200 dark:border-sky-500/20 bg-gradient-to-br from-sky-50/80 via-white to-sky-50/30 dark:from-sky-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase font-bold tracking-wider text-sky-700 dark:text-sky-400">Ongoing Unbilled (WIP)</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-sky-700 dark:text-sky-400 font-mono">
              ${displayUnbilledUsd.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-sky-600 dark:text-sky-300 font-mono">
              (₹{(displayUnbilledUsd * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
            Live token ledger usage not yet billed
          </p>
        </div>

        {/* 4. Total Lifetime Volume */}
        <div className="rounded-2xl border border-purple-200 dark:border-purple-500/20 bg-gradient-to-br from-purple-50/80 via-white to-purple-50/30 dark:from-purple-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase font-bold tracking-wider text-purple-700 dark:text-purple-400">Total Lifetime Volume</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-800 dark:text-purple-300 font-mono">
              ${displayPlatformVolumeUsd.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-200 font-mono">
              (₹{(displayPlatformVolumeUsd * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
            Invoiced (${displayBilledUsd.toFixed(2)}) + Unbilled (${displayUnbilledUsd.toFixed(2)})
          </p>
        </div>

        {/* 5. Pending Receivables */}
        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/30 dark:from-amber-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase font-bold tracking-wider text-amber-700 dark:text-amber-400">Pending Receivables</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-700 dark:text-amber-400 font-mono">
              ${displayPendingUsd.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-300 font-mono">
              (₹{(displayPendingUsd * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
            {selectedAgency ? selectedAgency.pendingCount : (summary?.pendingInvoicesCount ?? pendingCount)} awaiting UPI settlement
          </p>
        </div>

        {/* 6. Security Deposits Buffer */}
        <div className="rounded-2xl border border-teal-200 dark:border-teal-500/20 bg-gradient-to-br from-teal-50/80 via-white to-teal-50/30 dark:from-teal-950/30 dark:via-slate-900/40 dark:to-slate-900/60 p-5 shadow-xs backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase font-bold tracking-wider text-teal-700 dark:text-teal-400">Security Deposit Pool</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              ${displaySecurityDepositPool.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-teal-600 dark:text-teal-300 font-mono">
              (Used: ${displayDepositUsed.toFixed(2)})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
            Available buffer: ${(displaySecurityDepositPool - displayDepositUsed).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Multi-Agency Billing Portfolio Matrix (When viewing All Agencies) */}
      {selectedOrgId === 'all' && summary?.agenciesBreakdown && summary.agenciesBreakdown.length > 0 && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>Multi-Agency Billing Portfolio Matrix</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Executive portfolio matrix showing settled income, invoiced vs unbilled consumption, and deposit security health.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {summary.agenciesBreakdown.length} Registered Agencies
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="pb-3 pl-2">Agency</th>
                  <th className="pb-3">Admin & Team</th>
                  <th className="pb-3">Net Profit</th>
                  <th className="pb-3">Invoiced Volume</th>
                  <th className="pb-3">Unbilled (WIP)</th>
                  <th className="pb-3">Lifetime Gross</th>
                  <th className="pb-3">Deposit Exposure</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {summary.agenciesBreakdown.map((agency) => (
                  <tr key={agency.organizationId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-4 pl-2">
                      <div className="font-bold text-slate-900 dark:text-white">{agency.organizationName}</div>
                      <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">@{agency.organizationSlug}</div>
                    </td>

                    <td className="py-4">
                      <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">{agency.adminEmail || 'Admin'}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{agency.recruiterCount} active seat{agency.recruiterCount === 1 ? '' : 's'}</div>
                    </td>

                    <td className="py-4">
                      <div className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        ${(agency.totalProfitUsd ?? (agency.totalLifetimeVolumeUsd * 0.75)).toFixed(2)}
                      </div>
                      <div className="text-[11px] font-mono text-emerald-600/80 dark:text-emerald-500/80">
                        ₹{((agency.totalProfitUsd ?? (agency.totalLifetimeVolumeUsd * 0.75)) * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {agency.profitMarginPercent ?? 75}% margin
                      </div>
                    </td>

                    <td className="py-4">
                      <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-200">
                        ${agency.totalInvoicedUsd.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {agency.invoicesCount} statement{agency.invoicesCount === 1 ? '' : 's'}
                      </div>
                    </td>

                    <td className="py-4">
                      <div className="font-mono text-sm font-bold text-sky-700 dark:text-sky-400">
                        ${agency.totalUnbilledUsd.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Live ledger
                      </div>
                    </td>

                    <td className="py-4">
                      <div className="font-mono text-sm font-bold text-purple-800 dark:text-purple-300">
                        ${agency.totalLifetimeVolumeUsd.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-mono text-purple-600/80 dark:text-purple-400/80">
                        ₹{(agency.totalLifetimeVolumeUsd * 86.5).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                    </td>

                    <td className="py-4">
                      <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                        ${agency.depositUsed.toFixed(2)} / ${agency.depositAllowed.toFixed(2)}
                      </div>
                      <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            agency.depositUsagePercent > 80 ? 'bg-rose-500' : agency.depositUsagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(4, agency.depositUsagePercent))}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                          agency.status === 'good_standing'
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                            : agency.status === 'pending_payment'
                            ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400'
                            : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {agency.status === 'good_standing' ? 'Healthy' : agency.status === 'pending_payment' ? 'Payment Due' : 'Deposit Alert'}
                      </span>
                    </td>

                    <td className="py-4 pr-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedOrgId(agency.organizationId)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition"
                          title="Focus on this agency's billing statements"
                        >
                          <span>Focus Agency</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => {
                            setGenerateForm((prev) => ({ ...prev, organizationId: agency.organizationId }));
                            setIsGenerateModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/40 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white transition"
                          title="Generate bill for this agency"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Bill</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Multi-Factor Filter Bar for Invoices Master Ledger */}
      <div className="relative z-20 space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search agency, invoice #, month..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Agency Filter */}
          <div className="sm:col-span-3">
            <CustomDropdown
              size="sm"
              value={selectedOrgId}
              onChange={setSelectedOrgId}
              options={[
                { value: 'all', label: 'All Agencies', badge: `${organizations.length}` },
                ...organizations.map((org) => ({
                  value: org.id,
                  label: org.name,
                  sublabel: org.slug,
                })),
              ]}
              icon={<Building2 className="h-3.5 w-3.5" />}
              placeholder="Filter by Agency"
            />
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-3">
            <CustomDropdown
              size="sm"
              value={selectedStatus}
              onChange={setSelectedStatus}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'generated', label: 'Payment Due', badge: '⏳ Due', color: 'text-amber-700 dark:text-amber-300' },
                { value: 'paid', label: 'Paid', badge: '✓ Paid', color: 'text-emerald-700 dark:text-emerald-300' },
                { value: 'unbilled', label: 'Draft / Unbilled', badge: '📝 Draft', color: 'text-slate-600 dark:text-slate-400' },
              ]}
              icon={<Filter className="h-3.5 w-3.5" />}
              placeholder="Filter by Status"
            />
          </div>

          {/* Month Filter */}
          <div className="sm:col-span-2">
            <CustomDropdown
              size="sm"
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={monthFilterOptions}
              icon={<Calendar className="h-3.5 w-3.5" />}
              placeholder="Filter by Month"
            />
          </div>
        </div>

        {/* Sorting & Filter Reset */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Order by:</span>
            <div className="w-48">
              <CustomDropdown
                size="sm"
                value={sortBy}
                onChange={setSortBy}
                options={sortFilterOptions}
                icon={<ArrowUpDown className="h-3.5 w-3.5" />}
                placeholder="Sort By"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Filtered: {filteredInvoices.length} of {invoices.length} statements
              </span>
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear all filters</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="relative z-10 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Monthly Statements Master Ledger</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Toggle the generation switch to grant or revoke an agency's ability to download their invoice.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Showing {filteredInvoices.length} entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="pb-3 pl-2">Agency</th>
                <th className="pb-3">Invoice & Month</th>
                <th className="pb-3">Usage</th>
                <th className="pb-3">Total (USD / INR)</th>
                <th className="pb-3 text-center">Download Access</th>
                <th className="pb-3 text-center">Payment Status</th>
                <th className="pb-3 pr-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredInvoices.map((inv) => {
                const isPaid = inv.status === 'paid';
                const isDue = inv.isGenerated && !isPaid;
                const isDraft = !inv.isGenerated;

                return (
                  <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition">
                    {/* Agency */}
                    <td className="py-4 pl-2">
                      <div className="font-bold text-slate-900 dark:text-white">{inv.organizationName || 'Agency'}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{inv.organizationSlug}</div>
                    </td>

                    {/* Invoice & Month */}
                    <td className="py-4">
                      <div className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300">{inv.invoiceNumber}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{inv.billingMonth}</div>
                    </td>

                    {/* Usage */}
                    <td className="py-4">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {inv.totalEvaluations.toLocaleString()} evaluations
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {(inv.totalTokens / 1_000_000).toFixed(2)}M tokens
                      </div>
                    </td>

                    {/* Total USD / INR */}
                    <td className="py-4">
                      <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                        ${parseFloat(inv.totalAmountUsd).toFixed(2)}
                      </div>
                      <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                        ₹{parseFloat(inv.totalAmountInr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </td>

                    {/* Bill Generation Toggle (Super Admin Choice!) */}
                    <td className="py-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleGeneration(inv.id, inv.isGenerated)}
                        disabled={actionLoadingId === inv.id}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 ${
                          inv.isGenerated
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200 shadow-xs'
                        }`}
                        title={
                          inv.isGenerated
                            ? 'Bill is Generated: Agency CAN download invoice. Click to hide.'
                            : 'Bill is Hidden: Agency CANNOT download invoice. Click to allow download.'
                        }
                      >
                        {inv.isGenerated ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Download Enabled</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                            <span>Download Hidden</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Payment Status Toggle */}
                    <td className="py-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePaidStatus(inv.id, inv.status)}
                        disabled={actionLoadingId === inv.id}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold transition active:scale-95 ${
                          isPaid
                            ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-100 dark:hover:bg-emerald-500/30 shadow-xs'
                            : 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 hover:bg-amber-100 dark:hover:bg-amber-500/30 shadow-xs'
                        }`}
                        title="Click to toggle Paid / Pending"
                      >
                        {isPaid ? 'PAID' : 'DUE'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-4 pr-2 text-right">
                      <button
                        type="button"
                        onClick={() => handlePreviewInvoice(inv.id)}
                        disabled={actionLoadingId === inv.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-slate-700 bg-indigo-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-white shadow-xs hover:bg-indigo-100 dark:hover:bg-slate-700 hover:border-indigo-300 dark:hover:border-slate-600 transition"
                      >
                        <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>View Invoice</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                    No invoices found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* GENERATE MONTHLY BILL MODAL */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 dark:bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Generate Bill</h3>
              </div>
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {generateError && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300">
                {generateError}
              </div>
            )}

            <form onSubmit={handleGenerateInvoice} className="mt-4 space-y-4 text-xs">
              {/* Select Agency */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Target Agency</label>
                <CustomDropdown
                  size="sm"
                  value={generateForm.organizationId}
                  onChange={(val) => setGenerateForm({ ...generateForm, organizationId: val })}
                  options={organizations.map((org) => ({
                    value: org.id,
                    label: org.name,
                    sublabel: org.slug,
                  }))}
                  icon={<Building2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
                  placeholder="Select Agency"
                />
              </div>

              {/* Billing Month */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Billing Month (YYYY-MM)</label>
                <input
                  type="text"
                  placeholder="2026-10"
                  value={generateForm.billingMonth}
                  onChange={(e) => setGenerateForm({ ...generateForm, billingMonth: e.target.value })}
                  pattern="^\d{4}-\d{2}$"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white font-mono focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              {/* Consumption Stats Banner */}
              {consumptionLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-500 dark:text-slate-400">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                  <span>Fetching agency ledger consumption and live exchange rate...</span>
                </div>
              ) : agencyConsumption ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 p-3 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                    <span>Evaluations Executed: <b className="text-slate-900 dark:text-white font-mono">{agencyConsumption.evaluations}</b></span>
                    <span>Total Tokens Consumed: <b className="text-slate-900 dark:text-white font-mono">{agencyConsumption.totalTokens.toLocaleString()}</b></span>
                  </div>
                </div>
              ) : null}

              {/* Amount USD & INR Exchange Rate - Non-Editable */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold">Subtotal (USD)</label>
                    <span className="rounded bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                      Consumed (Locked)
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.0001"
                    value={generateForm.customSubtotalUsd}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 px-3 py-2 text-emerald-700 dark:text-emerald-400 font-mono font-bold cursor-not-allowed outline-none select-all"
                    title="Exact consumed amount derived directly from agency ledger telemetry. Non-editable."
                    required
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Based on exact tokens consumed by this agency</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold">USD to INR Rate</label>
                    <span className="inline-flex items-center gap-1 rounded bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.2 text-[10px] font-bold text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                      {agencyConsumption?.isLiveRate ? 'Live Online Rate' : 'Online Rate'}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={generateForm.exchangeRateInr}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 px-3 py-2 text-indigo-700 dark:text-indigo-300 font-mono font-bold cursor-not-allowed outline-none select-all"
                    title="Fetched live from real-time currency exchange API. Non-editable."
                    required
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Fetched online in real-time (Locked)</p>
                </div>
              </div>

              {/* Converted INR Preview */}
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50/80 dark:bg-indigo-950/30 p-3 text-xs">
                <span className="text-slate-600 dark:text-slate-400">Total Billed in INR: </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono text-sm ml-1">
                  ₹{(generateForm.customSubtotalUsd * generateForm.exchangeRateInr).toFixed(2)}
                </span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Calculated automatically from actual consumption & live conversion rate. Pre-fills UPI QR code upon generation.
                </p>
              </div>

              {/* Due Date Days */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Payment Due (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={generateForm.dueDateDays}
                  onChange={(e) => setGenerateForm({ ...generateForm, dueDateDays: parseInt(e.target.value, 10) || 15 })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Custom Notes */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Invoice Notes</label>
                <textarea
                  rows={2}
                  value={generateForm.notes}
                  onChange={(e) => setGenerateForm({ ...generateForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-transparent px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generateLoading}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition active:scale-95 disabled:opacity-50"
                >
                  {generateLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Receipt className="h-4 w-4" />
                  )}
                  <span>Generate & Issue Bill</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real-Life Business Tax Invoice Modal with Scannable UPI QR */}
      <BusinessInvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoice={selectedInvoice}
      />
    </div>
  );
}
