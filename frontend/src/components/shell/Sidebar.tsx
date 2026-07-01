'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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

/** localStorage key + default rule for the collapsed/expanded preference. */
const STORAGE_KEY = 'dinc.sidebar';
const COLLAPSE_BELOW = 1280; // auto-collapse default under this viewport width

/**
 * Primary navigation sidebar (Milestone 27 — collapsible).
 *
 * States:
 *   - expanded            icon + label (default ≥1280px)
 *   - collapsed           icons only (default <1280px); a persisted preference overrides the width default
 *   - hover / focus       a collapsed sidebar temporarily expands as an OVERLAY
 *                         (absolutely positioned inner panel) so the workspace never reflows
 *
 * The collapsed/expanded preference is persisted to localStorage; the `[` key toggles it.
 * Routing, permission filtering, and active-item logic are unchanged.
 */
export default function Sidebar({ user, onLogout }: SidebarProps) {
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [ready, setReady] = useState(false); // gate CSS transitions until the initial state is applied

  // Resolve the initial preference on mount: stored choice → viewport-width default.
  // Kept in an effect so SSR and first client render match (both collapsed=false),
  // avoiding hydration mismatch; the initial resolution is applied without animation.
  useEffect(() => {
    let initial = false;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'collapsed') initial = true;
      else if (stored === 'expanded') initial = false;
      else initial = window.innerWidth < COLLAPSE_BELOW;
    } catch {
      initial = false;
    }
    setCollapsed(initial);
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        /* ignore storage failures (private mode, etc.) */
      }
      return next;
    });
  }, []);

  // `[` toggles the sidebar — ignored while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      e.preventDefault();
      toggle();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || can(user.role, item.permission),
  );

  // A collapsed sidebar shows labels only while hovered or keyboard-focused (overlay).
  const expanded = !collapsed || hovering || focused;

  return (
    <aside
      className="shell-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
      data-ready={ready ? 'true' : 'false'}
      onMouseEnter={() => { if (collapsed) setHovering(true); }}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => { if (collapsed) setFocused(true); }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="shell-sidebar-inner">
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
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                title={item.label}
              >
                <span className="shell-nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="shell-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shell-sidebar-footer">
          <button
            type="button"
            className="shell-nav-item shell-sidebar-toggle"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            title={collapsed ? 'Expand sidebar ( [ )' : 'Collapse sidebar ( [ )'}
          >
            <span className="shell-nav-icon" aria-hidden="true">{collapsed ? '»' : '«'}</span>
            <span className="shell-nav-label">Collapse</span>
          </button>

          <button
            type="button"
            className="shell-nav-item shell-logout"
            onClick={onLogout}
            aria-label="Logout"
            title="Logout"
          >
            <span className="shell-nav-icon" aria-hidden="true">⎋</span>
            <span className="shell-nav-label">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
