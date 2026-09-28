'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { OrgAdminSidebar } from '@/components/layout/OrgAdminSidebar';

export default function OrgPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role !== 'org_admin') {
        // Redirect non-org-admin users to their correct portal
        if (user.role === 'super_admin') {
          router.replace('/admin/telemetry');
        } else {
          router.replace('/recruiter-portal/candidates');
        }
      }
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== 'org_admin') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <OrgAdminSidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
