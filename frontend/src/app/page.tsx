'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role === 'super_admin') {
        router.replace('/admin/telemetry');
      } else {
        router.replace('/org-portal/billing');
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        <p className="text-sm font-medium text-slate-400">Loading JDMatcher Enterprise...</p>
      </div>
    </div>
  );
}
