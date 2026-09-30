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
  Sparkles,
} from 'lucide-react';
import { BusinessInvoiceModal, InvoiceDetails } from '@/components/invoice/BusinessInvoiceModal';

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

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<AdminInvoiceItem[]>([]);
  const [organizations, setOrganizations] = useState<OrgSimple[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filters
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
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

  const fetchInvoices = async () => {
    try {
      const [invData, orgData] = await Promise.all([
        apiRequest('/invoices/admin/all'),
        apiRequest('/orgs'),
      ]);
      setInvoices(invData || []);
      setOrganizations(orgData || []);

      if (orgData && orgData.length > 0 && !generateForm.organizationId) {
        setGenerateForm((prev) => ({ ...prev, organizationId: orgData[0].id }));
      }
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
      showNotification('error', 'Failed to load invoices: ' + (err.message || 'Server error'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
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
      await fetchInvoices();
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
      await fetchInvoices();
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
  const filteredInvoices = invoices.filter((inv) => {
    if (selectedOrgId !== 'all' && inv.organizationId !== selectedOrgId) return false;
    if (selectedStatus === 'generated' && (!inv.isGenerated || inv.status === 'paid')) return false;
    if (selectedStatus === 'paid' && inv.status !== 'paid') return false;
    if (selectedStatus === 'unbilled' && inv.isGenerated) return false;

    if (search.trim()) {
      const s = search.toLowerCase();
      const matchName = inv.organizationName?.toLowerCase().includes(s);
      const matchNum = inv.invoiceNumber?.toLowerCase().includes(s);
      const matchMonth = inv.billingMonth?.toLowerCase().includes(s);
      if (!matchName && !matchNum && !matchMonth) return false;
    }
    return true;
  });

  // Calculate high level stats
  const totalBilledUsd = invoices.reduce((acc, i) => acc + (parseFloat(i.totalAmountUsd) || 0), 0);
  const totalBilledInr = invoices.reduce((acc, i) => acc + (parseFloat(i.totalAmountInr) || 0), 0);
  const paidCount = invoices.filter((i) => i.status === 'paid').length;
  const pendingCount = invoices.filter((i) => i.isGenerated && i.status !== 'paid').length;

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
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Receipt className="h-6 w-6 text-indigo-400" />
            <span>Agency Invoicing & Billing Control</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Issue monthly business-level bills, manage UPI payment QR codes, and control agency invoice download access.
          </p>
        </div>

        <button
          onClick={() => setIsGenerateModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition active:scale-95 w-fit"
        >
          <Plus className="h-4 w-4" />
          <span>Generate Monthly Bill</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-slate-400">Total Billed Volume</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">${totalBilledUsd.toFixed(2)}</span>
            <span className="text-xs font-semibold text-emerald-400 font-mono">(₹{totalBilledInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })})</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Across all agencies and months</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-slate-400">Invoices Issued</p>
          <p className="mt-2 text-2xl font-black text-white font-mono">{invoices.length}</p>
          <p className="mt-1 text-[11px] text-slate-500">Monthly billing statements</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-emerald-400">Paid In Full</p>
          <p className="mt-2 text-2xl font-black text-emerald-400 font-mono">{paidCount}</p>
          <p className="mt-1 text-[11px] text-slate-500">Settled via UPI / Wire</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <p className="text-xs uppercase font-bold tracking-wider text-amber-400">Pending Settlement</p>
          <p className="mt-2 text-2xl font-black text-amber-400 font-mono">{pendingCount}</p>
          <p className="mt-1 text-[11px] text-slate-500">Payment due from agencies</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search agency, invoice #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Agency Filter */}
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Agencies</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="generated">Generated / Payment Due</option>
            <option value="paid">Paid</option>
            <option value="unbilled">Draft / Unbilled</option>
          </select>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white">Monthly Statements Master Ledger</h2>
            <p className="text-xs text-slate-400">
              Toggle the generation switch to grant or revoke an agency's ability to download their invoice.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Showing {filteredInvoices.length} entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
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
            <tbody className="divide-y divide-slate-800/60">
              {filteredInvoices.map((inv) => {
                const isPaid = inv.status === 'paid';
                const isDue = inv.isGenerated && !isPaid;
                const isDraft = !inv.isGenerated;

                return (
                  <tr key={inv.id} className="hover:bg-slate-800/30 transition">
                    {/* Agency */}
                    <td className="py-4 pl-2">
                      <div className="font-bold text-white">{inv.organizationName || 'Agency'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{inv.organizationSlug}</div>
                    </td>

                    {/* Invoice & Month */}
                    <td className="py-4">
                      <div className="font-mono text-xs font-bold text-indigo-300">{inv.invoiceNumber}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Month: <span className="font-semibold text-white">{inv.billingMonth}</span></div>
                    </td>

                    {/* Usage */}
                    <td className="py-4">
                      <div className="text-xs font-semibold text-slate-200">
                        {inv.totalEvaluations.toLocaleString()} evaluations
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {(inv.totalTokens / 1_000_000).toFixed(2)}M tokens
                      </div>
                    </td>

                    {/* Total USD / INR */}
                    <td className="py-4">
                      <div className="text-sm font-bold text-white font-mono">
                        ${parseFloat(inv.totalAmountUsd).toFixed(2)}
                      </div>
                      <div className="text-xs font-semibold text-emerald-400 font-mono">
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
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                            : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                        }`}
                        title={
                          inv.isGenerated
                            ? 'Bill is Generated: Agency CAN download invoice. Click to hide.'
                            : 'Bill is Hidden: Agency CANNOT download invoice. Click to allow download.'
                        }
                      >
                        {inv.isGenerated ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Download Enabled</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
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
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
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
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-slate-700 hover:border-slate-600 transition"
                      >
                        <Eye className="h-3.5 w-3.5 text-indigo-400" />
                        <span>View Invoice & QR</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-500">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Generate Monthly Bill</h3>
              </div>
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {generateError && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {generateError}
              </div>
            )}

            <form onSubmit={handleGenerateInvoice} className="mt-4 space-y-4 text-xs">
              {/* Select Agency */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Target Agency</label>
                <select
                  value={generateForm.organizationId}
                  onChange={(e) => setGenerateForm({ ...generateForm, organizationId: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                  required
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.slug})
                    </option>
                  ))}
                </select>
              </div>

              {/* Billing Month */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Billing Month (YYYY-MM)</label>
                <input
                  type="text"
                  placeholder="2026-10"
                  value={generateForm.billingMonth}
                  onChange={(e) => setGenerateForm({ ...generateForm, billingMonth: e.target.value })}
                  pattern="^\d{4}-\d{2}$"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              {/* Consumption Stats Banner */}
              {consumptionLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                  <span>Fetching agency ledger consumption and live exchange rate...</span>
                </div>
              ) : agencyConsumption ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Evaluations Executed: <b className="text-white font-mono">{agencyConsumption.evaluations}</b></span>
                    <span>Total Tokens Consumed: <b className="text-white font-mono">{agencyConsumption.totalTokens.toLocaleString()}</b></span>
                  </div>
                </div>
              ) : null}

              {/* Amount USD & INR Exchange Rate - Non-Editable */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold">Subtotal (USD)</label>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                      Consumed (Locked)
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.0001"
                    value={generateForm.customSubtotalUsd}
                    readOnly
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-emerald-400 font-mono font-bold cursor-not-allowed outline-none select-all"
                    title="Exact consumed amount derived directly from agency ledger telemetry. Non-editable."
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Based on exact tokens consumed by this agency</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold">USD to INR Rate</label>
                    <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.2 text-[10px] font-bold text-indigo-400 border border-indigo-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {agencyConsumption?.isLiveRate ? 'Live Online Rate' : 'Online Rate'}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={generateForm.exchangeRateInr}
                    readOnly
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-indigo-300 font-mono font-bold cursor-not-allowed outline-none select-all"
                    title="Fetched live from real-time currency exchange API. Non-editable."
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Fetched online in real-time (Locked)</p>
                </div>
              </div>

              {/* Converted INR Preview */}
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-3 text-xs">
                <span className="text-slate-400">Total Billed in INR: </span>
                <span className="font-bold text-emerald-400 font-mono text-sm ml-1">
                  ₹{(generateForm.customSubtotalUsd * generateForm.exchangeRateInr).toFixed(2)}
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Calculated automatically from actual consumption & live conversion rate. Pre-fills UPI QR code upon generation.
                </p>
              </div>

              {/* Due Date Days */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Payment Due (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={generateForm.dueDateDays}
                  onChange={(e) => setGenerateForm({ ...generateForm, dueDateDays: parseInt(e.target.value, 10) || 15 })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Custom Notes */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Invoice Notes</label>
                <textarea
                  rows={2}
                  value={generateForm.notes}
                  onChange={(e) => setGenerateForm({ ...generateForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
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
