'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RecruiterPortalIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/recruiter-portal/candidates');
  }, [router]);

  return null;
}
