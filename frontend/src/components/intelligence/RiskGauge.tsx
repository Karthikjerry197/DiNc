'use client';

/**
 * Circular 0–100 risk gauge (spec §5.1). Pure SVG — no chart dependency. The
 * arc length and colour reflect the explainable score; the centre shows the
 * number and band. A confidence chip sits beneath.
 */

import type { RiskBand } from '@/lib/ai';

const TONE_COLOR: Record<string, string> = {
  severe: 'var(--risk-severe)',
  moderate: 'var(--risk-moderate)',
  low: 'var(--risk-low)',
};

function tone(level: RiskBand): string {
  if (level === 'Critical' || level === 'High') return 'severe';
  if (level === 'Medium') return 'moderate';
  return 'low';
}

export default function RiskGauge({
  score,
  level,
  confidence,
}: {
  score: number;
  level: RiskBand;
  confidence?: number;
}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * c;
  const color = TONE_COLOR[tone(level)];

  return (
    <div className="ai-gauge">
      <svg viewBox="0 0 120 120" className="ai-gauge-svg" role="img" aria-label={`AI risk score ${score} of 100, ${level}`}>
        <circle cx="60" cy="60" r={r} className="ai-gauge-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="ai-gauge-arc"
          stroke={color}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c / 4}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="56" className="ai-gauge-score">{score}</text>
        <text x="60" y="76" className="ai-gauge-of">/ 100</text>
      </svg>
      <div className="ai-gauge-meta">
        <span className={`ai-gauge-level ai-gauge-level--${tone(level)}`}>{level} risk</span>
        {confidence != null && (
          <span className="ai-conf-chip" title="Confidence reflects data completeness, not model certainty">
            {confidence}% confidence
          </span>
        )}
      </div>
    </div>
  );
}
