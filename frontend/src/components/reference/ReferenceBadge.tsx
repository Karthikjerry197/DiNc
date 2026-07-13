'use client';

import { useReferenceData, type ReferenceOption } from '@/lib/useReferenceData';

interface ReferenceBadgeProps {
  category: string;
  /** The stored code to render (e.g. 'SEVERE'). */
  code: string | null | undefined;
  fallback?: ReferenceOption[];
  /** Render as a chip (outlined pill) instead of a solid-tinted badge. */
  variant?: 'badge' | 'chip';
  className?: string;
}

/** Converts '#rrggbb' to an rgba() with the given alpha, for soft badge fills. */
function tint(hex: string | null | undefined, alpha: number): string | undefined {
  if (!hex || !/^#([0-9a-f]{6})$/i.test(hex)) return undefined;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Renders a reference value as a coloured badge/chip using the display name and
 * colour configured in PostgreSQL. Shared by every module so status/priority/risk
 * pills look consistent and are configurable without code changes.
 */
export default function ReferenceBadge({
  category,
  code,
  fallback,
  variant = 'badge',
  className = '',
}: ReferenceBadgeProps) {
  const { values } = useReferenceData(category, fallback);
  if (!code) return <span className={`ref-badge ${className}`}>—</span>;

  const match = values.find((v) => v.code === code);
  const label = match?.displayName ?? code;
  const colour = match?.colour ?? null;

  const style =
    variant === 'chip'
      ? { color: colour ?? undefined, borderColor: colour ?? undefined }
      : { color: colour ?? undefined, background: tint(colour, 0.12) };

  return (
    <span className={`ref-${variant} ${className}`} style={style} title={label}>
      {label}
    </span>
  );
}
