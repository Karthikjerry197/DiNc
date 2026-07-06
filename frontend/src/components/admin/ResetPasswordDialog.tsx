'use client';

import { useState } from 'react';
import { resetUserPassword, type AdminUser } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useDialogA11y } from '@/lib/useDialogA11y';

interface ResetPasswordDialogProps {
  user: AdminUser;
  open: boolean;
  onClose: () => void;
  onReset: (user: AdminUser) => void;
}

/**
 * Reset Password dialog for Administration → Users & Roles. Administrators set
 * a new password on behalf of the account (no old password needed — this is an
 * administrative reset, not a self-service change). Client validation mirrors
 * the backend ResetPasswordDto: minimum 8 characters. Server errors surface in
 * the error box exactly as returned.
 */
export default function ResetPasswordDialog({
  user,
  open,
  onClose,
  onReset,
}: ResetPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, () => !saving && onClose());

  if (!open) return null;

  async function handleReset() {
    if (saving) return;
    setError('');
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    if (password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await resetUserPassword(token, user.id, password);
      onReset(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset the password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="modal"
        ref={dialogRef} role="dialog"
        aria-modal="true"
        aria-labelledby="reset-password-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="reset-password-title" className="modal-title">
            Reset Password — {user.username}
          </h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          <div className="fg">
            <label className="fl">Account</label>
            <div className="dq-fixed-patient">
              <span className="mono">{user.username}</span> · {user.fullName}
            </div>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="rp-password">New Password *</label>
            <input
              id="rp-password"
              className="fc"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              disabled={saving}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleReset} disabled={saving}>
            {saving ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
