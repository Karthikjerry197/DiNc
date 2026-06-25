'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@/lib/api';
import { fetchMe } from '@/lib/api';
import {
  clearSession,
  getStoredUser,
  getToken,
  isGuest,
} from '@/lib/session';

const GUEST_USER: AuthUser = {
  username: 'guest',
  full_name: 'Guest',
  role: 'Guest',
};

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function resolveSession() {
      if (isGuest()) {
        if (active) {
          setUser(GUEST_USER);
          setGuestMode(true);
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

  const storedName = getStoredUser()?.full_name ?? user.full_name;

  return (
    <div className="screen">
      <div className="home-card">
        <div className="home-emoji">{guestMode ? '👤' : '✅'}</div>
        <div className="home-welcome">Welcome, {storedName}</div>
        <div className="home-sub">
          {guestMode
            ? 'You are browsing DiNC in guest mode.'
            : 'You are signed in to DiNC.'}
        </div>

        {guestMode && (
          <div className="guest-badge">Guest Session</div>
        )}

        <div className="detail-row">
          <span className="detail-label">Full Name</span>
          <span className="detail-value">{user.full_name}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Username</span>
          <span className="detail-value">{user.username}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Role</span>
          <span className="detail-value">{user.role}</span>
        </div>

        <div className="home-actions">
          <button type="button" className="btn btn-primary" onClick={handleLogout}>
            {guestMode ? 'Back to Login' : 'Logout'}
          </button>
        </div>
      </div>
    </div>
  );
}
