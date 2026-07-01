'use client';

import type { CSSProperties, ReactNode } from 'react';

export interface PanelContentProps {
  children: ReactNode;
  /** When true (default) applies `--panel-pad`; false for tables/edge-to-edge. */
  padded?: boolean;
  /** Optional region label; when provided the scroll area becomes `role="region"`. */
  'aria-label'?: string;
  /**
   * Set to `0` to make the scroll container keyboard-focusable when it has no
   * focusable children (so keyboard users can scroll it). Contract C.6.
   */
  tabIndex?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The panel's scroll region — the ONLY place scrolling happens inside a panel.
 * `flex:1; min-height:0; overflow:auto` with a thin token-styled scrollbar. Vertical
 * scroll is always allowed; horizontal appears only when a child (e.g. a wide table)
 * requires it.
 *
 * Dormant infrastructure: no page consumes this yet.
 */
export default function PanelContent({
  children,
  padded = true,
  'aria-label': ariaLabel,
  tabIndex,
  className,
  style,
}: PanelContentProps) {
  const cls = [
    'panel-content',
    padded ? 'panel-content--padded' : 'panel-content--flush',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      style={style}
    >
      {children}
    </div>
  );
}
