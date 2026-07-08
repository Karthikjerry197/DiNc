'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createRole,
  fetchRbacPermissions,
  fetchRbacRole,
  fetchRbacRoles,
  setRolePermissions,
  updateRole,
  type RbacPermission,
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
import { Check, ChevronDown, ChevronRight, Lock, Plus, Search, ShieldCheck } from 'lucide-react';

interface RoleWorkspaceProps {
  /** Optional entry point: preselect a role by key, or start in create mode. */
  initialRoleKey?: string;
  initialMode?: 'new' | 'edit';
}

const DEFAULT_COLOR = '#2563eb';

/** A local snapshot of the editable role draft, used for dirty-tracking and Cancel. */
interface RoleDraft {
  name: string;
  description: string;
  color: string;
  isActive: boolean;
  granted: Set<string>;
}

function emptyDraft(): RoleDraft {
  return { name: '', description: '', color: DEFAULT_COLOR, isActive: true, granted: new Set() };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function draftsEqual(a: RoleDraft, b: RoleDraft): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.color === b.color &&
    a.isActive === b.isActive &&
    setsEqual(a.granted, b.granted)
  );
}

/**
 * Role Workspace (Milestone 3B) — the enterprise role-design environment and the
 * ONLY place permissions are edited. Master–detail, three panels:
 *   LEFT   · every role from the RBAC database (select to load its configuration)
 *   CENTRE · editable Role Configuration — name/description/colour + permission
 *            groups (groups, permissions, descriptions and dependencies all from
 *            PostgreSQL; nothing hardcoded)
 *   RIGHT  · Live Preview, recomputed instantly from the unsaved draft
 *
 * Save persists ONLY to `rbac_roles` (metadata) and `rbac_role_permissions`
 * (grants); it never touches `users` or `rbac_user_roles`, so user assignments
 * are untouched. The designer reuses the DB dependency model: enabling a
 * permission auto-grants prerequisites, disabling cascades to dependents, and the
 * backend re-validates on save. Cancel discards the unsaved draft.
 */
export default function RoleWorkspace({ initialRoleKey, initialMode }: RoleWorkspaceProps) {
  const { can } = useUser();
  const isAdmin = can('admin.pages');
  useWorkspaceShell(isAdmin);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reference data from the RBAC database.
  const [roles, setRoles] = useState<RbacRoleSummary[]>([]);
  const [catalogue, setCatalogue] = useState<RbacPermissionGroup[]>([]);

  // Selection + editable draft.
  const [mode, setMode] = useState<'new' | 'edit'>('edit');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isSystem, setIsSystem] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft());
  // Baseline = the last persisted state; drives dirty-detection and Cancel.
  const [baseline, setBaseline] = useState<RoleDraft>(emptyDraft());

  // Centre-panel UI state.
  const [permQuery, setPermQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const setDraftField = useCallback(
    <K extends keyof RoleDraft>(key: K, value: RoleDraft[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    [],
  );

  // ── Load a single role's configuration into the draft ───────────────────────
  const loadRole = useCallback(async (key: string) => {
    const token = getToken();
    if (!token) return;
    setLoadingDetail(true);
    setError('');
    try {
      const [detail, summaries] = await Promise.all([
        fetchRbacRole(token, key),
        fetchRbacRoles(token),
      ]);
      const next: RoleDraft = {
        name: detail.name,
        description: detail.description ?? '',
        color: detail.color ?? DEFAULT_COLOR,
        isActive: detail.isActive,
        granted: new Set(detail.permissionKeys),
      };
      setRoles(summaries);
      setMode('edit');
      setSelectedKey(detail.key);
      setIsSystem(detail.isSystem);
      setUserCount(summaries.find((r) => r.key === detail.key)?.userCount ?? 0);
      setDraft(next);
      setBaseline({ ...next, granted: new Set(next.granted) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the role.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const enterNewMode = useCallback(() => {
    const fresh = emptyDraft();
    setMode('new');
    setSelectedKey(null);
    setIsSystem(false);
    setUserCount(0);
    setDraft(fresh);
    setBaseline({ ...fresh, granted: new Set() });
    setPermQuery('');
    setError('');
  }, []);

  // Initial load: permission catalogue + role list, then pick the entry selection.
  useEffect(() => {
    if (!isAdmin) { setLoadingList(false); return; }
    const token = getToken();
    if (!token) { setLoadingList(false); return; }
    let alive = true;
    setLoadingList(true);

    (async () => {
      try {
        const [groups, roleList] = await Promise.all([
          fetchRbacPermissions(token),
          fetchRbacRoles(token),
        ]);
        if (!alive) return;
        setCatalogue(groups);
        setRoles(roleList);
        setLoadingList(false);

        if (initialMode === 'new') {
          enterNewMode();
        } else {
          const startKey =
            (initialRoleKey && roleList.find((r) => r.key === initialRoleKey)?.key) ||
            roleList[0]?.key;
          if (startKey) await loadRole(startKey);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Unable to load the role workspace.');
          setLoadingList(false);
        }
      }
    })();

    return () => { alive = false; };
  }, [isAdmin, initialMode, initialRoleKey, enterNewMode, loadRole]);

  // ── Dirty tracking ──────────────────────────────────────────────────────────
  const dirty = useMemo(() => !draftsEqual(draft, baseline), [draft, baseline]);

  // Guard role/new switches when there are unsaved edits.
  const confirmDiscard = useCallback((): boolean => {
    if (!dirty) return true;
    return typeof window === 'undefined'
      ? true
      : window.confirm('Discard unsaved changes to this role?');
  }, [dirty]);

  const selectRole = useCallback((key: string) => {
    if (key === selectedKey && mode === 'edit') return;
    if (!confirmDiscard()) return;
    void loadRole(key);
  }, [selectedKey, mode, confirmDiscard, loadRole]);

  const startNew = useCallback(() => {
    if (!confirmDiscard()) return;
    enterNewMode();
  }, [confirmDiscard, enterNewMode]);

  // ── Dependency graph (entirely from the DB catalogue) ───────────────────────
  const permByKey = useMemo(() => {
    const m = new Map<string, RbacPermission>();
    catalogue.forEach((g) => g.permissions.forEach((p) => m.set(p.key, p)));
    return m;
  }, [catalogue]);

  // key → keys that DIRECTLY require it (reverse edges).
  const dependentsDirect = useMemo(() => {
    const m = new Map<string, Set<string>>();
    permByKey.forEach((p) => {
      p.requires.forEach((req) => {
        if (!m.has(req)) m.set(req, new Set());
        m.get(req)!.add(p.key);
      });
    });
    return m;
  }, [permByKey]);

  const closure = useCallback(
    (start: string, edges: (k: string) => Iterable<string>): string[] => {
      const out = new Set<string>();
      const stack = [...edges(start)];
      while (stack.length) {
        const k = stack.pop() as string;
        if (out.has(k)) continue;
        out.add(k);
        for (const n of edges(k)) stack.push(n);
      }
      return [...out];
    },
    [],
  );

  const togglePerm = useCallback((key: string) => {
    setDraft((prev) => {
      const next = new Set(prev.granted);
      if (next.has(key)) {
        // Disable this permission and everything that (transitively) needs it.
        next.delete(key);
        closure(key, (k) => dependentsDirect.get(k) ?? []).forEach((d) => next.delete(d));
      } else {
        // Enable this permission and all of its prerequisites.
        next.add(key);
        closure(key, (k) => permByKey.get(k)?.requires ?? []).forEach((r) => next.add(r));
      }
      return { ...prev, granted: next };
    });
  }, [closure, dependentsDirect, permByKey]);

  // ── Derived (live preview) ──────────────────────────────────────────────────
  const effective = draft.granted;
  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => !item.permission || effective.has(item.permission)),
    [effective],
  );
  const grantedCount = draft.granted.size;
  const groupStats = useMemo(
    () => catalogue.map((g) => ({
      group: g.group,
      total: g.permissions.length,
      granted: g.permissions.filter((p) => draft.granted.has(p.key)).length,
    })),
    [catalogue, draft.granted],
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

  // ── Save / Cancel ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saving) return;
    const token = getToken();
    if (!token) { setError('Your session has expired. Please sign in again.'); return; }
    if (!draft.name.trim()) { setError('Role name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const keys = [...draft.granted];
      if (mode === 'new') {
        const created = await createRole(token, {
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          color: draft.color,
          permissionKeys: keys,
        });
        await loadRole(created.key); // refresh list + select the new role
      } else if (selectedKey) {
        // Metadata → rbac_roles only; grants → rbac_role_permissions only.
        await updateRole(token, selectedKey, {
          name: draft.name.trim(),
          description: draft.description.trim(),
          color: draft.color,
          isActive: draft.isActive,
        });
        await setRolePermissions(token, selectedKey, keys);
        await loadRole(selectedKey); // reload persisted values + refresh baseline
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the role.');
    } finally {
      setSaving(false);
    }
  }, [saving, draft, mode, selectedKey, loadRole]);

  const handleCancel = useCallback(() => {
    // Discard unsaved edits — revert the draft to the last persisted baseline.
    setDraft({ ...baseline, granted: new Set(baseline.granted) });
    setError('');
  }, [baseline]);

  if (!isAdmin) {
    return <ComingSoon title="Role Workspace" description="Administrator access is required." />;
  }

  const showForm = mode === 'new' || selectedKey !== null;
  const title = mode === 'new' ? 'New Role' : `Role Workspace — ${draft.name || selectedKey || ''}`;

  return (
    <Workspace aria-label="Role workspace">
      <WorkspaceHeader
        breadcrumb={[
          { label: 'Administration', href: '/administration' },
          { label: 'Users & Roles', href: '/administration/users' },
          { label: 'Roles' },
        ]}
        title={title}
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleCancel}
              disabled={saving || !dirty}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || loadingDetail || !showForm || !dirty}
            >
              {saving ? 'Saving…' : mode === 'new' ? 'Create Role' : 'Save Changes'}
            </button>
          </>
        }
      />

      {error && <div className="dash-error usr-error">{error}</div>}

      <WorkspaceGrid template="list-primary-inspector" className="uw-grid">
        {/* ── LEFT: all roles (master list, from PostgreSQL) ── */}
        <Panel aria-label="Roles">
          <PanelHeader title="Roles" subtitle={loadingList ? undefined : `${roles.length} defined`} />
          <PanelContent>
            {loadingList ? (
              <SkeletonLines lines={7} />
            ) : (
              <div className="uw-access">
                <button type="button" className="btn btn-ghost btn-sm rd-new-role" onClick={startNew} disabled={saving}>
                  <Plus size={14} aria-hidden="true" /> New Role
                </button>
                <div className="uw-role-list" role="listbox" aria-label="Roles">
                  {roles.map((r) => {
                    const selected = r.key === selectedKey && mode === 'edit';
                    return (
                      <button
                        key={r.key}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`uw-role-card${selected ? ' selected' : ''}`}
                        onClick={() => selectRole(r.key)}
                        disabled={saving}
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
              </div>
            )}
          </PanelContent>
        </Panel>

        {/* ── CENTRE: Role Configuration (metadata + permissions) ── */}
        <Panel aria-label="Role configuration">
          <PanelHeader
            title="Role Configuration"
            subtitle={loadingDetail || !showForm ? undefined : `${grantedCount} permission${grantedCount === 1 ? '' : 's'} granted`}
          />
          <PanelContent>
            {loadingDetail ? (
              <SkeletonLines lines={12} />
            ) : !showForm ? (
              <div className="uw-perm-empty">Select a role to configure, or create a new one.</div>
            ) : (
              <div className="uw-access">
                {/* Role metadata */}
                <div className="uw-form">
                  {isSystem && (
                    <div className="rd-system-note">
                      <Lock size={12} aria-hidden="true" /> System role — configurable, cannot be deleted.
                    </div>
                  )}
                  <div className="fg">
                    <label className="fl" htmlFor="rd-name">Role Name *</label>
                    <input id="rd-name" className="fc" value={draft.name} disabled={saving}
                      placeholder="e.g. District Supervisor" onChange={(e) => setDraftField('name', e.target.value)} />
                  </div>
                  {mode === 'edit' && selectedKey && (
                    <div className="fg">
                      <label className="fl">Key</label>
                      <div className="uw-readonly mono">{selectedKey}</div>
                    </div>
                  )}
                  <div className="fg">
                    <label className="fl" htmlFor="rd-desc">Description</label>
                    <textarea id="rd-desc" className="fc modal-textarea" value={draft.description} disabled={saving}
                      placeholder="What this role is for…" maxLength={300}
                      onChange={(e) => setDraftField('description', e.target.value)} />
                  </div>
                  <div className="fg">
                    <label className="fl" htmlFor="rd-color">Role Colour</label>
                    <div className="rd-color-row">
                      <input id="rd-color" type="color" className="rd-color" value={draft.color} disabled={saving}
                        onChange={(e) => setDraftField('color', e.target.value)} />
                      <span className="rd-color-hex mono">{draft.color}</span>
                    </div>
                  </div>
                  {mode === 'edit' && (
                    <div className="fg">
                      <label className="fl">Status</label>
                      <button type="button" className={`uw-status-toggle${draft.isActive ? ' on' : ''}`}
                        onClick={() => setDraftField('isActive', !draft.isActive)} disabled={saving} aria-pressed={draft.isActive}>
                        <span className={`pill ${draft.isActive ? 'pill-active' : 'pill-inactive'}`}>
                          {draft.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <span className="uw-status-hint">click to {draft.isActive ? 'deactivate' : 'activate'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Permission designer (groups & permissions from PostgreSQL) */}
                <div className="uw-perm-head">
                  <div className="uw-subhead" style={{ margin: 0 }}>
                    Permissions
                    <span className="uw-subhead-hint">toggle to grant · prerequisites are handled automatically</span>
                  </div>
                  <div className="uw-perm-search">
                    <Search size={13} aria-hidden="true" />
                    <input type="text" placeholder="Search permissions…" aria-label="Search permissions"
                      value={permQuery} onChange={(e) => setPermQuery(e.target.value)} />
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
                        <button type="button" className="uw-perm-group-title"
                          onClick={() => toggleGroup(group.group)} aria-expanded={open}>
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
                              const on = draft.granted.has(p.key);
                              const reqLabels = p.requires.map((r) => permByKey.get(r)?.label ?? r);
                              return (
                                <li key={p.key}>
                                  <button type="button"
                                    className={`uw-perm rd-perm${on ? ' granted' : ''}`}
                                    onClick={() => togglePerm(p.key)} disabled={saving}
                                    aria-pressed={on}>
                                    <span className="uw-perm-check" aria-hidden="true">{on ? <Check size={12} /> : null}</span>
                                    <span className="rd-perm-body">
                                      <span className="uw-perm-label">{p.label}</span>
                                      {p.description && <span className="rd-perm-desc">{p.description}</span>}
                                      {reqLabels.length > 0 && (
                                        <span className="rd-perm-req">Requires: {reqLabels.join(', ')}</span>
                                      )}
                                    </span>
                                    <span className="uw-perm-key mono">{p.key}</span>
                                  </button>
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
          <PanelHeader title="Live Preview" subtitle="What this role grants" />
          <PanelContent>
            {loadingDetail || !showForm ? (
              <SkeletonLines lines={8} />
            ) : (
              <div className="uw-preview">
                <div className="uw-preview-note">
                  <ShieldCheck size={13} aria-hidden="true" />
                  Updates instantly as permissions change.
                </div>

                <div className="uw-preview-role">
                  <span className="uw-preview-role-dot" style={{ background: draft.color }} aria-hidden="true" />
                  <div className="uw-preview-role-body">
                    <div className="uw-preview-role-name">{draft.name || 'Untitled role'}</div>
                    {draft.description && <div className="uw-preview-role-desc">{draft.description}</div>}
                    {mode === 'edit' && (
                      <div className="uw-preview-role-desc">{userCount} user{userCount === 1 ? '' : 's'} assigned</div>
                    )}
                  </div>
                </div>

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
                        <span className="uw-cov-fill"
                          style={{ width: `${s.total ? Math.round((s.granted / s.total) * 100) : 0}%` }} />
                      </span>
                      <span className="uw-cov-num">{s.granted}/{s.total}</span>
                    </div>
                  ))}
                </div>

                <div className="uw-subhead" style={{ marginTop: 12 }}>Total</div>
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
