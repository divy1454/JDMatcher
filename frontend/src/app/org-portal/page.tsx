'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OrgPortalIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/org-portal/billing');
  }, [router]);
  return null;
}
