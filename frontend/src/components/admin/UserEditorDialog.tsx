'use client';

import { useState } from 'react';
import { createUser, updateUser, type AdminUser } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useDialogA11y } from '@/lib/useDialogA11y';

interface UserEditorDialogProps {
  /** null = Add User; an existing user = Edit User (incl. role assignment). */
  user: AdminUser | null;
  roles: string[];
  open: boolean;
  onClose: () => void;
  onSaved: (user: AdminUser, created: boolean) => void;
}

const USERNAME_RE = /^[a-z0-9._-]+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function roleLabel(role: string): string {
  return role.replace(/_/g, ' ');
}

/**
 * Add / Edit User dialog for Administration → Users & Roles. One dialog serves
 * both modes; the role select is how administrators assign roles. Username is
 * the account's identity and is read-only once created; passwords are only set
 * here at creation (resets are a separate action). Client validation mirrors
 * the backend DTOs; server guardrails (duplicate username, last-admin rule)
 * surface in the error box.
 */
export default function UserEditorDialog({
  user,
  roles,
  open,
  onClose,
  onSaved,
}: UserEditorDialogProps) {
  const isNew = user === null;

  const [username, setUsername] = useState(user?.username ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState(user?.role ?? roles[0] ?? '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, () => !saving && onClose());

  if (!open) return null;

  function validate(): string {
    if (isNew) {
      const name = username.trim();
      if (!name) return 'Username is required.';
      if (name.length > 60) return 'Username must be at most 60 characters.';
      if (!USERNAME_RE.test(name)) {
        return 'Username may contain only letters, numbers, dots, hyphens and underscores.';
      }
      if (password.length < 8) return 'Password must be at least 8 characters.';
    }
    if (!fullName.trim()) return 'Full name is required.';
    if (fullName.trim().length > 160) return 'Full name must be at most 160 characters.';
    const mail = email.trim();
    if (mail && (!EMAIL_RE.test(mail) || mail.length > 160)) {
      return 'Email must be a valid address.';
    }
    if (!role) return 'A role must be selected.';
    return '';
  }

  async function handleSave() {
    if (saving) return;
    setError('');
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      const mail = email.trim();
      if (isNew) {
        const created = await createUser(token, {
          username: username.trim(),
          fullName: fullName.trim(),
          email: mail || undefined,
          role,
          password,
        });
        onSaved(created, true);
      } else {
        const updated = await updateUser(token, user.id, {
          fullName: fullName.trim(),
          email: mail || null,
          role,
        });
        onSaved(updated, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the user.');
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
        aria-labelledby="user-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="user-editor-title" className="modal-title">
            {isNew ? 'Add User' : `Edit User — ${user.username}`}
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

          {isNew ? (
            <div className="fg">
              <label className="fl" htmlFor="ue-username">Username *</label>
              <input
                id="ue-username"
                className="fc"
                autoComplete="off"
                placeholder="e.g. anm.kamrup1"
                value={username}
                disabled={saving}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          ) : (
            <div className="fg">
              <label className="fl">Username</label>
              <div className="dq-fixed-patient">
                <span className="mono">{user.username}</span>
              </div>
            </div>
          )}

          <div className="fg">
            <label className="fl" htmlFor="ue-fullname">Full Name *</label>
            <input
              id="ue-fullname"
              className="fc"
              autoComplete="off"
              value={fullName}
              disabled={saving}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="modal-row">
            <div className="fg">
              <label className="fl" htmlFor="ue-email">Email</label>
              <input
                id="ue-email"
                className="fc"
                type="email"
                autoComplete="off"
                placeholder="optional"
                value={email}
                disabled={saving}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="ue-role">Role *</label>
              <select
                id="ue-role"
                className="fc"
                value={role}
                disabled={saving}
                onChange={(e) => setRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </select>
            </div>
          </div>

          {isNew && (
            <div className="fg">
              <label className="fl" htmlFor="ue-password">Initial Password *</label>
              <input
                id="ue-password"
                className="fc"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                disabled={saving}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create User' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
