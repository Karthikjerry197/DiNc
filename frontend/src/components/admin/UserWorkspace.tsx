'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUser,
  fetchRbacPermissions,
  fetchRbacRole,
  fetchRbacRoles,
  fetchUserAccess,
  fetchUsers,
  setUserRoles,
  updateUser,
  type AdminUser,
  type RbacPermissionGroup,
  type RbacRoleSummary,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import { NAV_ITEMS } from '@/components/shell/Sidebar';
import Workspace from '@/components/workspace/Workspace';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceGrid from '@/components/workspace/WorkspaceGrid';
import Panel from '@/components/workspace/Panel';
import PanelHeader from '@/components/workspace/PanelHeader';
import PanelContent from '@/components/workspace/PanelContent';
import { useWorkspaceShell } from '@/components/workspace/useWorkspaceShell';
import ComingSoon from '@/components/shell/ComingSoon';
import { SkeletonLines } from '@/components/shell/Skeleton';
import { Check, ChevronDown, ChevronRight, Search, ShieldCheck } from 'lucide-react';

interface UserWorkspaceProps {
  mode: 'new' | 'edit';
  userId?: string;
}

const USERNAME_RE = /^[a-z0-9._-]+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * User Workspace (Milestone 2) — the EMR-style, three-panel editing experience
 * that replaces the Add/Edit User dialog. Profile (left) · Access Configuration
 * (centre, entirely driven by the RBAC database) · Live Preview (right, mirrors
 * the real Sidebar). The preview recomputes instantly as the assigned role
 * changes. Single-role for now (multiple roles arrive in Milestone 5).
 */
export default function UserWorkspace({ mode, userId }: UserWorkspaceProps) {
  const router = useRouter();
  const { can } = useUser();
  const isAdmin = can('admin.pages');
  useWorkspaceShell(isAdmin);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reference data from the RBAC database.
  const [catalogue, setCatalogue] = useState<RbacPermissionGroup[]>([]);
  const [roles, setRoles] = useState<RbacRoleSummary[]>([]);
  // roleKey → its granted permission keys (preloaded so the preview is instant).
  const [rolePerms, setRolePerms] = useState<Map<string, Set<string>>>(new Map());

  // Editable profile + assignment.
  const [existing, setExisting] = useState<AdminUser | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [roleKey, setRoleKey] = useState('');
  // Centre-panel UI state (refinement pass): permission search + collapsed groups.
  const [permQuery, setPermQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    const token = getToken();
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const [groups, roleList] = await Promise.all([
          fetchRbacPermissions(token),
          fetchRbacRoles(token),
        ]);
        // Preload each role's granted permission keys for instant preview.
        const details = await Promise.all(roleList.map((r) => fetchRbacRole(token, r.key)));
        if (!alive) return;
        const map = new Map<string, Set<string>>();
        details.forEach((d) => map.set(d.key, new Set(d.permissionKeys)));
        setCatalogue(groups);
        setRoles(roleList);
        setRolePerms(map);

        if (mode === 'edit' && userId) {
          // Profile fields come from the users record; the assigned role is read
          // from the RBAC assignment table (rbac_user_roles), not users.role.
          const [user, access] = await Promise.all([
            fetchUsers(token).then((list) => list.find((u) => u.id === userId) ?? null),
            fetchUserAccess(token, userId),
          ]);
          if (!alive) return;
          if (!user) { setError('User not found.'); setLoading(false); return; }
          setExisting(user);
          setUsername(user.username);
          setFullName(user.fullName);
          setEmail(user.email ?? '');
          setIsActive(user.isActive);
          const primary = access.roles.find((r) => r.isPrimary)?.key ?? access.roles[0]?.key;
          setRoleKey(
            roleList.find((r) => r.key === primary)?.key
            ?? roleList.find((r) => r.key === user.role)?.key
            ?? roleList[0]?.key
            ?? '',
          );
        } else {
          setRoleKey(roleList[0]?.key ?? '');
        }
        setLoading(false);
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Unable to load the workspace.');
          setLoading(false);
        }
      }
    })();

    return () => { alive = false; };
  }, [isAdmin, mode, userId]);

  // Effective permissions of the currently-selected role (live).
  const effective = useMemo(
    () => rolePerms.get(roleKey) ?? new Set<string>(),
    [rolePerms, roleKey],
  );
  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => !item.permission || effective.has(item.permission)),
    [effective],
  );
  const grantedCount = useMemo(
    () => catalogue.reduce((n, g) => n + g.permissions.filter((p) => effective.has(p.key)).length, 0),
    [catalogue, effective],
  );
  const selectedRole = useMemo(
    () => roles.find((r) => r.key === roleKey) ?? null,
    [roles, roleKey],
  );
  // Per-group granted/total (from the DB catalogue) — drives the group counts and
  // the preview's coverage bars.
  const groupStats = useMemo(
    () => catalogue.map((g) => ({
      group: g.group,
      total: g.permissions.length,
      granted: g.permissions.filter((p) => effective.has(p.key)).length,
    })),
    [catalogue, effective],
  );
  const searching = permQuery.trim().length > 0;
  const filteredCatalogue = useMemo(() => {
    const q = permQuery.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter(
          (p) => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [catalogue, permQuery]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const validate = useCallback((): string => {
    if (mode === 'new') {
      const u = username.trim();
      if (!u) return 'Username is required.';
      if (!USERNAME_RE.test(u)) return 'Username may contain only letters, numbers, dots, hyphens and underscores.';
      if (password.length < 8) return 'Password must be at least 8 characters.';
    }
    if (!fullName.trim()) return 'Full name is required.';
    const mail = email.trim();
    if (mail && !EMAIL_RE.test(mail)) return 'Email must be a valid address.';
    if (!roleKey) return 'A role must be assigned.';
    return '';
  }, [mode, username, password, fullName, email, roleKey]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const token = getToken();
    if (!token) { setError('Your session has expired. Please sign in again.'); return; }
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError('');
    try {
      const mail = email.trim();
      if (mode === 'new') {
        const created = await createUser(token, {
          username: username.trim(),
          fullName: fullName.trim(),
          email: mail || undefined,
          role: roleKey,
          password,
        });
        await setUserRoles(token, created.id, [roleKey]);
      } else if (userId) {
        await updateUser(token, userId, {
          fullName: fullName.trim(),
          email: mail || null,
          isActive,
        });
        await setUserRoles(token, userId, [roleKey]);
      }
      router.push('/administration/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the user.');
      setSaving(false);
    }
  }, [saving, validate, email, mode, username, fullName, roleKey, password, userId, isActive, router]);

  if (!isAdmin) {
    return <ComingSoon title="User Workspace" description="Administrator access is required." />;
  }

  const title = mode === 'new' ? 'Add User' : `Edit User — ${existing?.username ?? username}`;

  return (
    <Workspace aria-label="User workspace">
      <WorkspaceHeader
        breadcrumb={[
          { label: 'Administration', href: '/administration' },
          { label: 'Users & Roles', href: '/administration/users' },
          { label: mode === 'new' ? 'Add User' : 'User Access' },
        ]}
        title={title}
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => router.push('/administration/users')}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? 'Saving…' : mode === 'new' ? 'Create User' : 'Save Changes'}
            </button>
          </>
        }
      />

      {error && <div className="dash-error usr-error">{error}</div>}

      <WorkspaceGrid template="list-primary-inspector" className="uw-grid">
        {/* ── LEFT: User Profile ── */}
        <Panel aria-label="User profile">
          <PanelHeader title="User Profile" />
          <PanelContent>
            {loading ? (
              <SkeletonLines lines={7} />
            ) : (
              <div className="uw-form">
                <div className="fg">
                  <label className="fl" htmlFor="uw-username">Username{mode === 'new' ? ' *' : ''}</label>
                  {mode === 'new' ? (
                    <input id="uw-username" className="fc" autoComplete="off" placeholder="e.g. anm.kamrup1"
                      value={username} disabled={saving} onChange={(e) => setUsername(e.target.value)} />
                  ) : (
                    <div className="uw-readonly mono">{username}</div>
                  )}
                </div>

                <div className="fg">
                  <label className="fl" htmlFor="uw-fullname">Full Name *</label>
                  <input id="uw-fullname" className="fc" autoComplete="off"
                    value={fullName} disabled={saving} onChange={(e) => setFullName(e.target.value)} />
                </div>

                <div className="fg">
                  <label className="fl" htmlFor="uw-email">Email</label>
                  <input id="uw-email" className="fc" type="email" autoComplete="off" placeholder="optional"
                    value={email} disabled={saving} onChange={(e) => setEmail(e.target.value)} />
                </div>

                {mode === 'new' && (
                  <div className="fg">
                    <label className="fl" htmlFor="uw-password">Initial Password *</label>
                    <input id="uw-password" className="fc" type="password" autoComplete="new-password"
                      placeholder="At least 8 characters" value={password} disabled={saving}
                      onChange={(e) => setPassword(e.target.value)} />
                  </div>
                )}

                {mode === 'edit' && (
                  <div className="fg">
                    <label className="fl">Status</label>
                    <button
                      type="button"
                      className={`uw-status-toggle${isActive ? ' on' : ''}`}
                      onClick={() => setIsActive((v) => !v)}
                      disabled={saving}
                      aria-pressed={isActive}
                    >
                      <span className={`pill ${isActive ? 'pill-active' : 'pill-inactive'}`}>
                        {isActive ? 'Active' : 'Disabled'}
                      </span>
                      <span className="uw-status-hint">click to {isActive ? 'disable' : 'enable'}</span>
                    </button>
                  </div>
                )}

                {mode === 'edit' && (
                  <div className="uw-meta">
                    <div><dt>Last Login</dt><dd>{formatDateTime(existing?.lastLogin ?? null)}</dd></div>
                    <div><dt>Created</dt><dd>{formatDateTime(existing?.createdAt ?? null)}</dd></div>
                  </div>
                )}

                {/* Directory fields not yet stored in the users table — shown for
                    layout parity; they become editable when their columns are added. */}
                <div className="uw-subhead">Directory</div>
                {['Phone', 'Designation', 'Department', 'Facility'].map((label) => (
                  <div className="fg" key={label}>
                    <label className="fl">{label}</label>
                    <div className="uw-readonly uw-readonly--muted">Not recorded</div>
                  </div>
                ))}
              </div>
            )}
          </PanelContent>
        </Panel>

        {/* ── CENTRE: Access Configuration (RBAC database-driven) ── */}
        <Panel aria-label="Access configuration">
          <PanelHeader
            title="Access Configuration"
            subtitle={loading ? undefined : `${grantedCount} permissions via role`}
          />
          <PanelContent>
            {loading ? (
              <SkeletonLines lines={10} />
            ) : (
              <div className="uw-access">
                <div className="uw-subhead">Assigned Role</div>
                <div className="uw-role-list">
                  {roles.map((r) => {
                    const selected = r.key === roleKey;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        className={`uw-role-card${selected ? ' selected' : ''}`}
                        onClick={() => setRoleKey(r.key)}
                        disabled={saving}
                        aria-pressed={selected}
                      >
                        <span className="uw-role-dot" style={{ background: r.color ?? '#94a3b8' }} aria-hidden="true" />
                        <span className="uw-role-body">
                          <span className="uw-role-name">
                            {r.name}
                            {r.isSystem && <span className="uw-role-badge">System</span>}
                          </span>
                          {r.description && <span className="uw-role-desc">{r.description}</span>}
                          <span className="uw-role-meta">
                            {r.permissionCount} permission{r.permissionCount === 1 ? '' : 's'}
                            {' · '}
                            {r.userCount} user{r.userCount === 1 ? '' : 's'}
                          </span>
                        </span>
                        {selected && <Check size={15} aria-hidden="true" className="uw-role-check" />}
                      </button>
                    );
                  })}
                </div>

                <div className="uw-perm-head">
                  <div className="uw-subhead" style={{ margin: 0 }}>
                    Effective Permissions
                    <span className="uw-subhead-hint">granted by the assigned role · edit permissions in the Role workspace</span>
                  </div>
                  <div className="uw-perm-search">
                    <Search size={13} aria-hidden="true" />
                    <input
                      type="text"
                      placeholder="Search permissions…"
                      aria-label="Search permissions"
                      value={permQuery}
                      onChange={(e) => setPermQuery(e.target.value)}
                    />
                  </div>
                </div>

                {filteredCatalogue.length === 0 ? (
                  <div className="uw-perm-empty">No permissions match “{permQuery.trim()}”.</div>
                ) : (
                  filteredCatalogue.map((group) => {
                    const stat = groupStats.find((s) => s.group === group.group);
                    const open = searching || !collapsed.has(group.group);
                    return (
                      <div key={group.group} className="uw-perm-group">
                        <button
                          type="button"
                          className="uw-perm-group-title"
                          onClick={() => toggleGroup(group.group)}
                          aria-expanded={open}
                        >
                          <span className="uw-perm-caret" aria-hidden="true">
                            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </span>
                          <span className="uw-perm-group-name">{group.group}</span>
                          {stat && <span className="uw-perm-group-count">{stat.granted}/{stat.total}</span>}
                        </button>
                        {open && (group.permissions.length === 0 ? (
                          <div className="uw-perm-empty">No permissions configured.</div>
                        ) : (
                          <ul className="uw-perm-list">
                            {group.permissions.map((p) => {
                              const granted = effective.has(p.key);
                              return (
                                <li key={p.key} className={`uw-perm${granted ? ' granted' : ''}`}>
                                  <span className="uw-perm-check" aria-hidden="true">{granted ? <Check size={12} /> : null}</span>
                                  <span className="uw-perm-label" title={p.description ?? undefined}>{p.label}</span>
                                  <span className="uw-perm-key mono">{p.key}</span>
                                </li>
                              );
                            })}
                          </ul>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </PanelContent>
        </Panel>

        {/* ── RIGHT: Live Preview ── */}
        <Panel aria-label="Live preview" variant="subtle">
          <PanelHeader title="Live Preview" subtitle="What this user will see" />
          <PanelContent>
            {loading ? (
              <SkeletonLines lines={8} />
            ) : (
              <div className="uw-preview">
                <div className="uw-preview-note">
                  <ShieldCheck size={13} aria-hidden="true" />
                  Updates instantly as the role changes.
                </div>

                {selectedRole && (
                  <div className="uw-preview-role">
                    <span className="uw-preview-role-dot" style={{ background: selectedRole.color ?? '#94a3b8' }} aria-hidden="true" />
                    <div className="uw-preview-role-body">
                      <div className="uw-preview-role-name">{selectedRole.name}</div>
                      {selectedRole.description && (
                        <div className="uw-preview-role-desc">{selectedRole.description}</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="uw-subhead">Sidebar</div>
                <nav className="uw-sidebar" aria-label="Sidebar preview">
                  {visibleNav.map((item) => (
                    <span key={item.href} className="uw-sidebar-item">
                      <span className="uw-sidebar-icon" aria-hidden="true">{item.icon}</span>
                      <span className="uw-sidebar-label">{item.label}</span>
                    </span>
                  ))}
                </nav>

                <div className="uw-subhead" style={{ marginTop: 12 }}>Accessible Modules</div>
                <div className="uw-chips">
                  {visibleNav.map((item) => (
                    <span key={item.href} className="uw-chip">{item.label}</span>
                  ))}
                </div>

                <div className="uw-subhead" style={{ marginTop: 12 }}>Permission Coverage</div>
                <div className="uw-coverage">
                  {groupStats.map((s) => (
                    <div key={s.group} className="uw-cov-row">
                      <span className="uw-cov-label">{s.group}</span>
                      <span className="uw-cov-bar">
                        <span
                          className="uw-cov-fill"
                          style={{ width: `${s.total ? Math.round((s.granted / s.total) * 100) : 0}%` }}
                        />
                      </span>
                      <span className="uw-cov-num">{s.granted}/{s.total}</span>
                    </div>
                  ))}
                </div>

                <div className="uw-subhead" style={{ marginTop: 12 }}>Effective Permissions</div>
                <div className="uw-preview-count">
                  <strong>{grantedCount}</strong> permission{grantedCount === 1 ? '' : 's'} granted
                </div>
              </div>
            )}
          </PanelContent>
        </Panel>
      </WorkspaceGrid>
    </Workspace>
  );
}
