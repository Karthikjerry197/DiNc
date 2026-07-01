'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AuthUser } from '@/lib/api';
import { can } from '@/lib/permissions';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** Functional pages render real content; false = "coming soon" placeholder. */
  enabled: boolean;
  /**
   * Permission required to see this item.
   * Omit to show the item to every authenticated user (including guests).
   */
  permission?: string;
}

/**
 * Primary navigation items.
 * Items without a permission are visible to all authenticated users.
 * Items with a permission are shown only to roles that hold it.
 * The enabled flag controls whether the destination page is functional (not sidebar visibility).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      href: '/dashboard',      icon: '▦',  enabled: true },
  { label: 'My Worklist',    href: '/worklist',       icon: '☑',  enabled: true,  permission: 'worklist.view' },
  { label: 'Citizens',       href: '/citizens',       icon: '👥', enabled: true,  permission: 'citizens.view' },
  { label: 'Guidebooks',     href: '/guidebooks',     icon: '📘', enabled: false },
  { label: 'Knowledge Base', href: '/knowledge-base', icon: '📚', enabled: true },
  { label: 'Notifications',  href: '/notifications',  icon: '🔔', enabled: true },
  { label: 'Reports',        href: '/reports',        icon: '📊', enabled: true,  permission: 'reports.view' },
  { label: 'Administration', href: '/administration', icon: '⚙',  enabled: true,  permission: 'admin.pages' },
];

interface SidebarProps {
  user: AuthUser;
  onLogout: () => void;
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || can(user.role, item.permission),
  );

  return (
    <aside className="shell-sidebar">
      <Link href="/dashboard" className="shell-brand" aria-label="Go to Dashboard">
        <div className="shell-brand-badge">🏥</div>
        <div className="shell-brand-text">
          <div className="shell-brand-title">DiNC</div>
          <div className="shell-brand-sub">Digital Integrated Care Network (DiNC)</div>
        </div>
      </Link>

      <nav className="shell-nav">
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shell-nav-item${active ? ' active' : ''}`}
            >
              <span className="shell-nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="shell-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button type="button" className="shell-nav-item shell-logout" onClick={onLogout}>
        <span className="shell-nav-icon" aria-hidden="true">⎋</span>
        <span className="shell-nav-label">Logout</span>
      </button>
    </aside>
  );
}
