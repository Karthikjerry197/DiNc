'use client';

import { useEffect, useRef, useState } from 'react';
import { changePassword, saveDashboardLayout } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import { getProfile, saveProfile, getPreferences, savePreferences } from '@/lib/userPrefs';
import type { UserProfile, UserPreferences } from '@/lib/userPrefs';

const LANGUAGES    = ['English', 'Hindi', 'Assamese'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const TIME_FORMATS = ['12-hour', '24-hour'];

/**
 * Account Settings — personal settings for the currently logged-in user.
 * Accessible to all authenticated roles, not just administrators.
 *
 * Sections:
 *   Profile   — contact + designation fields (stored locally)
 *   Security  — change password (authenticated API call)
 *   Dashboard — reset layout to built-in defaults
 *   Preferences — language, date and time formats (stored locally)
 */
export default function AccountSettingsPage() {
  const { user } = useUser();
  const token = getToken() ?? '';

  const { username, full_name, role } = user;

  // ── Toast ─────────────────────────────────────────────────────────────────

  const [toast, setToast]     = useState('');
  const [toastKind, setToastKind] = useState<'ok' | 'err'>('ok');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(msg: string, kind: 'ok' | 'err' = 'ok') {
    setToast(msg);
    setToastKind(kind);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  // Re-sync profile and prefs when the authenticated user changes (e.g. Switch User).
  useEffect(() => {
    setProfile(getProfile(username));
    setPrefs(getPreferences(username));
  }, [username]);

  // ── Profile ───────────────────────────────────────────────────────────────

  const [profile, setProfile]     = useState<UserProfile>(() => getProfile(username));
  const [savingProfile, setSavingProfile] = useState(false);

  function handleProfileChange(field: keyof UserProfile, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    saveProfile(username, profile);
    setTimeout(() => {
      setSavingProfile(false);
      flash('Profile saved successfully.');
    }, 200);
  }

  // ── Security — change password ────────────────────────────────────────────

  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError]   = useState('');

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError('');
    if (pwd.next !== pwd.confirm) {
      setPwdError('New passwords do not match.');
      return;
    }
    if (pwd.next.length < 8) {
      setPwdError('New password must be at least 8 characters.');
      return;
    }
    setSavingPwd(true);
    try {
      await changePassword(token, pwd.current, pwd.next);
      setPwd({ current: '', next: '', confirm: '' });
      flash('Password changed successfully.');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setSavingPwd(false);
    }
  }

  // ── Dashboard reset ───────────────────────────────────────────────────────

  const [resetting, setResetting] = useState(false);

  async function handleResetDashboard() {
    if (!window.confirm('Reset your dashboard layout to the built-in defaults for your role?')) return;
    setResetting(true);
    try {
      // Saving an empty array causes the dashboard to fall back to its registry defaults.
      await saveDashboardLayout(token, role, []);
      flash('Dashboard layout reset. It will take effect on your next visit to the Dashboard.');
    } catch {
      flash('Could not reset dashboard layout. Please try again.', 'err');
    } finally {
      setResetting(false);
    }
  }

  // ── Preferences ───────────────────────────────────────────────────────────

  const [prefs, setPrefs]       = useState<UserPreferences>(() => getPreferences(username));
  const [savingPrefs, setSavingPrefs] = useState(false);

  function handlePrefChange(field: keyof UserPreferences, value: string) {
    setPrefs((prev) => ({ ...prev, [field]: value }));
  }

  function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault();
    setSavingPrefs(true);
    savePreferences(username, prefs);
    setTimeout(() => {
      setSavingPrefs(false);
      flash('Preferences saved.');
    }, 200);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Account Settings</h1>
          <p className="page-subtitle">Personal settings for {full_name}</p>
        </div>
      </div>

      <div className="as-layout">

        {/* ── Profile ── */}
        <section className="as-section" aria-labelledby="as-profile-heading">
          <div className="as-section-head">
            <h2 className="as-section-title" id="as-profile-heading">Profile</h2>
            <p className="as-section-sub">Your identity and contact information</p>
          </div>
          <form className="as-section-body" onSubmit={handleSaveProfile}>
            <div className="as-field-row">
              <div className="as-field">
                <label className="as-label" htmlFor="as-fullname">Full Name</label>
                <input
                  id="as-fullname"
                  className="as-input as-input--readonly"
                  type="text"
                  value={full_name}
                  readOnly
                  aria-readonly="true"
                />
                <span className="as-field-help">Set by your system administrator.</span>
              </div>
              <div className="as-field">
                <label className="as-label" htmlFor="as-username">Username</label>
                <input
                  id="as-username"
                  className="as-input as-input--readonly"
                  type="text"
                  value={username}
                  readOnly
                  aria-readonly="true"
                />
              </div>
            </div>

            <div className="as-field-row">
              <div className="as-field">
                <label className="as-label" htmlFor="as-email">Email</label>
                <input
                  id="as-email"
                  className="as-input"
                  type="email"
                  placeholder="your@email.com"
                  value={profile.email}
                  onChange={(e) => handleProfileChange('email', e.target.value)}
                />
              </div>
              <div className="as-field">
                <label className="as-label" htmlFor="as-phone">Phone</label>
                <input
                  id="as-phone"
                  className="as-input"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={profile.phone}
                  onChange={(e) => handleProfileChange('phone', e.target.value)}
                />
              </div>
            </div>

            <div className="as-field-row">
              <div className="as-field">
                <label className="as-label" htmlFor="as-designation">Designation</label>
                <input
                  id="as-designation"
                  className="as-input"
                  type="text"
                  placeholder="e.g. Senior Health Worker"
                  value={profile.designation}
                  onChange={(e) => handleProfileChange('designation', e.target.value)}
                />
              </div>
              <div className="as-field">
                <label className="as-label" htmlFor="as-department">Department</label>
                <input
                  id="as-department"
                  className="as-input"
                  type="text"
                  placeholder="e.g. Community Health"
                  value={profile.department}
                  onChange={(e) => handleProfileChange('department', e.target.value)}
                />
              </div>
            </div>

            <div className="as-field">
              <label className="as-label" htmlFor="as-facility">Facility</label>
              <input
                id="as-facility"
                className="as-input"
                type="text"
                placeholder="e.g. PHC Dergaon"
                value={profile.facility}
                onChange={(e) => handleProfileChange('facility', e.target.value)}
              />
            </div>

            <div className="as-actions">
              <button
                type="submit"
                className="as-btn as-btn--primary"
                disabled={savingProfile}
              >
                {savingProfile ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>

        {/* ── Security ── */}
        <section className="as-section" aria-labelledby="as-security-heading">
          <div className="as-section-head">
            <h2 className="as-section-title" id="as-security-heading">Security</h2>
            <p className="as-section-sub">Manage your login credentials</p>
          </div>
          <form className="as-section-body" onSubmit={(e) => void handleChangePassword(e)}>
            <div className="as-field">
              <label className="as-label" htmlFor="as-cur-pwd">Current Password</label>
              <input
                id="as-cur-pwd"
                className="as-input"
                type="password"
                autoComplete="current-password"
                value={pwd.current}
                onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
                required
              />
            </div>
            <div className="as-field-row">
              <div className="as-field">
                <label className="as-label" htmlFor="as-new-pwd">New Password</label>
                <input
                  id="as-new-pwd"
                  className="as-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  value={pwd.next}
                  onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
                  required
                />
              </div>
              <div className="as-field">
                <label className="as-label" htmlFor="as-confirm-pwd">Confirm New Password</label>
                <input
                  id="as-confirm-pwd"
                  className="as-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat new password"
                  value={pwd.confirm}
                  onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                  required
                />
              </div>
            </div>
            {pwdError && (
              <div className="as-field-error" role="alert">{pwdError}</div>
            )}
            <div className="as-actions">
              <button
                type="submit"
                className="as-btn as-btn--primary"
                disabled={savingPwd || !pwd.current || !pwd.next || !pwd.confirm}
              >
                {savingPwd ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </form>
        </section>

        {/* ── Dashboard ── */}
        <section className="as-section" aria-labelledby="as-dash-heading">
          <div className="as-section-head">
            <h2 className="as-section-title" id="as-dash-heading">Dashboard</h2>
            <p className="as-section-sub">Restore your dashboard to the built-in layout for your role</p>
          </div>
          <div className="as-section-body">
            <p className="as-body-text">
              This will clear any saved layout customisations for your role and restore
              the default widget arrangement. Individual widget settings within each
              widget are not affected.
            </p>
            <div className="as-actions">
              <button
                type="button"
                className="as-btn as-btn--warning"
                disabled={resetting}
                onClick={() => void handleResetDashboard()}
              >
                {resetting ? 'Resetting…' : 'Reset Dashboard Layout'}
              </button>
            </div>
          </div>
        </section>

        {/* ── Preferences ── */}
        <section
          className="as-section"
          id="preferences"
          aria-labelledby="as-prefs-heading"
        >
          <div className="as-section-head">
            <h2 className="as-section-title" id="as-prefs-heading">Preferences</h2>
            <p className="as-section-sub">Display and regional settings</p>
          </div>
          <form className="as-section-body" onSubmit={handleSavePrefs}>
            <div className="as-field">
              <label className="as-label" htmlFor="as-lang">Language</label>
              <select
                id="as-lang"
                className="as-select"
                value={prefs.language}
                onChange={(e) => handlePrefChange('language', e.target.value)}
              >
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="as-field-row">
              <div className="as-field">
                <label className="as-label" htmlFor="as-datefmt">Date Format</label>
                <select
                  id="as-datefmt"
                  className="as-select"
                  value={prefs.dateFormat}
                  onChange={(e) => handlePrefChange('dateFormat', e.target.value)}
                >
                  {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="as-field">
                <label className="as-label" htmlFor="as-timefmt">Time Format</label>
                <select
                  id="as-timefmt"
                  className="as-select"
                  value={prefs.timeFormat}
                  onChange={(e) => handlePrefChange('timeFormat', e.target.value)}
                >
                  {TIME_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="as-actions">
              <button
                type="submit"
                className="as-btn as-btn--primary"
                disabled={savingPrefs}
              >
                {savingPrefs ? 'Saving…' : 'Save Preferences'}
              </button>
            </div>
          </form>
        </section>

      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`cz-toast${toastKind === 'err' ? ' cz-toast--err' : ''}`} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
