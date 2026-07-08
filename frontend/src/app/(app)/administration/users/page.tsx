'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchRbacRoles, fetchUsers, updateUser, type AdminUser, type RbacRoleSummary } from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import ComingSoon from '@/components/shell/ComingSoon';
import ResetPasswordDialog from '@/components/admin/ResetPasswordDialog';
import Workspace from '@/components/workspace/Workspace';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceGrid from '@/components/workspace/WorkspaceGrid';
import Panel from '@/components/workspace/Panel';
import PanelHeader from '@/components/workspace/PanelHeader';
import PanelContent from '@/components/workspace/PanelContent';
import { useWorkspaceShell } from '@/components/workspace/useWorkspaceShell';
import { Inbox, Plus, RefreshCw } from 'lucide-react';
import { SkeletonTable } from '@/components/shell/Skeleton';

type StatusFilter = 'ALL' | 'ACTIVE' | 'DISABLED';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roleLabel(role: string): string {
  return role.replace(/_/g, ' ');
}

/**
 * Administration → Users & Roles. Lists every account with search and
 * role/status filters (client-side) plus the full set of management actions:
 * add, edit/assign role, enable/disable and reset password. Server guardrails
 * (self-disable, last active administrator) surface verbatim as error toasts.
 * Administrators only. Canonical M27 Workspace page after the Dashboard.
 */
export default function UsersRolesPage() {
  const { can } = useUser();
  const router = useRouter();
  const isAdmin = can('admin.pages');
  useWorkspaceShell(isAdmin);

  const [users, setUsers] = useState<AdminUser[]>([]);
  // Roles come from the RBAC database (never a hardcoded list) — used for the
  // filter, the table role names, and the Role Designer entry strip.
  const [roles, setRoles] = useState<RbacRoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  // Row whose enable/disable request is in flight; blocks double submits.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (text: string, err = false) => {
    setToast({ text, err });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // Guardrail messages are longer; give them time to be read.
    toastTimer.current = setTimeout(() => setToast(null), err ? 4200 : 2600);
  };

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchUsers(token), fetchRbacRoles(token)])
      .then(([userList, roleList]) => {
        setUsers(userList);
        setRoles(roleList);
        setError('');
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load users.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // Inline enable/disable. Guardrails (self-disable, last active administrator)
  // are enforced server-side; their messages surface verbatim as error toasts.
  const toggleActive = async (u: AdminUser) => {
    const token = getToken();
    if (!token) return;
    setTogglingId(u.id);
    try {
      await updateUser(token, u.id, { isActive: !u.isActive });
      flash(`User '${u.username}' ${u.isActive ? 'disabled' : 'enabled'}.`);
      load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Unable to update the user.', true);
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (statusFilter === 'ACTIVE' && !u.isActive) return false;
      if (statusFilter === 'DISABLED' && u.isActive) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  // Display name for a user's role key, sourced from the RBAC database.
  const roleName = useMemo(() => new Map(roles.map((r) => [r.key, r.name])), [roles]);

  if (!isAdmin) {
    return (
      <ComingSoon
        title="Users & Roles"
        description="User management is available to administrators only."
      />
    );
  }

  const activeCount = users.filter((u) => u.isActive).length;
  // Full loading treatment only before first data; a refresh keeps the table up.
  const initialLoading = loading && users.length === 0;

  return (
    <Workspace aria-label="Users and roles">
      <WorkspaceHeader
        breadcrumb={[
          { label: 'Administration', href: '/administration' },
          { label: 'Users & Roles' },
        ]}
        title="Users & Roles"
        subtitle={
          initialLoading
            ? 'Loading…'
            : `${users.length} accounts · ${activeCount} active`
        }
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => router.push('/administration/roles/new')}
            >
              <Plus size={14} aria-hidden="true" /> New Role
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => router.push('/administration/users/new')}
            >
              <Plus size={14} aria-hidden="true" /> Add User
            </button>
          </>
        }
      />

      {roles.length > 0 && (
        <div className="rl-strip">
          <span className="rl-strip-label">Roles</span>
          <div className="rl-strip-list">
            {roles.map((r) => (
              <button
                key={r.key}
                type="button"
                className="rl-chip"
                onClick={() => router.push(`/administration/roles/${encodeURIComponent(r.key)}`)}
                title={`Design ${r.name}`}
              >
                <span className="rl-chip-dot" style={{ background: r.color ?? '#94a3b8' }} aria-hidden="true" />
                <span className="rl-chip-name">{r.name}</span>
                <span className="rl-chip-meta">{r.permissionCount}p · {r.userCount}u</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <WorkspaceGrid template="single">
        <Panel variant="flush" aria-label="User accounts">
          <PanelHeader
            title="Accounts"
            subtitle={
              initialLoading ? undefined : `${filtered.length} of ${users.length} shown`
            }
            actions={
              <>
                <input
                  className="fc wf-search"
                  placeholder="Search name, username or email…"
                  value={search}
                  aria-label="Search users"
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className="fc"
                  style={{ width: 150 }}
                  value={roleFilter}
                  aria-label="Filter by role"
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="ALL">All roles</option>
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>{r.name}</option>
                  ))}
                </select>
                <select
                  className="fc"
                  style={{ width: 130 }}
                  value={statusFilter}
                  aria-label="Filter by status"
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DISABLED">Disabled</option>
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={load}
                  disabled={loading}
                >
                  <RefreshCw size={13} aria-hidden="true" /> Refresh
                </button>
              </>
            }
          />
          <PanelContent padded={false} aria-label="Users table" tabIndex={0}>
            {error && <div className="dash-error usr-error">{error}</div>}

            {initialLoading ? (
              <SkeletonTable rows={6} />
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
                <div className="empty-state-text">
                  {users.length === 0
                    ? 'No user accounts exist yet.'
                    : 'No users match your search or filters.'}
                </div>
              </div>
            ) : (
              <table className="data-table usr-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Created</th>
                    <th className="usr-col-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id}>
                      <td className="usr-name">{u.fullName}</td>
                      <td className="mono">{u.username}</td>
                      <td>{roleName.get(u.role) ?? roleLabel(u.role)}</td>
                      <td>
                        <span className={`pill ${u.isActive ? 'pill-active' : 'pill-inactive'}`}>
                          {u.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="usr-dim">{formatDateTime(u.lastLogin)}</td>
                      <td className="usr-dim">{formatDate(u.createdAt)}</td>
                      <td className="usr-col-actions">
                        <div className="usr-row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => router.push(`/administration/users/${u.id}`)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={togglingId === u.id}
                            onClick={() => toggleActive(u)}
                          >
                            {togglingId === u.id ? '…' : u.isActive ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setResetting(u)}
                          >
                            Reset Password
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PanelContent>
        </Panel>
      </WorkspaceGrid>

      {resetting !== null && (
        <ResetPasswordDialog
          user={resetting}
          open
          onClose={() => setResetting(null)}
          onReset={(target) => {
            setResetting(null);
            flash(`Password reset for '${target.username}'.`);
            load();
          }}
        />
      )}

      {toast && (
        <div className={`cz-toast${toast.err ? ' cz-toast--err' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </Workspace>
  );
}
