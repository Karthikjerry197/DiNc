'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useOverflowFades } from './useOverflowFades';

export type WorkspaceGridTemplate =
  | 'single' // one panel fills
  | 'list-detail' // [--list-col-w | 1fr]
  | 'primary-inspector' // [1fr | --inspector-w]
  | 'list-primary-inspector' // [--list-col-w | 1fr | --inspector-w]
  | 'list-inspector-primary' // [--list-col-w | --inspector-w | 1fr]
  | 'ribbon+primary-inspector'; // row: KpiRibbon; then [1fr | --inspector-w]

export interface WorkspaceGridProps {
  children: ReactNode;
  /** Named layout mapped to grid-template-columns (and rows for ribbon templates). */
  template: WorkspaceGridTemplate;
  /** Gap between panels; default `var(--ws-gap)`. */
  gap?: string;
  className?: string;
  style?: CSSProperties;
}

/** Maps a template name to its namespaced modifier class. */
const TEMPLATE_CLASS: Record<WorkspaceGridTemplate, string> = {
  single: 'wsg--single',
  'list-detail': 'wsg--list-detail',
  'primary-inspector': 'wsg--primary-inspector',
  'list-primary-inspector': 'wsg--list-primary-inspector',
  'list-inspector-primary': 'wsg--list-inspector-primary',
  'ribbon+primary-inspector': 'wsg--ribbon-primary-inspector',
};

/**
 * The fixed grid arranging panels below the WorkspaceHeader. Owns the
 * column/row templates and responsive collapse; replaces all per-page grid CSS.
 * Column widths come from tokens and `1fr` cells get `min-width:0` so their child
 * `PanelContent` can shrink and scroll. Fills the Workspace (`flex:1; min-height:0`)
 * and never scrolls — it is a fixed frame.
 *
 * Dormant infrastructure: no page consumes this yet.
 */
export default function WorkspaceGrid({
  template,
  gap,
  children,
  className,
  style,
}: WorkspaceGridProps) {
  const cls = ['wsg', TEMPLATE_CLASS[template], className].filter(Boolean).join(' ');
  const mergedStyle: CSSProperties = { ...(gap ? { gap } : null), ...style };
  const scrollRef = useOverflowFades<HTMLDivElement>();

  // The host is a non-scrolling positioning context that carries the edge
  // fades; the grid itself remains the horizontal scroll container.
  return (
    <div className="wsg-host">
      <div className={cls} style={mergedStyle} ref={scrollRef}>
        {children}
      </div>
    </div>
  );
}
