'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AlertWithCitizen, AuthUser, DevUser } from '@/lib/api';
import { fetchActiveAlerts, fetchDevUsers } from '@/lib/api';
import { getToken } from '@/lib/session';

interface TopBarProps {
  user: AuthUser;
  onLogout: () => void;
  /** Dev-only callback: switch the authenticated session to a different user. */
  onSwitchUser: (username: string) => void;
}

/** Friendly display label for internal role codes. */
function roleLabel(role: string): string {
  switch (role) {
    case 'ADMIN':          return 'Administrator';
    case 'CLINICIAN':      return 'Clinical Staff';
    case 'CARE_ASSISTANT': return 'Care Assistant';
    case 'ANM':            return 'ANM';
    case 'Guest':          return 'Guest';
    default:               return role;
  }
}

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

  // Poll active alert count every 60 s
  useEffect(() => {
    function loadCount() {
      const token = getToken();
      if (!token) return;
      fetchActiveAlerts(token)
        .then((alerts) => setAlertCount(alerts.length))
        .catch(() => undefined);
    }
    loadCount();
    const t = setInterval(loadCount, 60_000);
    return () => clearInterval(t);
  }, []);

  // Close bell on click-outside
  useEffect(() => {
    if (!bellOpen) return;
    function onOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [bellOpen]);

  async function handleBellClick() {
    const next = !bellOpen;
    setBellOpen(next);
    if (next && bellAlerts.length === 0 && !bellLoading) {
      setBellLoading(true);
      try {
        const token = getToken();
        if (token) setBellAlerts(await fetchActiveAlerts(token));
      } catch { /* silent */ }
      finally { setBellLoading(false); }
    }
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
            🔔
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
              {!bellLoading && bellAlerts.map((a) => (
                <div
                  key={a.id}
                  className={`bell-alert bell-alert--${a.riskLevel.toLowerCase()}`}
                >
                  <span className="bell-alert-icon" aria-hidden="true">
                    {a.riskLevel === 'SEVERE' ? '⚠' : '◈'}
                  </span>
                  <div className="bell-alert-info">
                    <div className="bell-alert-name">{a.citizenName ?? 'Patient'}</div>
                    <div className="bell-alert-meta">
                      {a.disease ?? 'General'} · {a.riskLevel}
                    </div>
                  </div>
                </div>
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

              {/* ── Switch User (dev) ── */}
              <button
                type="button"
                className="acm-item acm-item--expand"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={showSwitch}
                onClick={() => { void handleShowSwitch(); }}
              >
                <span className="acm-item-icon" aria-hidden="true">🔄</span>
                <span className="acm-item-label">Switch User</span>
                <span className="acm-dev-badge">DEV</span>
                <span className="acm-arrow" aria-hidden="true">{showSwitch ? '▴' : '▾'}</span>
              </button>

              {showSwitch && (
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
                        {user.username === u.username ? '✓' : ''}
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
                <span className="acm-item-icon" aria-hidden="true">⚙️</span>
                <span className="acm-item-label">Account Settings</span>
              </Link>

              <Link
                href="/administration/account-settings#preferences"
                className="acm-item"
                role="menuitem"
                onClick={close}
              >
                <span className="acm-item-icon" aria-hidden="true">🎨</span>
                <span className="acm-item-label">Preferences</span>
              </Link>

              <button
                type="button"
                className="acm-item acm-item--disabled"
                role="menuitem"
                disabled
                aria-disabled="true"
              >
                <span className="acm-item-icon" aria-hidden="true">❓</span>
                <span className="acm-item-label">Help &amp; Documentation</span>
                <span className="acm-coming">Soon</span>
              </button>

              <button
                type="button"
                className="acm-item acm-item--disabled"
                role="menuitem"
                disabled
                aria-disabled="true"
              >
                <span className="acm-item-icon" aria-hidden="true">ℹ️</span>
                <span className="acm-item-label">About DiNC</span>
                <span className="acm-coming">Soon</span>
              </button>

              <div className="acm-divider" role="separator" />

              {/* ── Logout ── */}
              <button
                type="button"
                className="acm-item acm-item--danger"
                role="menuitem"
                onClick={() => { close(); onLogout(); }}
              >
                <span className="acm-item-icon" aria-hidden="true">↩</span>
                <span className="acm-item-label">Logout</span>
              </button>

            </div>
          )}
        </div>
      </div>
    </header>
  );
}
