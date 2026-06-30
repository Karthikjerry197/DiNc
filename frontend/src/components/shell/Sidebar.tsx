'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** Functional pages render real content; others show a "coming soon" placeholder. */
  enabled: boolean;
}

/**
 * Primary navigation. Only Dashboard is functional in this milestone; the other
 * destinations route to placeholder pages. The list is data-driven so future
 * milestones can flip `enabled` without changing the shell.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '▦', enabled: true },
  { label: 'My Worklist', href: '/worklist', icon: '☑', enabled: false },
  { label: 'Citizens', href: '/citizens', icon: '👥', enabled: false },
  { label: 'Guidebooks', href: '/guidebooks', icon: '📘', enabled: false },
  { label: 'Knowledge Base', href: '/knowledge-base', icon: '📚', enabled: true },
  { label: 'Notifications', href: '/notifications', icon: '🔔', enabled: false },
  { label: 'Reports', href: '/reports', icon: '📊', enabled: true },
  { label: 'Administration', href: '/administration', icon: '⚙', enabled: true },
];

interface SidebarProps {
  onLogout: () => void;
}

export default function Sidebar({ onLogout }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="shell-sidebar">
      <div className="shell-brand">
        <div className="shell-brand-badge">🏥</div>
        <div className="shell-brand-text">
          <div className="shell-brand-title">DiNC</div>
          <div className="shell-brand-sub">Integrated Care</div>
        </div>
      </div>

      <nav className="shell-nav">
        {NAV_ITEMS.map((item) => {
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
