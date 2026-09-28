'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { SuperAdminSidebar } from '@/components/layout/SuperAdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'super_admin')) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== 'super_admin') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
