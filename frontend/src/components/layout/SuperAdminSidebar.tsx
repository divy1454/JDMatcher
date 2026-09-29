'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { SuperAdminBrandLogo } from '@/components/brand';
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
  EyeOff,
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
          <SuperAdminBrandLogo size={36} className="shrink-0" />
          {!collapsed && (
            <div className="truncate">
              <h2 className="text-sm font-bold text-white tracking-tight">Super Admin</h2>
              <p className="text-[10px] font-medium text-indigo-400">JDMatcher Platform</p>
            </div>
          )}
        </div>
      </div>

      {/* Zero Knowledge Privacy Badge */}
      {!collapsed && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-950/30 px-3 py-2 text-[11px] text-indigo-300">
          <EyeOff className="h-4 w-4 shrink-0 text-indigo-400" />
          <span>Zero-Knowledge Privacy: No Candidate or JD Access</span>
        </div>
      )}

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
              <p className="text-xs font-semibold text-white truncate">{user?.fullName || 'Super Admin'}</p>
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
