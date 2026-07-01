'use client';

import type { CSSProperties, ReactNode } from 'react';

export interface PanelHeaderProps {
  title: ReactNode;
  /** e.g. "Next 8 pending activities · Guide + Call". */
  subtitle?: ReactNode;
  /** Panel-level actions (buttons, density toggle); right-aligned. */
  actions?: ReactNode;
  /** Heading tag by nesting depth: `2` for a top-level panel, `3` when nested. */
  headingLevel?: 2 | 3;
  className?: string;
  style?: CSSProperties;
}

/**
 * Panel title + optional subtitle + panel-level actions. Sticks to the top of the
 * panel (`position:sticky; top:0`) with a raised z-index so it stays pinned while
 * the sibling `PanelContent` scrolls beneath it. Never scrolls; `flex-shrink:0`.
 *
 * Accessibility: the title renders an `<h2>`/`<h3>` (per `headingLevel`); actions
 * are real `<button>`s supplied by the consumer.
 *
 * Dormant infrastructure: no page consumes this yet.
 */
export default function PanelHeader({
  title,
  subtitle,
  actions,
  headingLevel = 2,
  className,
  style,
}: PanelHeaderProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const cls = ['panel-header', className].filter(Boolean).join(' ');

  return (
    <div className={cls} style={style}>
      <div className="panel-header-text">
        <Heading className="panel-header-title">{title}</Heading>
        {subtitle && <div className="panel-header-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="panel-header-actions">{actions}</div>}
    </div>
  );
}
