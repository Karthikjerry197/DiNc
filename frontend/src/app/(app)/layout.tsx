'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@/lib/api';
import { fetchMe, devSwitchUser } from '@/lib/api';
import {
  GUEST_USER,
  clearSession,
  getToken,
  isGuest,
  saveSession,
} from '@/lib/session';
import { UserContext } from '@/lib/UserContext';
import { can as checkPermission } from '@/lib/permissions';
import AppShell from '@/components/shell/AppShell';

/**
 * Authenticated layout for every application page.
 *
 * Resolves the session via /api/auth/me, then wraps all children in
 * <UserContext.Provider>. Every page that calls useUser() re-renders
 * automatically whenever the user switches — no page needs to read
 * localStorage or sessionStorage directly.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function resolveSession() {
      if (isGuest()) {
        if (active) { setUser(GUEST_USER); setChecking(false); }
        return;
      }
      const token = getToken();
      if (!token) { router.replace('/'); return; }
      try {
        const me = await fetchMe(token);
        if (active) { setUser(me); setChecking(false); }
      } catch {
        clearSession();
        router.replace('/');
      }
    }

    void resolveSession();
    return () => { active = false; };
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace('/');
  }

  async function handleSwitchUser(targetUsername: string) {
    const token = getToken();
    if (!token) return;
    try {
      const result = await devSwitchUser(token, targetUsername);
      const newUser: AuthUser = {
        username: result.username,
        full_name: result.full_name,
        role: result.role,
      };
      clearSession();
      saveSession(result.token, newUser, false);
      setUser(newUser);
    } catch (err) {
      console.warn('[DEV] Switch user failed:', err);
    }
  }

  // Stable context value — recreated only when the user object changes.
  // All consumers (pages, sidebar) re-render when this value changes.
  const contextValue = useMemo(
    () =>
      user
        ? { user, can: (perm: string) => checkPermission(user.role, perm) }
        : null,
    [user],
  );

  if (checking || !user || !contextValue) {
    return <div className="loading">Loading&hellip;</div>;
  }

  return (
    <UserContext.Provider value={contextValue}>
      <AppShell user={user} onLogout={handleLogout} onSwitchUser={handleSwitchUser}>
        {children}
      </AppShell>
    </UserContext.Provider>
  );
}
