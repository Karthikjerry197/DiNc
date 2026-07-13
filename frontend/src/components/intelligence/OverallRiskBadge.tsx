'use client';

import type { ReactNode } from 'react';
import { CircleCheck, CircleAlert, TriangleAlert, Clock } from 'lucide-react';
import type { OverallRiskLevel, OverallRiskResolution } from '@/lib/api';

/**
 * The canonical Overall Risk badge — the PRIMARY patient risk indicator across
 * lists, workspaces and the intelligence panel. Each level has BOTH a colour
 * (preserved from the existing scheme) AND a distinct icon, so risk is legible
 * without relying on colour alone. A null resolution renders a neutral clinical
 * "Pending Assessment" state — never an error.
 */

const ICON: Record<OverallRiskLevel, ReactNode> = {
  LOW: <CircleCheck aria-hidden="true" />,
  MODERATE: <CircleAlert aria-hidden="true" />,
  HIGH: <TriangleAlert aria-hidden="true" />,
};

interface Props {
  /** The resolved Overall Risk, or null for "not yet calculated". */
  resolution: OverallRiskResolution | null;
  /** Compact list chip ('sm', default) or a larger workspace chip ('md'). */
  size?: 'sm' | 'md';
  /** Show the text label beside the icon (default true). */
  showText?: boolean;
}

export default function OverallRiskBadge({ resolution, size = 'sm', showText = true }: Props) {
  if (!resolution) {
    return (
      <span
        className={`ovr-badge ovr-badge--${size} ovr-badge--pending`}
        title="Overall risk has not been calculated yet for this patient."
      >
        <Clock aria-hidden="true" />
        {showText && <span className="ovr-badge-text">Pending Assessment</span>}
      </span>
    );
  }
  const level = resolution.overallRisk;
  return (
    <span
      className={`ovr-badge ovr-badge--${size} ovr-badge--${level.toLowerCase()}`}
      title={resolution.explanation}
    >
      {ICON[level]}
      {showText && <span className="ovr-badge-text">{level}</span>}
    </span>
  );
}
