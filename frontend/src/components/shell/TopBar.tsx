'use client';

import Link from 'next/link';
import type { AuthUser } from '@/lib/api';

interface TopBarProps {
  user: AuthUser;
  onLogout: () => void;
}

/** Friendly label for the role codes stored on the user record. */
function roleLabel(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'Administrator';
    case 'CLINICIAN':
      return 'Clinical Staff';
    case 'CARE_ASSISTANT':
      return 'Care Assistant';
    case 'Guest':
      return 'Guest';
    default:
      return role;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Permanent top navigation: brand, a UI-only global search, a UI-only
 * notification bell, and the logged-in user with role + logout. Search and
 * notifications are intentionally non-functional this milestone.
 */
export default function TopBar({ user, onLogout }: TopBarProps) {
  return (
    <header className="shell-topbar">
      <Link href="/dashboard" className="shell-topbar-title" aria-label="Go to Dashboard">
        Digital Integrated Care Network <span className="shell-topbar-tag">(DiNC)</span>
      </Link>

      <div className="shell-search">
        <span className="shell-search-icon" aria-hidden="true">🔍</span>
        <input
          type="text"
          className="shell-search-input"
          placeholder="Search citizens, programs, knowledge…"
          aria-label="Global search (coming soon)"
          disabled
        />
      </div>

      <div className="shell-topbar-right">
        <button
          type="button"
          className="shell-icon-btn"
          aria-label="Notifications (coming soon)"
          disabled
        >
          🔔
        </button>

        <div className="shell-user">
          <div className="shell-user-avatar" aria-hidden="true">{initials(user.full_name)}</div>
          <div className="shell-user-meta">
            <div className="shell-user-name">{user.full_name}</div>
            <div className="shell-user-role">{roleLabel(user.role)}</div>
          </div>
        </div>

        <button type="button" className="shell-topbar-logout" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
