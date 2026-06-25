'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The Milestone 1 temporary landing has been superseded by the application
 * shell. Login still routes here; we forward into the shell's dashboard.
 * Session validation and the guest/no-session handling live in the (app) layout.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return <div className="loading">Loading&hellip;</div>;
}
