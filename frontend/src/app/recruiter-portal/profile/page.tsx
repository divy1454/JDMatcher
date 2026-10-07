'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/authContext';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  User,
  Mail,
  Key,
  Laptop,
  ShieldCheck,
  Building2,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  Save,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';

export default function RecruiterProfilePage() {
  const { user, organization, updateUserData, refreshUser } = useAuth();

  // Personal Info Form State
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // Password Change Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  // Machine Unlock Request Modal
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [isSubmittingUnlock, setIsSubmittingUnlock] = useState(false);
  const [unlockModalMsg, setUnlockModalMsg] = useState('');
  const [unlockModalError, setUnlockModalError] = useState('');

  // Hardware ID copy feedback
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setEmail(user.email || '');
    }
  }, [user]);

  // Handle Profile (Name & Email) Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(false);
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
      setProfileSuccessMsg('Profile updated successfully!');
      setTimeout(() => setProfileSuccessMsg(''), 4000);
    } catch (err: any) {
      setProfileErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Handle Password Update
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccessMsg('');
    setPasswordErrorMsg('');

    if (!currentPassword) {
      setPasswordErrorMsg('Please enter your current password.');
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
      setPasswordSuccessMsg('Password changed successfully!');
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

  // Handle Request Machine Unlock
  const handleRequestUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingUnlock(true);
    setUnlockModalMsg('');
    setUnlockModalError('');

    try {
      const res = await apiRequest('/recruiters/request-unlock', {
        method: 'POST',
        body: JSON.stringify({
          email: user?.email,
          reason: unlockReason.trim(),
        }),
      });

      setUnlockModalMsg(res.message || 'Unlock request submitted successfully.');
      setTimeout(() => {
        setIsUnlockModalOpen(false);
        setUnlockReason('');
        setUnlockModalMsg('');
        refreshUser();
      }, 3500);
    } catch (err: any) {
      setUnlockModalError(err.message || 'Failed to submit unlock request.');
    } finally {
      setIsSubmittingUnlock(false);
    }
  };

  const handleCopyDeviceId = () => {
    if (!user?.deviceId) return;
    navigator.clipboard.writeText(user.deviceId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const now = new Date();
  const canSwitch = !user?.deviceSwitchAllowedAfter || now >= new Date(user.deviceSwitchAllowedAfter);
  const switchCount = canSwitch ? 0 : (user?.deviceMonthlySwitchCount || 0);

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            My Profile & Machine Security
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your personal recruiter seat, update credentials, and review physical machine authorization.
          </p>
        </div>

        {/* Agency Seat Tag */}
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-xs shadow-sm">
          <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{organization?.name || 'Agency Bench'}</p>
            <p className="text-[10px] text-slate-500">Recruiter Seat</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* CARD 1: Personal Details */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Personal Information</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Update your account identity and email address</p>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="mt-5 space-y-4">
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
              <div className="relative mt-1.5">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="e.g. Jane Doe"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
              <div className="relative mt-1.5">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="recruiter@agency.com"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isUpdatingProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{isUpdatingProfile ? 'Saving Changes...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* CARD 2: Security & Password */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Security & Password</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Change your login password and protect your seat</p>
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
                className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/50"
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
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/50"
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
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 transition disabled:opacity-50"
              >
                <Key className="h-4 w-4" />
                <span>{isUpdatingPassword ? 'Updating Password...' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* CARD 3: Physical Machine Identity & Authorization */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <Laptop className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Physical Machine Identity</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cryptographic hardware lock (<code className="font-mono text-xs">x-device-id</code>) and monthly machine transfer quota
              </p>
            </div>
          </div>

          <div>
            {user?.deviceId ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Hardware Locked &amp; Authorized</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>Unbound (Will bind on next login)</span>
              </span>
            )}
          </div>
        </div>

        {/* Machine Stats Grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Bound Hardware Fingerprint</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
                {user?.deviceId ? `${user.deviceId.slice(0, 18)}...` : 'None'}
              </span>
              {user?.deviceId && (
                <button
                  type="button"
                  onClick={handleCopyDeviceId}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition"
                  title="Copy full hardware fingerprint"
                >
                  {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Monthly Transfer Quota</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                  switchCount >= 1
                    ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50'
                    : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50'
                }`}
              >
                {switchCount >= 1 ? '1 / 1 Used (Cooldown Active)' : '0 / 1 Used (1 Transfer Available)'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Next Eligible Machine Transfer</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
              {user?.deviceSwitchAllowedAfter ? (
                canSwitch ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Eligible (Cooldown Expired)</span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Locked until {formatDate(user.deviceSwitchAllowedAfter)}</span>
                  </span>
                )
              ) : (
                <span className="text-slate-600 dark:text-slate-300">Eligible (Never transferred)</span>
              )}
            </div>
          </div>
        </div>

        {/* Security Policy Information */}
        <div className="mt-6 rounded-xl border border-blue-500/20 bg-blue-50/60 dark:bg-blue-950/20 p-4 text-xs text-blue-900 dark:text-blue-200 space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Anti-Account Sharing &amp; Hardware Lock Policy</span>
          </div>
          <p className="leading-relaxed text-blue-800 dark:text-blue-300">
            • <strong>Multiple Chrome Profiles:</strong> You can open multiple Chrome profiles or browser windows on this physical computer without any restrictions.
          </p>
          <p className="leading-relaxed text-blue-800 dark:text-blue-300">
            • <strong>Different Devices Blocked:</strong> Logging in from a different physical computer or laptop is prohibited to protect enterprise client JD data.
          </p>
          <p className="leading-relaxed text-blue-800 dark:text-blue-300">
            • <strong>Machine Transfers:</strong> You can transfer machines <strong>once per month</strong> with approval from your Organization Admin. Additional transfers within 30 days must be authorized by Super Admin.
          </p>
        </div>

        {/* Request Machine Transfer Action */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 dark:border-slate-800 pt-5">
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">Changing physical computers?</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Submit a machine transfer request if you received a new laptop or your current workstation was replaced.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsUnlockModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition shadow-sm"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Request Machine Transfer</span>
          </button>
        </div>
      </div>

      {/* Unlock Request Modal */}
      {isUnlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Laptop className="h-5 w-5 text-indigo-500" />
                <span>Request Physical Machine Transfer</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsUnlockModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {switchCount >= 1
                ? 'You have already used your 1 monthly machine transfer. This request will be escalated to Super Admin for verification.'
                : 'This will submit a machine transfer request to your Organization Admin for authorization.'}
            </p>

            <form onSubmit={handleRequestUnlock} className="mt-4 space-y-4">
              {unlockModalMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                  ✓ {unlockModalMsg}
                </div>
              )}
              {unlockModalError && (
                <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/20 p-3 text-xs text-red-700 dark:text-red-300">
                  ✕ {unlockModalError}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reason for Machine Change
                </label>
                <textarea
                  required
                  rows={3}
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="e.g. Received new office laptop, or primary device undergoing repair."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUnlockModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUnlock}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isSubmittingUnlock ? 'Submitting...' : 'Submit Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
