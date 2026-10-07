'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Building2,
  Plus,
  CheckCircle,
  AlertTriangle,
  Lock,
  RotateCcw,
  Sparkles,
  Users,
  Search,
  Pencil,
  X,
  Check,
  Percent,
  ChevronDown,
  FileText,
} from 'lucide-react';
import { CustomDropdown } from '@/components/ui/CustomDropdown';

interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
  securityDepositLimit: string;
  totalBilledAmount: string;
  profitMultiplier: string;
  isActive: boolean;
  recruiterCount: number;
  resumeAnalysisCount?: number;
  createdAt: string;
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<OrganizationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<OrganizationItem | null>(null);
  const [editingOrg, setEditingOrg] = useState<OrganizationItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State for new Agency Provisioning
  const [formData, setFormData] = useState<{
    name: string;
    slug: string;
    securityDepositLimit: number | string;
    profitMultiplier: number | string;
    adminEmail: string;
    adminFullName: string;
    adminPassword: string;
  }>({
    name: '',
    slug: '',
    securityDepositLimit: 500,
    profitMultiplier: 4.0,
    adminEmail: '',
    adminFullName: '',
    adminPassword: '',
  });

  // Edit Multiplier & Billing Modal State
  const [editMultiplier, setEditMultiplier] = useState<number | string>(4.0);
  const [editDepositLimit, setEditDepositLimit] = useState<number | string>(500);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editError, setEditError] = useState<string>('');

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  const fetchOrgs = async () => {
    try {
      const data = await apiRequest('/orgs');
      setOrgs(data);
    } catch (err: any) {
      console.error('Failed to fetch organizations:', err);
      showNotification('error', 'Failed to fetch organizations: ' + (err.message || 'Server error'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDeposit = Number(formData.securityDepositLimit);
    const parsedMultiplier = Number(formData.profitMultiplier);

    if (isNaN(parsedDeposit) || parsedDeposit <= 0) {
      showNotification('error', 'Please enter a valid positive security deposit credit limit');
      return;
    }
    if (isNaN(parsedMultiplier) || parsedMultiplier < 1.0) {
      showNotification('error', 'Profit multiplier must be at least 1.0x');
      return;
    }

    setActionLoading(true);

    try {
      await apiRequest('/orgs', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          securityDepositLimit: parsedDeposit,
          profitMultiplier: parsedMultiplier,
        }),
      });

      setIsModalOpen(false);
      setFormData({
        name: '',
        slug: '',
        securityDepositLimit: 500,
        profitMultiplier: 4.0,
        adminEmail: '',
        adminFullName: '',
        adminPassword: '',
      });
      showNotification('success', `Agency "${formData.name}" provisioned successfully!`);
      await fetchOrgs();
    } catch (err: any) {
      showNotification('error', 'Error creating agency: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAsPaid = async (orgId: string) => {
    setActionLoading(true);
    try {
      await apiRequest(`/orgs/${orgId}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const targetName = markPaidTarget?.name || 'Agency';
      setMarkPaidTarget(null);
      showNotification('success', `Security deposit balance for "${targetName}" marked as paid & reset to $0.00!`);
      await fetchOrgs();
    } catch (err: any) {
      showNotification('error', 'Failed to mark as paid: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (org: OrganizationItem) => {
    setEditingOrg(org);
    setEditMultiplier(parseFloat(org.profitMultiplier) || 4.0);
    setEditDepositLimit(parseFloat(org.securityDepositLimit) || 500);
    setEditIsActive(org.isActive);
    setEditError('');
  };

  const handleSaveBillingSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;

    const parsedDeposit = Number(editDepositLimit);
    const parsedMultiplier = Number(editMultiplier);

    if (isNaN(parsedMultiplier) || parsedMultiplier < 1.0) {
      setEditError('Profit multiplier must be at least 1.0x');
      return;
    }
    if (isNaN(parsedDeposit) || parsedDeposit <= 0) {
      setEditError('Security deposit limit must be greater than $0');
      return;
    }

    setActionLoading(true);
    setEditError('');

    try {
      const updated = await apiRequest(`/orgs/${editingOrg.id}/billing-settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          profitMultiplier: parsedMultiplier,
          securityDepositLimit: parsedDeposit,
          isActive: editIsActive,
        }),
      });

      setOrgs((prev) =>
        prev.map((o) =>
          o.id === editingOrg.id
            ? {
              ...o,
              profitMultiplier: updated.profitMultiplier,
              securityDepositLimit: updated.securityDepositLimit,
              isActive: updated.isActive,
            }
            : o
        )
      );

      const savedName = editingOrg.name;
      setEditingOrg(null);
      showNotification(
        'success',
        `Multiplier for "${savedName}" updated to ${Number(editMultiplier).toFixed(2)}x and deposit limit set to $${editDepositLimit}!`
      );
    } catch (err: any) {
      setEditError(err.message || 'Failed to update billing settings');
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-xl border p-4 text-sm font-medium backdrop-blur-xl transition ${notification.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="rounded-lg p-1 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Agency Organizations</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage agencies, security deposit limits, and billing multipliers.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-violet-500"
        >
          <Plus className="h-4 w-4" />
          <span>Provision New Agency</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-3 py-2 shadow-xs backdrop-blur">
        <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agency by name or slug..."
          className="ml-2 w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
        />
      </div>

      {/* Organizations Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm dark:shadow-xl backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4">Agency Name</th>
                <th className="px-6 py-4">Security Deposit Status</th>
                <th className="px-6 py-4">Multiplier (Editable)</th>
                <th className="px-6 py-4">Seats</th>
                <th className="px-6 py-4">Resume Analyses</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
              {filtered.map((org) => {
                const limit = parseFloat(org.securityDepositLimit);
                const billed = parseFloat(org.totalBilledAmount);
                const percentUsed = Math.min(100, Math.round((billed / limit) * 100));
                const isLocked = billed >= limit;
                const isWarning = percentUsed >= 80 && !isLocked;

                return (
                  <tr key={org.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold">
                          {org.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{org.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{org.slug}</p>
                        </div>
                      </div>
                    </td>

                    {/* Security Deposit Meter */}
                    <td className="px-6 py-4">
                      <div className="w-56 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(billed)}{' '}
                            <span className="font-normal text-slate-500 dark:text-slate-400">/ {formatCurrency(limit)}</span>
                          </span>
                          <span
                            className={`font-bold ${isLocked
                                ? 'text-red-600 dark:text-red-400'
                                : isWarning
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                          >
                            {percentUsed}%
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-transparent">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${isLocked
                                ? 'bg-red-500'
                                : isWarning
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                            style={{ width: `${percentUsed}%` }}
                          />
                        </div>
                        {isLocked && (
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                            <Lock className="h-3 w-3" />
                            <span>Limit Reached (Locked)</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Clickable Multiplier with Pencil */}
                    <td className="px-6 py-4">
                      <button
                        onClick={() => openEditModal(org)}
                        className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:border-indigo-300 dark:hover:border-indigo-500/60 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition shadow-xs"
                        title="Click to edit profit multiplier"
                      >
                        <span>{org.profitMultiplier}x</span>
                        <Pencil className="h-3 w-3 text-indigo-600 dark:text-indigo-400 opacity-70 group-hover:opacity-100 transition" />
                      </button>
                    </td>

                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {org.recruiterCount} Recruiters
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-950/30 px-2.5 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300">
                        <FileText className="h-3.5 w-3.5 text-purple-500" />
                        {org.resumeAnalysisCount ?? 0}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(org.createdAt)}
                    </td>

                    {/* Actions: Edit Multiplier & Mark as Paid */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(org)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition hover:bg-indigo-100 dark:hover:bg-indigo-500/20 shadow-xs"
                          title="Edit agency profit multiplier and security deposit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Edit Multiplier</span>
                        </button>

                        <button
                          onClick={() => setMarkPaidTarget(org)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 transition hover:bg-emerald-100 dark:hover:bg-emerald-500/20 shadow-xs"
                        >
                          <RotateCcw className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          <span>Mark as Paid</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500 dark:text-slate-400">
                    No agencies match the query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Multiplier & Deposit Modal */}
      {editingOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Agency Billing Settings</h3>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">{editingOrg.name} ({editingOrg.slug})</p>
              </div>
              <button
                onClick={() => setEditingOrg(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveBillingSettings} className="mt-4 space-y-4">
              {/* Profit Multiplier Input */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Profit Multiplier (x)
                  </label>
                  <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                    {editMultiplier !== '' ? `${Number(editMultiplier).toFixed(2)}x` : '—'}
                  </span>
                </div>
                <div className="relative mt-1.5">
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="100.0"
                    required
                    value={editMultiplier}
                    onChange={(e) => setEditMultiplier(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                  />
                  <div className="pointer-events-none absolute right-3 top-3 text-xs font-bold text-slate-400 dark:text-slate-500">
                    Multiplier
                  </div>
                </div>
              </div>

              {/* Security Deposit Limit Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Security Deposit Credit Limit ($)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={editDepositLimit}
                  onChange={(e) => setEditDepositLimit(e.target.value)}
                  placeholder="Enter any custom deposit limit (e.g. 50, 250.75, 1000)"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              {/* Status Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Agency Status
                </label>
                <CustomDropdown
                  value={editIsActive ? 'active' : 'suspended'}
                  onChange={(val) => setEditIsActive(val === 'active')}
                  options={[
                    {
                      value: 'active',
                      label: 'Active',
                      badge: 'Active',
                      color: 'text-emerald-400',
                    },
                    {
                      value: 'suspended',
                      label: 'Suspended',
                      badge: 'Blocked',
                      color: 'text-rose-400',
                    },
                  ]}
                  placeholder="Select Status"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingOrg(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition"
                >
                  {actionLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Balance / Mark as Paid Modal */}
      {markPaidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Settle Agency Balance</h3>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              Are you sure you want to mark all outstanding balances for{' '}
              <span className="font-semibold text-slate-900 dark:text-white">{markPaidTarget.name}</span> as received?
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              This will reset the total billed amount from{' '}
              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(parseFloat(markPaidTarget.totalBilledAmount))}
              </span>{' '}
              to <span className="font-bold text-emerald-700 dark:text-emerald-400">$0.00</span>.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setMarkPaidTarget(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMarkAsPaid(markPaidTarget.id)}
                disabled={actionLoading}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision Agency Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Provision New Agency</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Agency Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        name: e.target.value,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
                      })
                    }
                    placeholder="Apex Staffing Solutions"
                    className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Tenant Slug</label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="apex-staffing"
                    className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Security Deposit Credit Limit ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={formData.securityDepositLimit}
                    onChange={(e) =>
                      setFormData({ ...formData, securityDepositLimit: e.target.value })
                    }
                    placeholder="Enter any amount (e.g. 50, 250, 1500)"
                    className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Profit Multiplier</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    required
                    value={formData.profitMultiplier}
                    onChange={(e) =>
                      setFormData({ ...formData, profitMultiplier: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Initial Org Admin Credentials
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Admin Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.adminFullName}
                  onChange={(e) => setFormData({ ...formData, adminFullName: e.target.value })}
                  placeholder="Sarah Jenkins"
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Admin Email</label>
                <input
                  type="email"
                  required
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  placeholder="admin@agency.com"
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Initial Password</label>
                <input
                  type="password"
                  required
                  value={formData.adminPassword}
                  onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                  placeholder="••••••••••••"
                  className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50"
                >
                  {actionLoading ? 'Provisioning...' : 'Provision Agency & Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
