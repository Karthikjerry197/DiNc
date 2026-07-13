'use client';

import ReferenceBadge from './ReferenceBadge';
import type { ReferenceOption } from '@/lib/useReferenceData';

interface ReferenceChipProps {
  category: string;
  code: string | null | undefined;
  fallback?: ReferenceOption[];
  className?: string;
}

/**
 * Outlined-pill variant of {@link ReferenceBadge}. Thin wrapper — one shared
 * implementation, no duplicated rendering logic.
 */
export default function ReferenceChip({ category, code, fallback, className }: ReferenceChipProps) {
  return (
    <ReferenceBadge category={category} code={code} fallback={fallback} variant="chip" className={className} />
  );
}
