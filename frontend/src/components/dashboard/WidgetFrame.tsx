'use client';

import type { WidgetDefinition } from './registry';
import type { ColSpan, StudioLayoutItem } from './dashboard.types';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  item: StudioLayoutItem;
  def: WidgetDefinition | undefined;
  editing: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onToggleCollapse: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
  onSetColSpan: (cs: ColSpan) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver:  (e: React.DragEvent, id: string) => void;
  onDrop:      (e: React.DragEvent, id: string) => void;
  onDragEnd:   () => void;
  children: React.ReactNode;
}

/**
 * Universal widget container for Dashboard Studio.
 *
 * View mode : card with title, collapse button, content.
 * Edit mode : adds drag handle, visibility toggle, colSpan picker, remove button.
 *             Hidden widgets render as a dimmed ghost so the admin can manage
 *             them without opening the Widget Library.
 *
 * This component knows nothing about specific widgets — it receives def as a
 * prop and renders children from DashboardStudio's dynamic dispatch.
 */
export default function WidgetFrame({
  item,
  def,
  editing,
  isDragging,
  isDragOver,
  onToggleCollapse,
  onToggleVisible,
  onRemove,
  onSetColSpan,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  children,
}: Props) {
  const hidden = !item.visible;

  const cls = [
    'sf',
    editing    ? 'sf--editing'   : '',
    isDragging ? 'sf--dragging'  : '',
    isDragOver ? 'sf--drag-over' : '',
    item.collapsed ? 'sf--collapsed' : '',
    hidden && editing  ? 'sf--hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      style={{ gridColumn: `span ${item.colSpan}` }}
      draggable={editing}
      onDragStart={(e) => { if (editing) onDragStart(e, item.widgetId); }}
      onDragOver={(e)  => { e.preventDefault(); if (editing) onDragOver(e, item.widgetId); }}
      onDrop={(e)      => { e.preventDefault(); if (editing) onDrop(e, item.widgetId); }}
      onDragEnd={onDragEnd}
    >
      {/* ── Frame header ── */}
      <div className="sf-head">
        {editing && (
          <span className="sf-drag-handle" aria-hidden="true" title="Drag to reorder">
            ⠿
          </span>
        )}

        {def?.icon && (
          <span className="sf-icon" aria-hidden="true">{def.icon}</span>
        )}

        <span className="sf-title">{def?.label ?? item.widgetId}</span>

        <div className="sf-controls">
          {/* ColSpan picker — edit mode only */}
          {editing && (
            <span className="sf-colspan-picker" title="Widget width">
              {([1, 2, 3] as ColSpan[]).map((cs) => (
                <button
                  key={cs}
                  type="button"
                  className={`sf-cs-btn${item.colSpan === cs ? ' sf-cs-btn--active' : ''}`}
                  onClick={() => onSetColSpan(cs)}
                  aria-label={`${cs} column${cs > 1 ? 's' : ''} wide`}
                >
                  {cs}
                </button>
              ))}
            </span>
          )}

          {/* Visibility toggle — edit mode only */}
          {editing && (
            <button
              type="button"
              className="sf-ctrl-btn"
              title={hidden ? 'Show widget' : 'Hide widget'}
              aria-label={hidden ? 'Show widget' : 'Hide widget'}
              onClick={onToggleVisible}
            >
              {hidden ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
            </button>
          )}

          {/* Collapse / expand — always visible */}
          <button
            type="button"
            className="sf-ctrl-btn"
            title={item.collapsed ? 'Expand' : 'Collapse'}
            aria-label={item.collapsed ? 'Expand widget' : 'Collapse widget'}
            onClick={onToggleCollapse}
          >
            {item.collapsed ? '▸' : '▾'}
          </button>

          {/* Remove — edit mode only */}
          {editing && (
            <button
              type="button"
              className="sf-ctrl-btn sf-ctrl-btn--danger"
              title="Remove from dashboard"
              aria-label="Remove widget from dashboard"
              onClick={onRemove}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Frame body ── */}
      {!item.collapsed && (
        <div className="sf-body">
          {hidden && editing ? (
            <div className="sf-hidden-msg">
              Widget hidden — click <span aria-hidden="true"><Eye size={12} /></span> to show
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
