'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell, Settings, Palette, LogOut, TriangleAlert, CircleAlert, RefreshCw, Check } from 'lucide-react';
import type { AlertWithCitizen, AuthUser, DevUser } from '@/lib/api';
import { fetchActiveAlerts, fetchDevUsers, markAlertRead } from '@/lib/api';
import { getToken } from '@/lib/session';
import { roleLabel } from '@/lib/format';

interface TopBarProps {
  user: AuthUser;
  onLogout: () => void;
  /** Dev-only callback: switch the authenticated session to a different user. */
  onSwitchUser: (username: string) => void;
}

/**
 * Development-only affordances (Switch User) render only in dev builds.
 * NODE_ENV is inlined at build time, so the entire block is compiled out of
 * production bundles — the backend dev endpoints are never reachable from
 * production UI.
 */
const IS_DEV = process.env.NODE_ENV !== 'production';

/** Two-letter initials from a full name. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Permanent top navigation bar.
 *
 * The Account Menu dropdown provides:
 *   • User identity header
 *   • Switch User (dev feature — issues a real JWT for the selected DB user)
 *   • Account Settings link
 *   • Preferences link
 *   • Help & Documentation (placeholder)
 *   • About DiNC (placeholder)
 *   • Logout
 */
export default function TopBar({ user, onLogout, onSwitchUser }: TopBarProps) {
  const [open, setOpen]             = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);
  const [devUsers, setDevUsers]     = useState<DevUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Notification bell state
  const [alertCount, setAlertCount]     = useState(0);
  const [bellOpen, setBellOpen]         = useState(false);
  const [bellAlerts, setBellAlerts]     = useState<AlertWithCitizen[]>([]);
  const [bellLoading, setBellLoading]   = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Poll the unread alert count every 60 s (read alerts stay in the feed but
  // no longer contribute to the badge).
  useEffect(() => {
    function loadCount() {
      const token = getToken();
      if (!token) return;
      fetchActiveAlerts(token)
        .then((alerts) => setAlertCount(alerts.filter((a) => !a.isRead).length))
        .catch(() => undefined);
    }
    loadCount();
    const t = setInterval(loadCount, 60_000);
    return () => clearInterval(t);
  }, []);

  // Close bell on click-outside or Escape
  useEffect(() => {
    if (!bellOpen) return;
    function onOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setBellOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [bellOpen]);

  async function handleBellClick() {
    const next = !bellOpen;
    setBellOpen(next);
    if (next && !bellLoading) {
      // Refresh on every open so the list matches the polled badge count;
      // the loading state only shows before the first successful load.
      if (bellAlerts.length === 0) setBellLoading(true);
      try {
        const token = getToken();
        if (token) {
          const alerts = await fetchActiveAlerts(token);
          setBellAlerts(alerts);
          setAlertCount(alerts.filter((a) => !a.isRead).length);
        }
      } catch { /* silent */ }
      finally { setBellLoading(false); }
    }
  }

  // Opening an alert marks it read: optimistic local update (muted row, badge
  // decrement) plus a fire-and-forget persist — navigation must not wait.
  function handleAlertOpen(alert: AlertWithCitizen) {
    setBellOpen(false);
    if (alert.isRead) return;
    setBellAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, isRead: true } : a)),
    );
    setAlertCount((n) => Math.max(0, n - 1));
    const token = getToken();
    if (token) markAlertRead(token, alert.id).catch(() => undefined);
  }

  // Close on click-outside and Escape key
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSwitch(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setShowSwitch(false); setBellOpen(false); }
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  function close() { setOpen(false); setShowSwitch(false); }

  async function handleShowSwitch() {
    const next = !showSwitch;
    setShowSwitch(next);
    // Load the user list from the backend the first time the submenu opens.
    if (next && devUsers.length === 0 && !loadingUsers) {
      setLoadingUsers(true);
      try {
        const token = getToken();
        if (token) {
          const users = await fetchDevUsers(token);
          setDevUsers(users);
        }
      } catch {
        // Silently fail — the submenu will remain empty.
      } finally {
        setLoadingUsers(false);
      }
    }
  }

  function handleSwitchUser(username: string) {
    onSwitchUser(username);
    close();
  }

  return (
    <header className="shell-topbar">
      <Link href="/dashboard" className="shell-topbar-title" aria-label="Go to Dashboard">
        Digital Integrated Care Network <span className="shell-topbar-tag">(DiNC)</span>
      </Link>

      <div className="shell-topbar-right">
        {/* ── Notification Bell ── */}
        <div className="bell-wrap" ref={bellRef}>
          <button
            type="button"
            className={`shell-icon-btn bell-btn${alertCount > 0 ? ' bell-btn--active' : ''}`}
            aria-label={`Notifications — ${alertCount} active alert${alertCount !== 1 ? 's' : ''}`}
            onClick={() => { void handleBellClick(); }}
          >
            <Bell size={18} aria-hidden="true" />
            {alertCount > 0 && (
              <span className="bell-badge" aria-hidden="true">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="bell-dropdown" role="dialog" aria-label="Active alerts">
              <div className="bell-header">
                <span className="bell-title">Clinical Alerts</span>
                <Link href="/notifications" className="bell-view-all" onClick={() => setBellOpen(false)}>
                  View all
                </Link>
              </div>
              {bellLoading && (
                <div className="bell-loading">Loading alerts…</div>
              )}
              {!bellLoading && bellAlerts.length === 0 && (
                <div className="bell-empty">No active clinical alerts.</div>
              )}
              {/* Each alert is a direct shortcut to the patient (same /citizens?c=
                * route as Priority Alerts and the Action Centre cards). */}
              {!bellLoading && bellAlerts.map((a) => (
                <Link
                  key={a.id}
                  href={`/citizens?c=${a.citizenId}`}
                  className={`bell-alert bell-alert--${a.riskLevel.toLowerCase()}${a.isRead ? ' bell-alert--read' : ''}`}
                  title="Open the citizen workspace"
                  onClick={() => handleAlertOpen(a)}
                >
                  <span className="bell-alert-icon" aria-hidden="true">
                    {a.riskLevel === 'SEVERE'
                      ? <TriangleAlert size={16} />
                      : <CircleAlert size={16} />}
                  </span>
                  <div className="bell-alert-info">
                    <div className="bell-alert-name">{a.citizenName ?? 'Patient'}</div>
                    <div className="bell-alert-meta">
                      {a.disease ?? 'General'} · {a.riskLevel}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Account Menu ── */}
        <div className="acm-wrap" ref={menuRef}>
          <button
            type="button"
            className={`acm-trigger${open ? ' acm-trigger--open' : ''}`}
            onClick={() => setOpen((v) => !v)}
            aria-label="Open account menu"
            aria-haspopup="true"
            aria-expanded={open}
          >
            <div className="shell-user-avatar" aria-hidden="true">
              {initials(user.full_name)}
            </div>
            <div className="shell-user-meta">
              <div className="shell-user-name">{user.full_name}</div>
              <div className="shell-user-role">{roleLabel(user.role)}</div>
            </div>
            <span className="acm-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
          </button>

          {open && (
            <div className="acm-dropdown" role="menu" aria-label="Account menu">

              {/* ── Identity header ── */}
              <div className="acm-header" role="none">
                <div className="acm-hd-avatar" aria-hidden="true">
                  {initials(user.full_name)}
                </div>
                <div className="acm-hd-info">
                  <div className="acm-hd-name">{user.full_name}</div>
                  <div className="acm-hd-role">{roleLabel(user.role)}</div>
                </div>
              </div>

              <div className="acm-divider" role="separator" />

              {/* ── Switch User (dev builds only) ── */}
              {IS_DEV && (
                <button
                  type="button"
                  className="acm-item acm-item--expand"
                  role="menuitem"
                  aria-haspopup="true"
                  aria-expanded={showSwitch}
                  onClick={() => { void handleShowSwitch(); }}
                >
                  <span className="acm-item-icon" aria-hidden="true"><RefreshCw size={16} /></span>
                  <span className="acm-item-label">Switch User</span>
                  <span className="acm-dev-badge">DEV</span>
                  <span className="acm-arrow" aria-hidden="true">{showSwitch ? '▴' : '▾'}</span>
                </button>
              )}

              {IS_DEV && showSwitch && (
                <div className="acm-sub" role="group" aria-label="Switch to user">
                  {loadingUsers && (
                    <div className="acm-sub-item acm-sub-loading" role="none">
                      Loading users…
                    </div>
                  )}
                  {!loadingUsers && devUsers.length === 0 && (
                    <div className="acm-sub-item acm-sub-loading" role="none">
                      No users found.
                    </div>
                  )}
                  {devUsers.map((u) => (
                    <button
                      key={u.username}
                      type="button"
                      className={`acm-sub-item${user.username === u.username ? ' acm-sub-item--active' : ''}`}
                      role="menuitemradio"
                      aria-checked={user.username === u.username}
                      onClick={() => handleSwitchUser(u.username)}
                    >
                      <span className="acm-sub-check" aria-hidden="true">
                        {user.username === u.username ? <Check size={14} /> : null}
                      </span>
                      <span className="acm-sub-name">{u.full_name}</span>
                      <span className="acm-sub-role">{roleLabel(u.role)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Main items ── */}
              <Link
                href="/administration/account-settings"
                className="acm-item"
                role="menuitem"
                onClick={close}
              >
                <span className="acm-item-icon" aria-hidden="true"><Settings size={16} /></span>
                <span className="acm-item-label">Account Settings</span>
              </Link>

              <Link
                href="/administration/account-settings#preferences"
                className="acm-item"
                role="menuitem"
                onClick={close}
              >
                <span className="acm-item-icon" aria-hidden="true"><Palette size={16} /></span>
                <span className="acm-item-label">Preferences</span>
              </Link>

              <div className="acm-divider" role="separator" />

              {/* ── Logout ── */}
              <button
                type="button"
                className="acm-item acm-item--danger"
                role="menuitem"
                onClick={() => { close(); onLogout(); }}
              >
                <span className="acm-item-icon" aria-hidden="true"><LogOut size={16} /></span>
                <span className="acm-item-label">Logout</span>
              </button>

            </div>
          )}
        </div>
      </div>
    </header>
  );
}
