'use client';

import type { CSSProperties } from 'react';
import type { AdminDashboardSummary } from '@/lib/api';

interface Props {
  programs: AdminDashboardSummary['programs'];
}

/** Fallback dot colour when a programme has no configured colour in the DB. */
const FALLBACK_DOT = '#94a3b8';

/**
 * Programme Summary — a full-width horizontal strip that sits between the KPI
 * ribbon and Today's Worklist, surfacing active follow-ups per programme at a
 * glance.
 *
 * This is a GENERIC renderer: it maps over the API response and knows nothing
 * about any specific programme. Programme names, colours, order and counts are
 * all business configuration resolved in PostgreSQL and delivered by the
 * dashboard API — there are no local arrays, hardcoded names, or disease-specific
 * branches here. Cards flow in a single row and scroll horizontally when they
 * exceed the available width (never wrap), keeping the strip a fixed height.
 *
 * The cards are self-explanatory (colour dot + programme + count), so the strip
 * carries no visible heading — it starts immediately below the KPI ribbon to
 * keep the dashboard dense. The `aria-label` preserves the section's meaning for
 * assistive tech.
 */
export default function ProgrammeSummaryStrip({ programs }: Props) {
  const items = programs ?? [];

  return (
    <section className="prog-strip" aria-label="Programme Summary">
      {items.length === 0 ? (
        <div className="prog-strip-empty">No active programmes.</div>
      ) : (
        <div className="prog-strip-track" role="list">
          {items.map((p) => (
            <article
              key={p.name}
              className="prog-card"
              role="listitem"
              // The programme colour drives both the dot and the count tint via
              // CSS; falls back to a neutral hue when the DB has none configured.
              style={{ '--prog-color': p.color ?? FALLBACK_DOT } as CSSProperties}
            >
              <div className="prog-card-head">
                <span className="prog-card-dot" aria-hidden="true" />
                <span className="prog-card-name" title={p.name}>
                  {p.name}
                </span>
              </div>
              <span className="prog-card-count">
                {p.activeEnrollments.toLocaleString()}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
