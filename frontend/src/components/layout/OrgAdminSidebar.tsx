'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { OrgAdminBrandLogo } from '@/components/brand';
import {
  CreditCard,
  Users,
  Briefcase,
  Sliders,
  UserCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Building2,
  Receipt,
} from 'lucide-react';

const orgNavItems = [
  { name: 'Billing HUD', href: '/org-portal/billing', icon: CreditCard },
  { name: 'Billing Ledger', href: '/org-portal/ledger', icon: Receipt },
  { name: 'Candidates (Bench)', href: '/org-portal/candidates', icon: Users },
  { name: 'Agency Matched JDs', href: '/org-portal/matched-jds', icon: Briefcase },
  { name: 'Recruiter Team', href: '/org-portal/team', icon: UserCheck },
  { name: 'Evaluation Settings', href: '/org-portal/settings', icon: Sliders },
];

export function OrgAdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, organization, logout } = useAuth();

  return (
    <aside
      className={`relative flex flex-col border-r border-slate-800 bg-slate-950 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Collapse Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-7 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 shadow-md hover:bg-slate-800"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Header */}
      <div className="flex h-16 items-center border-b border-slate-800 px-4">
        <div className="flex items-center gap-3">
          <OrgAdminBrandLogo size={36} className="shrink-0" />
          {!collapsed && (
            <div className="truncate">
              <h2 className="text-sm font-bold text-white tracking-tight truncate">
                {organization?.name || 'Agency Portal'}
              </h2>
              <p className="text-[10px] font-medium text-violet-400">
                Org Admin Workspace
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {orgNavItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
              title={collapsed ? item.name : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="truncate">
              <p className="text-xs font-semibold text-white truncate">{user?.fullName || 'Agency Admin'}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
            </div>
          )}
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
