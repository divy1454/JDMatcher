'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { apiRequest } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  User,
  Mail,
  Key,
  Building2,
  Users,
  CreditCard,
  Sliders,
  ShieldCheck,
  Save,
  ArrowRight,
  Receipt,
} from 'lucide-react';

export default function OrgAdminProfilePage() {
  const { user, organization, updateUserData } = useAuth();

  // Admin Info State
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  // Agency Info State
  const [orgName, setOrgName] = useState(organization?.name || '');
  const [isUpdatingOrg, setIsUpdatingOrg] = useState(false);
  const [orgSuccessMsg, setOrgSuccessMsg] = useState('');
  const [orgErrorMsg, setOrgErrorMsg] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setEmail(user.email || '');
    }
    if (organization) {
      setOrgName(organization.name || '');
    }
  }, [user, organization]);

  // Update Admin Details
  const handleUpdateAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccessMsg('');
    setProfileErrorMsg('');

    if (!fullName.trim() || !email.trim()) {
      setProfileErrorMsg('Full name and email are required.');
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const res = await apiRequest('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
        }),
      });

      if (res.user) {
        updateUserData(res.user, res.organization, res.token);
      }
      setProfileSuccessMsg('Admin profile updated successfully!');
      setTimeout(() => setProfileSuccessMsg(''), 4000);
    } catch (err: any) {
      setProfileErrorMsg(err.message || 'Failed to update admin profile.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Update Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccessMsg('');
    setPasswordErrorMsg('');

    if (!currentPassword) {
      setPasswordErrorMsg('Current password is required.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordErrorMsg('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('New password and confirmation do not match.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await apiRequest('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (res.user) {
        updateUserData(res.user, res.organization, res.token);
      }
      setPasswordSuccessMsg('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccessMsg(''), 4000);
    } catch (err: any) {
      setPasswordErrorMsg(err.message || 'Failed to update password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Update Agency Details
  const handleUpdateOrgDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgSuccessMsg('');
    setOrgErrorMsg('');

    if (!orgName.trim()) {
      setOrgErrorMsg('Organization name cannot be empty.');
      return;
    }

    setIsUpdatingOrg(true);
    try {
      const res = await apiRequest('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          organizationName: orgName.trim(),
        }),
      });

      if (res.user) {
        updateUserData(res.user, res.organization, res.token);
      }
      setOrgSuccessMsg('Agency organization name updated successfully!');
      setTimeout(() => setOrgSuccessMsg(''), 4000);
    } catch (err: any) {
      setOrgErrorMsg(err.message || 'Failed to update organization details.');
    } finally {
      setIsUpdatingOrg(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Agency Profile &amp; Administrator Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your personal admin credentials, update organization branding, and inspect agency quota settings.
          </p>
        </div>

        {/* Agency Tag */}
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-xs shadow-sm">
          <Building2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{organization?.name || 'Agency Workspace'}</p>
            <p className="text-[10px] text-slate-500">Org Admin ID: {user?.id.slice(0, 8)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* CARD 1: Administrator Information */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Administrator Information</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Personal details for your agency admin seat</p>
            </div>
          </div>

          <form onSubmit={handleUpdateAdminProfile} className="mt-5 space-y-4">
            {profileSuccessMsg && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                ✓ {profileSuccessMsg}
              </div>
            )}
            {profileErrorMsg && (
              <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/20 p-3 text-xs text-red-700 dark:text-red-300">
                ✕ {profileErrorMsg}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/50"
                placeholder="e.g. Agency Director"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/50"
                placeholder="admin@agency.com"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isUpdatingProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 transition disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{isUpdatingProfile ? 'Saving...' : 'Save Admin Details'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* CARD 2: Security & Credentials */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Security &amp; Password</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Change your administrative account password</p>
            </div>
          </div>

          <form onSubmit={handleUpdatePassword} className="mt-5 space-y-4">
            {passwordSuccessMsg && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                ✓ {passwordSuccessMsg}
              </div>
            )}
            {passwordErrorMsg && (
              <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/20 p-3 text-xs text-red-700 dark:text-red-300">
                ✕ {passwordErrorMsg}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 transition disabled:opacity-50"
              >
                <Key className="h-4 w-4" />
                <span>{isUpdatingPassword ? 'Updating...' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* CARD 3: Agency Organization Details */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Agency Organization Workspace</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage your agency organization name and view workspace settings
            </p>
          </div>
        </div>

        <form onSubmit={handleUpdateOrgDetails} className="mt-5 space-y-4">
          {orgSuccessMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-700 dark:text-emerald-300">
              ✓ {orgSuccessMsg}
            </div>
          )}
          {orgErrorMsg && (
            <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/20 p-3 text-xs text-red-700 dark:text-red-300">
              ✕ {orgErrorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Agency Organization Name</label>
              <input
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="e.g. Apex IT Global"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Agency Slug Identifier</label>
              <input
                type="text"
                disabled
                value={organization?.slug || '—'}
                className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isUpdatingOrg}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{isUpdatingOrg ? 'Saving...' : 'Update Agency Name'}</span>
            </button>
          </div>
        </form>

        {/* Agency Quick Navigation Cards */}
        <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-6">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Agency Management Hub
          </h3>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              href="/org-portal/team"
              className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 transition hover:bg-slate-100 dark:hover:bg-slate-900 group"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-violet-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-violet-500 transition">
                    Recruiter Team &amp; Locks
                  </p>
                  <p className="text-[10px] text-slate-500">Manage seats &amp; approve transfers</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 transition" />
            </Link>

            <Link
              href="/org-portal/settings"
              className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 transition hover:bg-slate-100 dark:hover:bg-slate-900 group"
            >
              <div className="flex items-center gap-3">
                <Sliders className="h-5 w-5 text-indigo-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-indigo-500 transition">
                    AI Evaluation Settings
                  </p>
                  <p className="text-[10px] text-slate-500">Customize agency match prompt</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 transition" />
            </Link>

            <Link
              href="/org-portal/billing"
              className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 transition hover:bg-slate-100 dark:hover:bg-slate-900 group"
            >
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 transition">
                    Billing &amp; Deposit
                  </p>
                  <p className="text-[10px] text-slate-500">Invoices &amp; deposit limit</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 transition" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
