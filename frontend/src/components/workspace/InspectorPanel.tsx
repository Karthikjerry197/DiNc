'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Panel from './Panel';

export interface InspectorPanelProps {
  /** May contain Tabs + PanelContent(s). Falls back to `emptyState` when nullish. */
  children?: ReactNode;
  /** Fixed panel width; default `var(--inspector-w)`. */
  width?: string;
  /** Whether the collapse/expand affordance is offered; default true. */
  collapsible?: boolean;
  /** Controlled collapsed state; default false. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Shown when no selection drives the inspector (i.e. no children). */
  emptyState?: ReactNode;
  /** Required accessible name (also labels the drawer dialog on small screens). */
  'aria-label': string;
  className?: string;
  style?: CSSProperties;
}

/** Below this width the inspector becomes an overlay drawer (Contract C.7). */
const DRAWER_QUERY = '(max-width: 1023px)';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A specialized right-hand `Panel` (variant `subtle`) for contextual/supporting info
 * adjacent to the primary panel — "adjacent panel, not a separate page". It reuses
 * `Panel` for its frame rather than reimplementing one.
 *
 * States:
 *  - **expanded** (default): fixed-width panel with an optional collapse toggle.
 *  - **collapsed** (desktop): a thin rail with an expand affordance.
 *  - **drawer** (`<1024px`): an overlay `role="dialog"` opened by a toggle the page
 *    places in the primary panel's header. Focus is trapped, Escape closes, and
 *    focus is restored on close.
 *
 * The inner `PanelContent`(s) scroll; the frame never does.
 *
 * Dormant infrastructure: no page consumes this yet.
 */
export default function InspectorPanel({
  children,
  width = 'var(--inspector-w)',
  collapsible = true,
  collapsed = false,
  onCollapsedChange,
  emptyState,
  'aria-label': ariaLabel,
  className,
  style,
}: InspectorPanelProps) {
  const [isDrawer, setIsDrawer] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Track the drawer breakpoint so the panel can switch to an overlay dialog.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(DRAWER_QUERY);
    const update = () => setIsDrawer(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const setCollapsed = useCallback(
    (next: boolean) => onCollapsedChange?.(next),
    [onCollapsedChange],
  );

  const isOpenDrawer = isDrawer && !collapsed;

  // Drawer a11y: focus in on open, trap Tab, Escape to close, restore focus on close.
  useEffect(() => {
    if (!isOpenDrawer) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    const node = drawerRef.current;
    const getFocusable = () =>
      node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    (getFocusable()[0] ?? node)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setCollapsed(true);
        return;
      }
      if (e.key === 'Tab' && node) {
        const items = getFocusable();
        if (items.length === 0) {
          e.preventDefault();
          node.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpenDrawer, setCollapsed]);

  const body = children ?? emptyState;

  // Collapsed rail — desktop only. In drawer mode a collapsed inspector is closed.
  if (collapsible && collapsed && !isDrawer) {
    return (
      <div className={['insp-rail', className].filter(Boolean).join(' ')} style={style}>
        <button
          type="button"
          className="insp-rail-toggle"
          aria-expanded={false}
          aria-label={`Expand ${ariaLabel}`}
          onClick={() => setCollapsed(false)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    );
  }

  // Drawer closed on small screens → nothing (the primary panel owns the opener).
  if (isDrawer && collapsed) return null;

  const panel = (
    <Panel
      variant="subtle"
      aria-label={ariaLabel}
      className={['insp', isOpenDrawer ? 'insp--drawer' : null, className]
        .filter(Boolean)
        .join(' ')}
      style={isDrawer ? style : { width, ...style }}
    >
      {collapsible && (
        <button
          type="button"
          className="insp-collapse"
          aria-expanded={true}
          aria-label={isDrawer ? `Close ${ariaLabel}` : `Collapse ${ariaLabel}`}
          onClick={() => setCollapsed(true)}
        >
          <span aria-hidden="true">{isDrawer ? '✕' : '‹'}</span>
        </button>
      )}
      {body}
    </Panel>
  );

  if (isOpenDrawer) {
    return (
      <div className="insp-drawer-layer">
        <div
          className="insp-drawer-backdrop"
          aria-hidden="true"
          onClick={() => setCollapsed(true)}
        />
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          className="insp-drawer-frame"
        >
          {panel}
        </div>
      </div>
    );
  }

  return panel;
}
