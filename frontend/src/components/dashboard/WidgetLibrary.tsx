'use client';

import { useMemo } from 'react';
import WIDGET_REGISTRY from './registry';
import { WIDGET_CATEGORIES, type WidgetCategory } from './dashboard.types';

interface Props {
  /** The role currently being edited — used to filter by def.permissions. */
  currentRole: string;
  /** widgetIds already present in the current layout (visible or hidden). */
  presentIds: string[];
  onAdd: (widgetId: string) => void;
  onClose: () => void;
}

/**
 * Widget Library — slide-over panel listing every registered widget grouped
 * by category. Clicking a widget adds it to the current layout.
 *
 * Filtering:
 *   • def.permissions (if set) restricts which roles can see and add the widget.
 *   • Widgets already on the dashboard are shown as disabled ("Added").
 *
 * This panel is the only place in Dashboard Studio where widget IDs appear —
 * they come entirely from WIDGET_REGISTRY, not from any hardcoded list.
 */
export default function WidgetLibrary({
  currentRole,
  presentIds,
  onAdd,
  onClose,
}: Props) {
  const byCategory = useMemo(() => {
    const map: Partial<Record<WidgetCategory, typeof WIDGET_REGISTRY[string][]>> = {};
    for (const def of Object.values(WIDGET_REGISTRY)) {
      // Permissions filter: if permissions is set, only listed roles can see it.
      if (def.permissions && !def.permissions.includes(currentRole)) continue;
      if (!map[def.category]) map[def.category] = [];
      map[def.category]!.push(def);
    }
    return map;
  }, [currentRole]);

  return (
    <div className="wl-backdrop" onClick={onClose}>
      <aside className="wl-panel" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="wl-head">
          <span className="wl-title">Widget Library</span>
          <button
            type="button"
            className="wl-close"
            onClick={onClose}
            aria-label="Close widget library"
          >
            ✕
          </button>
        </div>
        <p className="wl-sub">Click a widget to add it to your dashboard.</p>

        {/* ── Categories ── */}
        <div className="wl-body">
          {WIDGET_CATEGORIES.map((cat) => {
            const widgets = byCategory[cat];
            if (!widgets?.length) return null;
            return (
              <div key={cat} className="wl-group">
                <div className="wl-group-label">{cat}</div>
                <div className="wl-group-items">
                  {widgets.map((def) => {
                    const alreadyPresent = presentIds.includes(def.id);
                    return (
                      <button
                        key={def.id}
                        type="button"
                        className={`wl-item${alreadyPresent ? ' wl-item--added' : ''}`}
                        disabled={alreadyPresent}
                        onClick={() => { if (!alreadyPresent) { onAdd(def.id); onClose(); } }}
                        title={def.description}
                      >
                        {def.icon && (
                          <span className="wl-item-icon" aria-hidden="true">{def.icon}</span>
                        )}
                        <span className="wl-item-label">{def.label}</span>
                        <span className="wl-item-desc">{def.description}</span>
                        {alreadyPresent && (
                          <span className="wl-item-badge">Added</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

      </aside>
    </div>
  );
}
