'use client';

import type { ReactNode } from 'react';
import type { AuthUser } from '@/lib/api';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface AppShellProps {
  user: AuthUser;
  onLogout: () => void;
  /** Dev-only: switch the authenticated session to a different user by username. */
  onSwitchUser: (username: string) => void;
  children: ReactNode;
}

/**
 * Reusable application chrome shared by every authenticated page: a permanent
 * left sidebar, a permanent top navigation bar, and a dynamic content area.
 * Pages render only their own content into `children` — they never recreate
 * this layout.
 */
export default function AppShell({ user, onLogout, onSwitchUser, children }: AppShellProps) {
  return (
    <div className="shell">
      <Sidebar user={user} onLogout={onLogout} />
      <div className="shell-main">
        <TopBar user={user} onLogout={onLogout} onSwitchUser={onSwitchUser} />
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
