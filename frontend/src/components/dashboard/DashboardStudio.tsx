'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDashboardLayout,
  saveDashboardLayout,
  type AdminDashboardSummary,
  type WorklistItem,
} from '@/lib/api';
import type { ReportDuplicateTarget } from '@/components/dataquality/ReportDuplicateDialog';
import { KNOWN_ROLES, type ColSpan, type StudioLayoutItem } from './dashboard.types';
import WIDGET_REGISTRY, {
  getDefaultLayout,
  normaliseLayout,
  type WidgetRenderProps,
} from './registry';
import WidgetFrame from './WidgetFrame';
import WidgetLibrary from './WidgetLibrary';
import { Pencil } from 'lucide-react';

interface Props {
  token: string;
  role: string;
  isAdmin: boolean;
  data: AdminDashboardSummary | null;
  worklistItems: WorklistItem[];
  onLoad: () => void;
  onFlash: (msg: string) => void;
  onConsult: (activityId: string) => void;
  onDuplicate: (target: ReportDuplicateTarget) => void;
}

/**
 * Dashboard Studio — plugin-based layout manager backed by PostgreSQL.
 *
 * This component knows nothing about specific widgets. Every widget lives in
 * registry.tsx; this component renders them via WIDGET_REGISTRY[id].render().
 *
 * View mode : fetches the role's saved layout from the DB and renders widgets
 *             in a 3-column CSS Grid. Only visible widgets are shown.
 *
 * Edit mode (admin only):
 *   • Role selector — edit any role's layout independently.
 *   • Drag-to-reorder (HTML5 DnD, ref-based to prevent mid-drag re-render).
 *   • ColSpan picker per widget (1 / 2 / 3 columns).
 *   • Visibility toggle — hide without removing.
 *   • Remove — permanently removes from this role's layout (re-addable via Library).
 *   • + Add Widget — opens the Widget Library slide-over.
 *   • Reset to Default — restores the registry-defined default for the current role.
 *   • Save Layout — persists to DB; restores previous state on failure.
 *   • Cancel — discards all unsaved changes.
 *
 * No widget IDs are hardcoded in this file. No switch statements exist.
 */
export default function DashboardStudio({
  token,
  role,
  isAdmin,
  data,
  worklistItems,
  onLoad,
  onFlash,
  onConsult,
  onDuplicate,
}: Props) {
  // ── Layout state ──────────────────────────────────────────────────────────

  const [viewLayout, setViewLayout]   = useState<StudioLayoutItem[] | null>(null);
  const [layoutError, setLayoutError] = useState('');

  // ── Edit mode state ───────────────────────────────────────────────────────

  const [editing,      setEditing]     = useState(false);
  const [editLayout,   setEditLayout]  = useState<StudioLayoutItem[]>([]);
  const [editingRole,  setEditingRole] = useState<string>(role);
  const [loadingEdit,  setLoadingEdit] = useState(false);
  const [saving,       setSaving]      = useState(false);
  const [showLibrary,  setShowLibrary] = useState(false);

  // Snapshot of the layout before entering edit mode, used for Cancel and for
  // rolling back on a failed Save.
  const cancelSnapshot = useRef<StudioLayoutItem[]>([]);

  // ── Drag state ────────────────────────────────────────────────────────────

  // draggingIdRef is the authoritative drag source. It is a ref so handleDrop
  // always reads the current id synchronously — no stale closure risk —
  // and so that storing the id doesn't trigger a re-render that would mutate
  // the dragged DOM element mid-drag (which cancels the drag in all browsers).
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDragging] = useState<string | null>(null);
  const [dragOverId, setDragOver] = useState<string | null>(null);

  // ── Initial layout load ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    fetchDashboardLayout(token)
      .then((res) => {
        if (!cancelled) {
          const layout =
            res.layout.length > 0
              ? normaliseLayout(res.layout)
              : getDefaultLayout(role);
          setViewLayout(layout);
        }
      })
      .catch(() => {
        if (!cancelled) setLayoutError('Unable to load dashboard layout.');
      });
    return () => { cancelled = true; };
  }, [token, role]);

  // ── Edit mode lifecycle ───────────────────────────────────────────────────

  function enterEdit() {
    const draft = (viewLayout ?? []).map((i) => ({ ...i }));
    cancelSnapshot.current = draft;
    setEditLayout(draft);
    setEditingRole(role);
    setEditing(true);
  }

  function cancelEdit() {
    setEditLayout(cancelSnapshot.current);
    setEditing(false);
    setShowLibrary(false);
    draggingIdRef.current = null;
    setDragging(null);
    setDragOver(null);
  }

  async function saveEdit() {
    if (saving) return;
    const layoutToSave = editLayout;
    const rollback = cancelSnapshot.current;
    setSaving(true);
    try {
      await saveDashboardLayout(token, editingRole, layoutToSave);
      if (editingRole === role) {
        setViewLayout(layoutToSave);
      }
      onFlash(`Layout saved for role: ${editingRole}.`);
      setEditing(false);
      setShowLibrary(false);
      draggingIdRef.current = null;
      setDragging(null);
      setDragOver(null);
    } catch {
      // Save failed. Restore the pre-edit snapshot so the dashboard always
      // reflects the last successfully persisted state, never an unsaved one.
      if (editingRole === role) {
        setViewLayout(rollback);
      }
      onFlash(
        'Failed to save layout. Your dashboard has been restored to the last saved state.',
      );
      setEditing(false);
      setShowLibrary(false);
      draggingIdRef.current = null;
      setDragging(null);
      setDragOver(null);
    } finally {
      setSaving(false);
    }
  }

  // When the admin switches the role selector, fetch that role's saved layout.
  async function handleRoleChange(newRole: string) {
    setEditingRole(newRole);
    setLoadingEdit(true);
    try {
      const res = await fetchDashboardLayout(token, newRole);
      const layout =
        res.layout.length > 0
          ? normaliseLayout(res.layout)
          : getDefaultLayout(newRole);
      setEditLayout(layout);
      cancelSnapshot.current = layout.map((i) => ({ ...i }));
    } catch {
      onFlash(`Could not load layout for role "${newRole}".`);
    } finally {
      setLoadingEdit(false);
    }
  }

  function resetToDefault() {
    setEditLayout(getDefaultLayout(editingRole));
  }

  // ── Layout mutations ──────────────────────────────────────────────────────

  const toggleCollapse = useCallback(
    (widgetId: string) => {
      const update = (prev: StudioLayoutItem[]) =>
        prev.map((item) =>
          item.widgetId === widgetId
            ? { ...item, collapsed: !item.collapsed }
            : item,
        );
      if (editing) {
        setEditLayout(update);
      } else {
        setViewLayout((prev) => (prev ? update(prev) : prev));
      }
    },
    [editing],
  );

  const toggleVisible = useCallback((widgetId: string) => {
    setEditLayout((prev) =>
      prev.map((item) =>
        item.widgetId === widgetId
          ? { ...item, visible: !item.visible }
          : item,
      ),
    );
  }, []);

  const removeWidget = useCallback((widgetId: string) => {
    setEditLayout((prev) => prev.filter((item) => item.widgetId !== widgetId));
  }, []);

  const setColSpan = useCallback((widgetId: string, colSpan: ColSpan) => {
    setEditLayout((prev) =>
      prev.map((item) =>
        item.widgetId === widgetId ? { ...item, colSpan } : item,
      ),
    );
  }, []);

  const addWidget = useCallback((widgetId: string) => {
    const def = WIDGET_REGISTRY[widgetId];
    if (!def) return;
    setEditLayout((prev) => [
      ...prev,
      {
        widgetId,
        colSpan: def.defaultColSpan,
        visible: true,
        collapsed: false,
      },
    ]);
  }, []);

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    // Required by Firefox — without setData, Firefox silently cancels the drag.
    e.dataTransfer.setData('text/plain', id);
    draggingIdRef.current = id;
    // Delay the state update by one macro-task so the browser captures the
    // drag ghost from the current DOM before React mutates it (adding the
    // dragging class). Without this, all browsers cancel the drag operation.
    setTimeout(() => setDragging(id), 0);
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, id: string) => {
    setDragOver(id);
  }, []);

  const handleDrop = useCallback((_e: React.DragEvent, targetId: string) => {
    // Read from ref — always current, not subject to stale closure on the state.
    const fromId = draggingIdRef.current;
    if (!fromId || fromId === targetId) return;
    setEditLayout((prev) => {
      const items = [...prev];
      const fromIdx = items.findIndex((i) => i.widgetId === fromId);
      const toIdx   = items.findIndex((i) => i.widgetId === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, moved);
      return items;
    });
  }, []); // stable — reads ref, no state deps

  const handleDragEnd = useCallback(() => {
    draggingIdRef.current = null;
    setDragging(null);
    setDragOver(null);
  }, []);

  // ── Loading / error guards ────────────────────────────────────────────────

  if (viewLayout === null && !layoutError) {
    return <div className="dash-loading">Loading layout&hellip;</div>;
  }

  if (layoutError) {
    return <div className="dash-error">{layoutError}</div>;
  }

  // ── Render prep ───────────────────────────────────────────────────────────

  const displayLayout = editing ? editLayout : viewLayout!;
  // In view mode, hidden widgets are not rendered at all.
  // In edit mode, hidden widgets render as dimmed ghosts (managed by WidgetFrame).
  const renderItems = editing
    ? displayLayout
    : displayLayout.filter((item) => item.visible);

  // Shared context passed to every widget's render function.
  const widgetProps: WidgetRenderProps = {
    data,
    worklistItems,
    onLoad,
    onFlash,
    onConsult,
    onDuplicate,
  };

  return (
    <div className="studio">

      {/* ── Toolbar (admin only) ── */}
      {isAdmin && (
        editing ? (
          <div className="studio-toolbar">
            <span className="studio-toolbar-label"><Pencil size={13} aria-hidden="true" /> Editing layout for:</span>

            <select
              className="studio-role-select"
              value={editingRole}
              disabled={loadingEdit || saving}
              onChange={(e) => void handleRoleChange(e.target.value)}
              aria-label="Select role to edit"
            >
              {KNOWN_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            {loadingEdit && (
              <span className="studio-loading">loading&hellip;</span>
            )}

            <button
              type="button"
              className="studio-btn"
              onClick={() => setShowLibrary(true)}
            >
              + Add Widget
            </button>

            <button
              type="button"
              className="studio-btn"
              onClick={resetToDefault}
              disabled={loadingEdit || saving}
              title="Reset this role's layout to the built-in defaults"
            >
              Reset to Default
            </button>

            <button
              type="button"
              className="studio-btn"
              disabled={saving || loadingEdit}
              onClick={cancelEdit}
            >
              Cancel
            </button>

            <button
              type="button"
              className="studio-btn studio-btn--primary"
              disabled={saving || loadingEdit}
              onClick={() => void saveEdit()}
            >
              {saving ? 'Saving…' : 'Save Layout'}
            </button>
          </div>
        ) : (
          <div className="studio-toolbar-view">
            <button
              type="button"
              className="studio-btn"
              onClick={enterEdit}
            >
              <Pencil size={13} aria-hidden="true" /> Edit Dashboard
            </button>
          </div>
        )
      )}

      {/* ── Widget grid (3-column CSS Grid) ── */}
      <div className="studio-grid">
        {renderItems.map((item) => {
          const def = WIDGET_REGISTRY[item.widgetId];
          return (
            <WidgetFrame
              key={item.widgetId}
              item={item}
              def={def}
              editing={editing}
              isDragging={draggingId === item.widgetId}
              isDragOver={dragOverId === item.widgetId}
              onToggleCollapse={() => toggleCollapse(item.widgetId)}
              onToggleVisible={() => toggleVisible(item.widgetId)}
              onRemove={() => removeWidget(item.widgetId)}
              onSetColSpan={(cs) => setColSpan(item.widgetId, cs)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            >
              {def?.render(widgetProps)}
            </WidgetFrame>
          );
        })}
      </div>

      {/* ── Widget Library slide-over (edit mode only) ── */}
      {showLibrary && (
        <WidgetLibrary
          currentRole={editingRole}
          presentIds={editLayout.map((i) => i.widgetId)}
          onAdd={addWidget}
          onClose={() => setShowLibrary(false)}
        />
      )}

    </div>
  );
}
