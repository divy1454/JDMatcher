'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { SuperAdminBrandLogo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme';
import {
  Activity,
  Building2,
  FileCode2,
  Users2,
  Laptop,
  CheckCircle2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Receipt,
} from 'lucide-react';

const navItems = [
  { name: 'Telemetry Dashboard', href: '/admin/telemetry', icon: Activity },
  { name: 'Organizations', href: '/admin/organizations', icon: Building2 },
  { name: 'Invoices & Billing', href: '/admin/invoices', icon: Receipt },
  { name: 'Global Prompts', href: '/admin/prompts', icon: FileCode2 },
  { name: 'Org Admins', href: '/admin/admins', icon: Users2 },
  { name: 'Recruiters & Hardware', href: '/admin/recruiters', icon: Laptop },
];

export function SuperAdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside
      className={`relative flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Collapse Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-7 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 shadow-md hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Header */}
      <div className="flex h-16 items-center border-b border-slate-200 dark:border-slate-800 px-4">
        <div className="flex items-center gap-3">
          <SuperAdminBrandLogo size={36} className="shrink-0" />
          {!collapsed && (
            <div className="truncate">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Super Admin</h2>
              <p className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">JDMatcher</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200'
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
      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between gap-2'}`}>
          {!collapsed && (
            <div className="truncate min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user?.fullName || 'Super Admin'}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
            </div>
          )}
          <div className={`flex items-center gap-1 shrink-0 ${collapsed ? 'flex-col' : ''}`}>
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
