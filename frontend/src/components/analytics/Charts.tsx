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

/** Shared fallback shown when a chart has nothing to plot. */
const EMPTY_TEXT = 'No data recorded yet for this view.';

/** Horizontal bar chart — good for category breakdowns (responsive width). */
export function BarChart({ data, color = '#24a148', emptyText = EMPTY_TEXT }: { data: ChartDatum[]; color?: string; emptyText?: string }) {
  if (data.length === 0) return <div className="an-chart-empty">{emptyText}</div>;
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
export function PieChart({ data, emptyText = EMPTY_TEXT }: { data: ChartDatum[]; emptyText?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="an-chart-empty">{emptyText}</div>;
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

export interface LineSeries {
  name: string;
  color: string;
  data: ChartDatum[]; // all series share the same labels (x positions)
}

/**
 * Multi-series SVG line chart — good for time trends (e.g. 30-day risk).
 * Same dependency-free, print-friendly approach as the other charts.
 */
export function LineChart({ series, height = 170, emptyText = EMPTY_TEXT }: { series: LineSeries[]; height?: number; emptyText?: string }) {
  const n = series[0]?.data.length ?? 0;
  if (n === 0) return <div className="an-chart-empty">{emptyText}</div>;
  const W = 600;
  const PAD = { top: 10, right: 12, bottom: 22, left: 34 };
  const iw = W - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;
  const max = Math.max(1, ...series.flatMap((s) => s.data.map((d) => d.value)));
  const x = (i: number) => PAD.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, Math.ceil(max / 2), max];
  // Sparse x labels: first, middle, last — enough for a 30-day axis.
  const xLabelIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : Array.from({ length: n }, (_, i) => i);
  return (
    <div className="an-line-wrap">
      <svg viewBox={`0 0 ${W} ${height}`} className="an-line" role="img" aria-label="Trend chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#6b7280">
              {t.toLocaleString()}
            </text>
          </g>
        ))}
        {xLabelIdx.map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="#6b7280">
            {series[0].data[i].label}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')}
            />
            {s.data.map((d, i) =>
              d.value > 0 ? <circle key={i} cx={x(i)} cy={y(d.value)} r="2.5" fill={s.color} /> : null,
            )}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <ul className="an-legend an-legend-inline">
          {series.map((s) => (
            <li key={s.name}>
              <span className="an-legend-dot" style={{ background: s.color }} />
              <span className="an-legend-label">{s.name}</span>
            </li>
          ))}
        </ul>
      )}
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
