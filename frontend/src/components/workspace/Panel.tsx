'use client';

import type { CSSProperties, ReactNode } from 'react';

export type PanelVariant = 'default' | 'flush' | 'subtle';

export interface PanelProps {
  /** Typically PanelHeader + PanelContent (+ StickyActionBar). */
  children: ReactNode;
  /** `flush` = no content padding (tables); `subtle` = nested/inspector surface. */
  variant?: PanelVariant;
  /** Region label; makes the `<section>` an accessible landmark when supplied. */
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A self-contained region that owns its own scroll — the unit of layout. The Panel
 * itself NEVER scrolls (`overflow:hidden`); its `PanelContent` child does. Fills its
 * grid cell (`height:100%`) and clips to a rounded card.
 *
 * Accessibility: renders a `<section>`; with `aria-label` it becomes a labelled
 * landmark, otherwise it relies on its PanelHeader's heading for structure.
 *
 * Dormant infrastructure: no page consumes this yet.
 */
export default function Panel({
  children,
  variant = 'default',
  'aria-label': ariaLabel,
  className,
  style,
}: PanelProps) {
  const cls = ['panel', `panel--${variant}`, className].filter(Boolean).join(' ');

  return (
    <section className={cls} aria-label={ariaLabel} style={style}>
      {children}
    </section>
  );
}
