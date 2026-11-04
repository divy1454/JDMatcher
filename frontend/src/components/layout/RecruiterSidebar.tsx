'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { RecruiterBrandLogo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme';
import {
  Users,
  Briefcase,
  LogOut,
  Sparkles,
  User,
  Compass,
} from 'lucide-react';

const recruiterNavItems = [
  { name: 'Bench Candidates', href: '/recruiter-portal/candidates', icon: Users, badge: 'Talent' },
  { name: 'Resume Analyser', href: '/recruiter-portal/analyse', icon: Sparkles, badge: 'AI Intel' },
  { name: 'Job Hunter', href: '/recruiter-portal/job-hunter', icon: Compass, badge: 'Live' },
  { name: 'Matched Job Descriptions', href: '/recruiter-portal/matched-jds', icon: Briefcase, badge: 'Matches' },
  { name: 'My Profile & Machine', href: '/recruiter-portal/profile', icon: User, badge: 'Profile' },
];

export function RecruiterSidebar() {
  const pathname = usePathname();
  const { user, organization, logout } = useAuth();

  return (
    <aside className="relative flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      {/* Brand & Workspace Header */}
      <div className="flex h-16 items-center border-b border-slate-200 dark:border-slate-800 px-5">
        <div className="flex items-center gap-3">
          <RecruiterBrandLogo size={36} className="shrink-0" />
          <div className="truncate">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate">
              {organization?.name || 'Agency Bench'}
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Recruiter Portal
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 p-3">
        {recruiterNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.name}</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  isActive
                    ? 'bg-emerald-700/60 text-emerald-100'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.badge}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Recruiter Profile & Logout */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/recruiter-portal/profile"
            className="truncate min-w-0 flex-1 hover:opacity-80 transition group"
            title="Manage My Profile & Machine"
          >
            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
              {user?.fullName || 'Recruiter'}
            </p>
            <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle />
            <button
              onClick={logout}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition"
              title="Log Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
