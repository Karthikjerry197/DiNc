/**
 * Lightweight, dependency-free skeleton placeholders (M35C). Static blocks —
 * no animation by design. Shared by every page that loads list/table/card data
 * so loading states look identical application-wide.
 */

/** A stack of placeholder text lines (list panels, detail panes). */
export function SkeletonLines({ lines = 4 }: { lines?: number }) {
  return (
    <div className="skel-group" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skel skel-line"
          style={{ width: `${[92, 70, 84, 58, 76, 64][i % 6]}%` }}
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Placeholder table rows (worklist, users, data-quality, runs). */
export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skel-group" role="status" aria-label="Loading">
      <div className="skel skel-th" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel skel-row" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** A row of placeholder stat cards (KPI ribbons, stat grids). */
export function SkeletonStats({ cards = 4 }: { cards?: number }) {
  return (
    <div className="skel-stats" role="status" aria-label="Loading">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="skel skel-stat" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
