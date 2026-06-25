'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@/lib/api';
import { fetchMe } from '@/lib/api';
import {
  GUEST_USER,
  clearSession,
  getToken,
  isGuest,
} from '@/lib/session';
import AppShell from '@/components/shell/AppShell';

/**
 * Authenticated layout for every application page. It resolves the session the
 * same way the Milestone 1 home page did — guest sessions are allowed, a valid
 * JWT is confirmed via /api/auth/me, and any other state redirects to login —
 * then wraps the page in the shared AppShell. Logout behaves exactly as in
 * Milestone 1 (clear session, return to login).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function resolveSession() {
      if (isGuest()) {
        if (active) {
          setUser(GUEST_USER);
          setChecking(false);
        }
        return;
      }

      const token = getToken();
      if (!token) {
        router.replace('/');
        return;
      }

      try {
        const me = await fetchMe(token);
        if (active) {
          setUser(me);
          setChecking(false);
        }
      } catch {
        clearSession();
        router.replace('/');
      }
    }

    void resolveSession();
    return () => {
      active = false;
    };
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace('/');
  }

  if (checking || !user) {
    return <div className="loading">Loading&hellip;</div>;
  }

  return (
    <AppShell user={user} onLogout={handleLogout}>
      {children}
    </AppShell>
  );
}
