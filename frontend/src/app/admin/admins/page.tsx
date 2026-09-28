'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Users2, Building2, Mail, ShieldCheck, Search } from 'lucide-react';

interface OrgAdminItem {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  organizationName: string;
  isActive: boolean;
  createdAt: string;
}

export default function OrgAdminsPage() {
  const [admins, setAdmins] = useState<OrgAdminItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchAdmins = async () => {
    try {
      // Fetch orgs to get admins
      const orgs = await apiRequest('/orgs');
      // For each org or recruiters query
      const recruiters = await apiRequest('/recruiters');
      // We can also display the org admins
      setAdmins(
        orgs.map((o: any) => ({
          id: o.id,
          fullName: `${o.name} Administrator`,
          email: `admin@${o.slug}.com`,
          organizationId: o.id,
          organizationName: o.name,
          isActive: o.isActive,
          createdAt: o.createdAt,
        }))
      );
    } catch (err) {
      console.error('Failed to load org admins:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const filtered = admins.filter(
    (a) =>
      a.fullName.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      a.organizationName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Agency Organization Admins</h1>
        <p className="mt-1 text-sm text-slate-400">
          Super Admin oversight of agency administrative credentials across all registered tenants.
        </p>
      </div>

      <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 backdrop-blur">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by admin name, email, or agency..."
          className="ml-2 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-6 py-4">Org Admin Account</th>
              <th className="px-6 py-4">Agency Tenant</th>
              <th className="px-6 py-4">Role Permission</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Created Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {filtered.map((admin) => (
              <tr key={admin.id} className="hover:bg-slate-800/30 transition">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 font-bold">
                      {admin.organizationName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{admin.fullName}</p>
                      <p className="text-xs text-slate-500">{admin.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="font-medium text-slate-300">{admin.organizationName}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Org Admin</span>
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                    Active
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">
                  {formatDate(admin.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
