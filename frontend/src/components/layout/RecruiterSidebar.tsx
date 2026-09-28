'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { RecruiterBrandLogo } from '@/components/brand';
import {
  Users,
  Briefcase,
  LogOut,
  Laptop,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

const recruiterNavItems = [
  { name: 'Bench Candidates', href: '/recruiter-portal/candidates', icon: Users, badge: 'Talent' },
  { name: 'Matched Job Descriptions', href: '/recruiter-portal/matched-jds', icon: Briefcase, badge: 'Matches' },
];

export function RecruiterSidebar() {
  const pathname = usePathname();
  const { user, organization, logout } = useAuth();

  return (
    <aside className="relative flex w-64 flex-col border-r border-slate-800 bg-slate-950">
      {/* Brand & Workspace Header */}
      <div className="flex h-16 items-center border-b border-slate-800 px-5">
        <div className="flex items-center gap-3">
          <RecruiterBrandLogo size={36} className="shrink-0" />
          <div className="truncate">
            <h2 className="text-sm font-bold text-white tracking-tight truncate">
              {organization?.name || 'Agency Bench'}
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                Recruiter Portal
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware Seat Notice */}
      <div className="p-3">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <Laptop className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Bound Machine</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-mono truncate">
            {user?.deviceId || 'Active Browser Session'}
          </p>
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
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
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
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {item.badge}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Extension Link Card */}
      <div className="p-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-xs text-slate-300">
          <div className="flex items-center gap-2 font-semibold text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Chrome Extension</span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
            Use the pinned extension on any job board to evaluate matches in real time.
          </p>
        </div>
      </div>

      {/* Recruiter Profile & Logout */}
      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center justify-between">
          <div className="truncate">
            <p className="text-xs font-semibold text-white truncate">{user?.fullName || 'Recruiter'}</p>
            <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition"
            title="Log Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
