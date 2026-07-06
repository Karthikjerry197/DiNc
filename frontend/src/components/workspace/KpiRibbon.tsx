'use client';

import type { CSSProperties, ReactNode } from 'react';

export interface KpiItem {
  id: string;
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  /** Optional sub-value line, e.g. "920 total" / "9 overdue". */
  hint?: ReactNode;
  tone?: 'default' | 'danger' | 'warn' | 'success';
  onClick?: () => void;
}

export interface KpiRibbonProps {
  items: KpiItem[];
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The Dashboard's system-health ribbon: one fixed band of compact metric cards
 * (`icon · value · label · optional hint`). Cards flex to divide the available
 * width — the ribbon **never scrolls horizontally**; when space is tight the
 * cards condense rather than overflow (M27 Dashboard decision, refining contract
 * C.9 to a fit/no-scroll ribbon). Height is `--kpi-h`; the ribbon itself never
 * scrolls and is `flex-shrink:0`.
 *
 * Built for the Dashboard first; it is the canonical KPI ribbon other pages
 * will inherit.
 */
export default function KpiRibbon({
  items,
  'aria-label': ariaLabel,
  className,
  style,
}: KpiRibbonProps) {
  const cls = ['kpi-ribbon', className].filter(Boolean).join(' ');

  return (
    <div className={cls} role="list" aria-label={ariaLabel} style={style}>
      {items.map((it) => {
        const toneCls = `kpi-card kpi-card--${it.tone ?? 'default'}`;
        const body = (
          <>
            {it.icon && (
              <span className="kpi-icon" aria-hidden="true">
                {it.icon}
              </span>
            )}
            <span className="kpi-text">
              <span className="kpi-value">{it.value}</span>
              <span className="kpi-label">{it.label}</span>
              {it.hint != null && <span className="kpi-hint">{it.hint}</span>}
            </span>
          </>
        );

        return it.onClick ? (
          <button
            key={it.id}
            type="button"
            role="listitem"
            className={`${toneCls} kpi-card--btn`}
            onClick={it.onClick}
            aria-label={`${it.label}: ${typeof it.value === 'string' || typeof it.value === 'number' ? it.value : ''}`}
          >
            {body}
          </button>
        ) : (
          <div key={it.id} role="listitem" className={toneCls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
