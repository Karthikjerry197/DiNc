'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createRole,
  fetchRbacPermissions,
  fetchRbacRole,
  fetchRbacRoles,
  setRolePermissions,
  updateRole,
  type RbacPermission,
  type RbacPermissionGroup,
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
import { Check, ChevronDown, ChevronRight, Lock, Search, ShieldCheck } from 'lucide-react';

interface RoleWorkspaceProps {
  mode: 'new' | 'edit';
  roleKey?: string;
}

const DEFAULT_COLOR = '#2563eb';

/**
 * Role Designer (Milestone 3) — the enterprise role-design environment. Three
 * panels: Role Details · Permission Designer · Live Preview. Every permission,
 * group, description and dependency is loaded from the RBAC database; nothing is
 * hardcoded. The designer enforces permission dependencies: enabling a permission
 * auto-grants its prerequisites, disabling one cascades to its dependents, and
 * the backend re-validates on save.
 */
export default function RoleWorkspace({ mode, roleKey }: RoleWorkspaceProps) {
  const router = useRouter();
  const { can } = useUser();
  const isAdmin = can('admin.pages');
  useWorkspaceShell(isAdmin);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [catalogue, setCatalogue] = useState<RbacPermissionGroup[]>([]);

  // Editable role details + grants.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [isActive, setIsActive] = useState(true);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [isSystem, setIsSystem] = useState(false);
  const [existingKey, setExistingKey] = useState('');
  const [userCount, setUserCount] = useState(0);

  // Centre UI state.
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
        const groups = await fetchRbacPermissions(token);
        if (!alive) return;
        setCatalogue(groups);

        if (mode === 'edit' && roleKey) {
          const [detail, summaries] = await Promise.all([
            fetchRbacRole(token, roleKey),
            fetchRbacRoles(token),
          ]);
          if (!alive) return;
          setName(detail.name);
          setDescription(detail.description ?? '');
          setColor(detail.color ?? DEFAULT_COLOR);
          setIsActive(detail.isActive);
          setIsSystem(detail.isSystem);
          setExistingKey(detail.key);
          setGranted(new Set(detail.permissionKeys));
          setUserCount(summaries.find((r) => r.key === detail.key)?.userCount ?? 0);
        }
        setLoading(false);
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Unable to load the role designer.');
          setLoading(false);
        }
      }
    })();

    return () => { alive = false; };
  }, [isAdmin, mode, roleKey]);

  // ── Dependency graph (from the DB catalogue) ────────────────────────────────
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
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Disable this permission and everything that (transitively) needs it.
        next.delete(key);
        closure(key, (k) => dependentsDirect.get(k) ?? []).forEach((d) => next.delete(d));
      } else {
        // Enable this permission and all of its prerequisites.
        next.add(key);
        closure(key, (k) => permByKey.get(k)?.requires ?? []).forEach((r) => next.add(r));
      }
      return next;
    });
  }, [closure, dependentsDirect, permByKey]);

  // ── Derived (live) ──────────────────────────────────────────────────────────
  const effective = granted;
  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => !item.permission || effective.has(item.permission)),
    [effective],
  );
  const grantedCount = granted.size;
  const groupStats = useMemo(
    () => catalogue.map((g) => ({
      group: g.group,
      total: g.permissions.length,
      granted: g.permissions.filter((p) => granted.has(p.key)).length,
    })),
    [catalogue, granted],
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

  const handleSave = useCallback(async () => {
    if (saving) return;
    const token = getToken();
    if (!token) { setError('Your session has expired. Please sign in again.'); return; }
    if (!name.trim()) { setError('Role name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const keys = [...granted];
      if (mode === 'new') {
        await createRole(token, {
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          permissionKeys: keys,
        });
      } else if (existingKey) {
        await updateRole(token, existingKey, {
          name: name.trim(),
          description: description.trim(),
          color,
          isActive,
        });
        await setRolePermissions(token, existingKey, keys);
      }
      router.push('/administration/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the role.');
      setSaving(false);
    }
  }, [saving, name, granted, mode, description, color, existingKey, isActive, router]);

  if (!isAdmin) {
    return <ComingSoon title="Role Designer" description="Administrator access is required." />;
  }

  const title = mode === 'new' ? 'New Role' : `Role Designer — ${name || existingKey}`;

  return (
    <Workspace aria-label="Role designer">
      <WorkspaceHeader
        breadcrumb={[
          { label: 'Administration', href: '/administration' },
          { label: 'Users & Roles', href: '/administration/users' },
          { label: mode === 'new' ? 'New Role' : 'Role Designer' },
        ]}
        title={title}
        actions={
          <>
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => router.push('/administration/users')} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm"
              onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : mode === 'new' ? 'Create Role' : 'Save Role'}
            </button>
          </>
        }
      />

      {error && <div className="dash-error usr-error">{error}</div>}

      <WorkspaceGrid template="list-primary-inspector" className="uw-grid">
        {/* ── LEFT: Role Details ── */}
        <Panel aria-label="Role details">
          <PanelHeader title="Role Details" />
          <PanelContent>
            {loading ? (
              <SkeletonLines lines={6} />
            ) : (
              <div className="uw-form">
                {isSystem && (
                  <div className="rd-system-note">
                    <Lock size={12} aria-hidden="true" /> System role — configurable, cannot be deleted.
                  </div>
                )}
                <div className="fg">
                  <label className="fl" htmlFor="rd-name">Role Name *</label>
                  <input id="rd-name" className="fc" value={name} disabled={saving}
                    placeholder="e.g. District Supervisor" onChange={(e) => setName(e.target.value)} />
                </div>
                {mode === 'edit' && (
                  <div className="fg">
                    <label className="fl">Key</label>
                    <div className="uw-readonly mono">{existingKey}</div>
                  </div>
                )}
                <div className="fg">
                  <label className="fl" htmlFor="rd-desc">Description</label>
                  <textarea id="rd-desc" className="fc modal-textarea" value={description} disabled={saving}
                    placeholder="What this role is for…" maxLength={300}
                    onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl" htmlFor="rd-color">Role Colour</label>
                  <div className="rd-color-row">
                    <input id="rd-color" type="color" className="rd-color" value={color} disabled={saving}
                      onChange={(e) => setColor(e.target.value)} />
                    <span className="rd-color-hex mono">{color}</span>
                  </div>
                </div>
                {mode === 'edit' && (
                  <div className="fg">
                    <label className="fl">Status</label>
                    <button type="button" className={`uw-status-toggle${isActive ? ' on' : ''}`}
                      onClick={() => setIsActive((v) => !v)} disabled={saving} aria-pressed={isActive}>
                      <span className={`pill ${isActive ? 'pill-active' : 'pill-inactive'}`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="uw-status-hint">click to {isActive ? 'deactivate' : 'activate'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </PanelContent>
        </Panel>

        {/* ── CENTRE: Permission Designer ── */}
        <Panel aria-label="Permission designer">
          <PanelHeader
            title="Permission Designer"
            subtitle={loading ? undefined : `${grantedCount} granted`}
          />
          <PanelContent>
            {loading ? (
              <SkeletonLines lines={12} />
            ) : (
              <div className="uw-access">
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
                              const on = granted.has(p.key);
                              const reqLabels = p.requires
                                .map((r) => permByKey.get(r)?.label ?? r);
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
            {loading ? (
              <SkeletonLines lines={8} />
            ) : (
              <div className="uw-preview">
                <div className="uw-preview-note">
                  <ShieldCheck size={13} aria-hidden="true" />
                  Updates instantly as permissions change.
                </div>

                <div className="uw-preview-role">
                  <span className="uw-preview-role-dot" style={{ background: color }} aria-hidden="true" />
                  <div className="uw-preview-role-body">
                    <div className="uw-preview-role-name">{name || 'Untitled role'}</div>
                    {description && <div className="uw-preview-role-desc">{description}</div>}
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
