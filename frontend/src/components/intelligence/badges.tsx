'use client';

/**
 * Reusable AI badges (spec §5.2). Small, dependency-light, and styled with the
 * `ai-badge` classes in globals.css. Both always show a numeric value AND a
 * label so a bare score is never rendered without context.
 */

import type { FollowupBand, RiskBand } from '@/lib/ai';

/** Band → visual severity class (shared with the risk gauge). */
function riskTone(level: RiskBand): string {
  if (level === 'Critical' || level === 'High') return 'severe';
  if (level === 'Medium') return 'moderate';
  return 'low';
}

function followupTone(band: FollowupBand): string {
  if (band === 'High') return 'severe';
  if (band === 'Medium') return 'moderate';
  return 'low';
}

export function RiskScoreBadge({
  score,
  level,
  title,
}: {
  score: number;
  level: RiskBand;
  title?: string;
}) {
  return (
    <span
      className={`ai-badge ai-badge--${riskTone(level)}`}
      title={title ?? `AI risk ${score}/100 — ${level}`}
    >
      <span className="ai-badge-num">{score}</span>
      <span className="ai-badge-label">{level} risk</span>
    </span>
  );
}

export function DefaultProbBadge({
  probability,
  band,
  title,
}: {
  probability: number;
  band: FollowupBand;
  title?: string;
}) {
  return (
    <span
      className={`ai-badge ai-badge--${followupTone(band)}`}
      title={title ?? `${probability}% likely to miss next follow-up — ${band}`}
    >
      <span className="ai-badge-num">{probability}%</span>
      <span className="ai-badge-label">default</span>
    </span>
  );
}
