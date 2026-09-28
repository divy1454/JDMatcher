'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { RecruiterSidebar } from '@/components/layout/RecruiterSidebar';

export default function RecruiterPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role === 'super_admin') {
        router.replace('/admin/telemetry');
      } else if (user.role === 'org_admin') {
        router.replace('/org-portal/billing');
      }
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== 'recruiter') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <RecruiterSidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
