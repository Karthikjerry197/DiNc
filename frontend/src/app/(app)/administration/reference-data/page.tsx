'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  createReferenceCategory,
  createReferenceValue,
  deactivateReferenceValue,
  fetchReferenceCategories,
  fetchReferenceValues,
  reorderReferenceValues,
  updateReferenceValue,
  type ReferenceCategory,
  type ReferenceValue,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import { invalidateReferenceCache } from '@/lib/useReferenceData';
import ComingSoon from '@/components/shell/ComingSoon';
import { useDialogA11y } from '@/lib/useDialogA11y';
import { ArrowDown, ArrowUp, Database, Plus, RefreshCw, Search } from 'lucide-react';
import { SkeletonLines } from '@/components/shell/Skeleton';

/** Draft used by the create/edit value dialog. */
interface ValueDraft {
  id: string | null; // null = creating
  code: string;
  displayName: string;
  description: string;
  colour: string;
  isActive: boolean;
}

const EMPTY_DRAFT: ValueDraft = {
  id: null, code: '', displayName: '', description: '', colour: '', isActive: true,
};

export default function ReferenceDataPage() {
  const { can } = useUser();
  const isAdmin = can('admin.pages');

  const [categories, setCategories] = useState<ReferenceCategory[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [values, setValues] = useState<ReferenceValue[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingVals, setLoadingVals] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const [draft, setDraft] = useState<ValueDraft | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const loadCategories = useCallback(() => {
    const token = getToken();
    if (!token) { setLoadingCats(false); return; }
    setLoadingCats(true);
    fetchReferenceCategories(token, false)
      .then((list) => {
        setCategories(list);
        setLoadingCats(false);
        setSelectedKey((cur) => cur && list.some((c) => c.key === cur) ? cur : (list[0]?.key ?? null));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load categories.');
        setLoadingCats(false);
      });
  }, []);

  const loadValues = useCallback((key: string) => {
    const token = getToken();
    if (!token) return;
    setLoadingVals(true);
    fetchReferenceValues(token, key, false)
      .then((list) => { setValues(list); setLoadingVals(false); })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load values.');
        setLoadingVals(false);
      });
  }, []);

  useEffect(() => { if (isAdmin) loadCategories(); }, [isAdmin, loadCategories]);
  useEffect(() => { if (selectedKey) loadValues(selectedKey); }, [selectedKey, loadValues]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const selectedCategory = categories.find((c) => c.key === selectedKey) ?? null;

  const visibleValues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return values.filter((v) => {
      if (activeOnly && !v.isActive) return false;
      if (!q) return true;
      return v.code.toLowerCase().includes(q) || v.displayName.toLowerCase().includes(q);
    });
  }, [values, search, activeOnly]);

  const afterWrite = useCallback((message: string) => {
    invalidateReferenceCache();
    if (selectedKey) loadValues(selectedKey);
    loadCategories();
    flash(message);
  }, [selectedKey, loadValues, loadCategories, flash]);

  const saveValue = useCallback(async (d: ValueDraft) => {
    const token = getToken();
    if (!token || !selectedKey) return;
    if (d.id) {
      await updateReferenceValue(token, d.id, {
        displayName: d.displayName,
        description: d.description,
        colour: d.colour,
        isActive: d.isActive,
      });
    } else {
      await createReferenceValue(token, selectedKey, {
        code: d.code,
        displayName: d.displayName,
        description: d.description || undefined,
        colour: d.colour || undefined,
      });
    }
    setDraft(null);
    afterWrite(d.id ? 'Value updated.' : 'Value created.');
  }, [selectedKey, afterWrite]);

  const deactivate = useCallback(async (v: ReferenceValue) => {
    const token = getToken();
    if (!token) return;
    await deactivateReferenceValue(token, v.id);
    afterWrite('Value deactivated.');
  }, [afterWrite]);

  const reactivate = useCallback(async (v: ReferenceValue) => {
    const token = getToken();
    if (!token) return;
    await updateReferenceValue(token, v.id, { isActive: true });
    afterWrite('Value reactivated.');
  }, [afterWrite]);

  const move = useCallback(async (index: number, dir: -1 | 1) => {
    const token = getToken();
    if (!token || !selectedKey) return;
    const ordered = [...values].sort((a, b) => a.sortOrder - b.sortOrder);
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await reorderReferenceValues(token, selectedKey, ordered.map((v) => v.id));
    afterWrite('Order updated.');
  }, [values, selectedKey, afterWrite]);

  const createCategory = useCallback(async (key: string, name: string, description: string) => {
    const token = getToken();
    if (!token) return;
    const created = await createReferenceCategory(token, { key, name, description: description || undefined });
    setNewCatOpen(false);
    loadCategories();
    setSelectedKey(created.key);
    flash('Category created.');
  }, [loadCategories, flash]);

  if (!isAdmin) {
    return (
      <ComingSoon
        title="Reference Data"
        description="Reference data management is available to administrators only."
      />
    );
  }

  // For reorder button enabling, values shown in stored order.
  const orderedForMove = [...values].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <nav className="dq-breadcrumb" aria-label="Breadcrumb">
            <Link href="/administration">Administration</Link>
            <span aria-hidden="true"> / </span>
            <span>Reference Data</span>
          </nav>
          <h1 className="page-title">Reference Data</h1>
          <p className="page-subtitle">{categories.length} categories · database-driven business vocabularies</p>
        </div>
        <button type="button" className="btn btn-ghost dq-refresh" onClick={loadCategories}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && <div className="dash-error">{error}</div>}

      <div className="rd-grid">
        {/* Categories */}
        <aside className="panel rd-cats" aria-label="Categories">
          <div className="rd-cats-head">
            <span className="dqr-note-label">Categories</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewCatOpen(true)}>
              <Plus size={13} aria-hidden="true" /> New
            </button>
          </div>
          {loadingCats ? (
            <div className="dqr-pad"><SkeletonLines lines={6} /></div>
          ) : (
            <ul className="rd-cat-list">
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`rd-cat${c.key === selectedKey ? ' active' : ''}`}
                    onClick={() => setSelectedKey(c.key)}
                  >
                    <span className="rd-cat-name">
                      {c.name}
                      {!c.isActive && <span className="pill dq-status-rejected rd-inactive-tag">Inactive</span>}
                    </span>
                    <span className="rd-cat-meta mono">{c.key} · {c.valueCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Values */}
        <section className="panel rd-values" aria-label="Values">
          {!selectedCategory ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true"><Database size={22} /></div>
              <div className="empty-state-text">Select a category.</div>
            </div>
          ) : (
            <>
              <div className="rd-values-head">
                <div>
                  <div className="rd-values-title">{selectedCategory.name}</div>
                  {selectedCategory.description && (
                    <div className="rd-values-desc">{selectedCategory.description}</div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setDraft({ ...EMPTY_DRAFT })}
                >
                  <Plus size={13} aria-hidden="true" /> Add Value
                </button>
              </div>

              <div className="rd-toolbar">
                <div className="rd-search">
                  <Search size={14} aria-hidden="true" />
                  <input
                    className="fc"
                    placeholder="Search code or name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <label className="rd-active-toggle">
                  <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
                  Active only
                </label>
              </div>

              {loadingVals ? (
                <div className="dqr-pad"><SkeletonLines lines={6} /></div>
              ) : (
                <div className="dq-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Code</th>
                        <th>Display Name</th>
                        <th>Colour</th>
                        <th>Status</th>
                        <th className="dq-col-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleValues.map((v) => {
                        const orderIndex = orderedForMove.findIndex((o) => o.id === v.id);
                        return (
                          <tr key={v.id} className={v.isActive ? '' : 'rd-row-inactive'}>
                            <td>
                              <div className="rd-move">
                                <button type="button" className="wl-icon-btn" title="Move up"
                                  disabled={orderIndex <= 0 || !!search || activeOnly}
                                  onClick={() => move(orderIndex, -1)}>
                                  <ArrowUp size={14} aria-hidden="true" />
                                </button>
                                <button type="button" className="wl-icon-btn" title="Move down"
                                  disabled={orderIndex >= orderedForMove.length - 1 || !!search || activeOnly}
                                  onClick={() => move(orderIndex, 1)}>
                                  <ArrowDown size={14} aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                            <td className="mono">{v.code}{v.isSystem && <span className="rd-sys" title="Seeded system value"> ●</span>}</td>
                            <td>{v.displayName}</td>
                            <td>
                              {v.colour ? (
                                <span className="rd-swatch" style={{ background: v.colour }} title={v.colour} />
                              ) : <span className="dq-muted">—</span>}
                            </td>
                            <td>
                              <span className={`pill ${v.isActive ? 'dq-status-resolved' : 'dq-status-rejected'}`}>
                                {v.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="dq-col-actions">
                              <div className="dq-row-actions">
                                <button type="button" className="btn btn-ghost btn-sm"
                                  onClick={() => setDraft({
                                    id: v.id, code: v.code, displayName: v.displayName,
                                    description: v.description ?? '', colour: v.colour ?? '', isActive: v.isActive,
                                  })}>
                                  Edit
                                </button>
                                {v.isActive ? (
                                  <button type="button" className="btn btn-danger btn-sm" onClick={() => deactivate(v)}>
                                    Deactivate
                                  </button>
                                ) : (
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => reactivate(v)}>
                                    Reactivate
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {visibleValues.length === 0 && (
                        <tr><td colSpan={6} className="dq-muted rd-empty-row">No matching values.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {(search || activeOnly) && (
                <div className="rd-reorder-note">Clear search &amp; “Active only” to reorder.</div>
              )}
            </>
          )}
        </section>
      </div>

      {draft && (
        <ValueEditor
          draft={draft}
          onClose={() => setDraft(null)}
          onSave={saveValue}
        />
      )}

      {newCatOpen && (
        <CategoryEditor onClose={() => setNewCatOpen(false)} onSave={createCategory} />
      )}

      {toast && <div className="cz-toast" role="status">{toast}</div>}
    </div>
  );
}

// ── Value editor dialog ────────────────────────────────────────────────────────

function ValueEditor({
  draft,
  onClose,
  onSave,
}: {
  draft: ValueDraft;
  onClose: () => void;
  onSave: (d: ValueDraft) => Promise<void>;
}) {
  const [d, setD] = useState<ValueDraft>(draft);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const ref = useDialogA11y(true, () => { if (!saving) onClose(); });
  const isNew = d.id === null;

  const canSave = d.displayName.trim() && (!isNew || d.code.trim()) && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    setErr('');
    try {
      await onSave(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to save value.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => { if (!saving) onClose(); }}>
      <div className="modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="rd-value-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="rd-value-title" className="modal-title">{isNew ? 'Add Value' : 'Edit Value'}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={saving}>×</button>
        </div>
        <div className="modal-body">
          {err && <div className="error-box">{err}</div>}
          <div className="fg">
            <label className="fl" htmlFor="rd-code">Code *</label>
            <input id="rd-code" className="fc" value={d.code} disabled={!isNew || saving}
              placeholder="e.g. URGENT" onChange={(e) => setD({ ...d, code: e.target.value })} />
            {!isNew && <div className="rd-hint">Code is immutable — it may be stored on existing records.</div>}
          </div>
          <div className="fg">
            <label className="fl" htmlFor="rd-name">Display Name *</label>
            <input id="rd-name" className="fc" value={d.displayName} disabled={saving}
              onChange={(e) => setD({ ...d, displayName: e.target.value })} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="rd-desc">Description</label>
            <input id="rd-desc" className="fc" value={d.description} disabled={saving}
              onChange={(e) => setD({ ...d, description: e.target.value })} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="rd-colour">Colour</label>
            <div className="rd-colour-row">
              <input id="rd-colour" className="fc" placeholder="#2563eb" value={d.colour} disabled={saving}
                onChange={(e) => setD({ ...d, colour: e.target.value })} />
              {d.colour && <span className="rd-swatch" style={{ background: d.colour }} />}
            </div>
          </div>
          {!isNew && (
            <label className="rd-active-toggle">
              <input type="checkbox" checked={d.isActive} disabled={saving}
                onChange={(e) => setD({ ...d, isActive: e.target.checked })} />
              Active
            </label>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Category editor dialog ─────────────────────────────────────────────────────

function CategoryEditor({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (key: string, name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const ref = useDialogA11y(true, () => { if (!saving) onClose(); });

  // Auto-derive a key slug from the name unless the admin typed one.
  const [keyTouched, setKeyTouched] = useState(false);
  const effectiveKey = keyTouched ? key : name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

  async function submit() {
    if (!name.trim() || !effectiveKey || saving) return;
    setSaving(true);
    setErr('');
    try {
      await onSave(effectiveKey, name.trim(), description);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to create category.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => { if (!saving) onClose(); }}>
      <div className="modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="rd-cat-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="rd-cat-title" className="modal-title">New Category</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={saving}>×</button>
        </div>
        <div className="modal-body">
          {err && <div className="error-box">{err}</div>}
          <div className="fg">
            <label className="fl" htmlFor="rd-cat-name">Name *</label>
            <input id="rd-cat-name" className="fc" value={name} disabled={saving}
              onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="rd-cat-key">Key *</label>
            <input id="rd-cat-key" className="fc mono" value={effectiveKey} disabled={saving}
              onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }} />
            <div className="rd-hint">Lowercase identifier used by the API (e.g. <code>referral_status</code>).</div>
          </div>
          <div className="fg">
            <label className="fl" htmlFor="rd-cat-desc">Description</label>
            <input id="rd-cat-desc" className="fc" value={description} disabled={saving}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!name.trim() || !effectiveKey || saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
