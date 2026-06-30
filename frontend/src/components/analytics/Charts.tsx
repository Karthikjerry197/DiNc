'use client';

/**
 * Lightweight, dependency-free SVG charts for the analytics dashboard. Kept
 * intentionally simple (no animation, no chart library) for fast, consistent,
 * print-friendly healthcare reporting.
 */

const PALETTE = ['#24a148', '#0284c7', '#7c3aed', '#db2777', '#d97706', '#0891b2', '#dc2626', '#15803d'];

export interface ChartDatum {
  label: string;
  value: number;
}

/** Horizontal bar chart — good for category breakdowns (responsive width). */
export function BarChart({ data, color = '#24a148' }: { data: ChartDatum[]; color?: string }) {
  if (data.length === 0) return <div className="an-chart-empty">No data.</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="an-bars">
      {data.map((d) => (
        <div key={d.label} className="an-bar-row">
          <span className="an-bar-label" title={d.label}>{d.label}</span>
          <span className="an-bar-track">
            <span className="an-bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </span>
          <span className="an-bar-value">{d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/** Donut/pie chart with legend — good for distribution (e.g. outcome categories). */
export function PieChart({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="an-chart-empty">No data.</div>;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segments = data.map((d, i) => {
    const frac = d.value / total;
    const seg = { color: PALETTE[i % PALETTE.length], dash: frac * c, offset: offset * c, label: d.label, value: d.value, pct: Math.round(frac * 100) };
    offset += frac;
    return seg;
  });
  return (
    <div className="an-pie-wrap">
      <svg viewBox="0 0 140 140" className="an-pie" role="img" aria-label="Distribution chart">
        <g transform="translate(70,70) rotate(-90)">
          {segments.map((s) => (
            <circle key={s.label} r={r} cx="0" cy="0" fill="none" stroke={s.color} strokeWidth="22"
              strokeDasharray={`${s.dash} ${c - s.dash}`} strokeDashoffset={-s.offset} />
          ))}
        </g>
      </svg>
      <ul className="an-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="an-legend-dot" style={{ background: s.color }} />
            <span className="an-legend-label">{s.label}</span>
            <span className="an-legend-value">{s.value} ({s.pct}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A labelled progress bar (e.g. completion %). */
export function ProgressBar({ value, color = '#24a148' }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="an-progress" title={`${v}%`}>
      <span className="an-progress-fill" style={{ width: `${v}%`, background: color }} />
    </span>
  );
}
