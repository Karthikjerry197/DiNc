'use client';

import type { CSSProperties, ReactNode } from 'react';

export interface WorkspaceProps {
  /** Exactly one WorkspaceHeader + one WorkspaceGrid (+ optional StickyActionBar). */
  children: ReactNode;
  /** Density scale applied via `data-density`; switches `--row-h-*` / panel padding. */
  density?: 'comfortable' | 'compact' | 'dense';
  /** When true (default) applies `--ws-pad`; false = edge-to-edge. */
  padded?: boolean;
  /** Optional region label; when provided the root becomes `role="region"`. */
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The fixed, viewport-filling root of a migrated page. Replaces every bespoke page
 * shell and all `calc(100vh - Npx)` math: height flows from the shell via flexbox.
 * It is the only child a migrated page returns and it never scrolls — scrolling
 * happens exclusively inside a `PanelContent`.
 *
 * The shell already owns `<main>`, so this renders a neutral `<div>` (or a labelled
 * `role="region"` when `aria-label` is supplied). Requires its parent
 * (`.shell-content--workspace`) to be a height/flex context — see Part D.
 *
 * Dormant infrastructure: no page consumes this yet.
 */
export default function Workspace({
  children,
  density = 'compact',
  padded = true,
  'aria-label': ariaLabel,
  className,
  style,
}: WorkspaceProps) {
  const cls = ['ws', padded ? 'ws--padded' : 'ws--flush', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      data-density={density}
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
      style={style}
    >
      {children}
    </div>
  );
}
