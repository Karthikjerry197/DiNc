'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  resolveOverallRiskBatch,
  type OverallRiskBatchInput,
  type OverallRiskResolution,
} from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * Resolves Overall Risk for a list of citizens in ONE request via the shared
 * `OverallRiskService` (batch endpoint), returning a Map keyed by input id. Used
 * by patient lists (Dashboard, Worklist) so a page never fires N single requests.
 *
 * The hook re-fetches only when the set of (id × severity × follow-up) tuples
 * actually changes — a stable signature key avoids refetching on unrelated
 * re-renders. Ids missing from the result map render as "Pending Assessment".
 */
export function useOverallRiskBatch(
  inputs: OverallRiskBatchInput[],
): Map<string, OverallRiskResolution> {
  const [map, setMap] = useState<Map<string, OverallRiskResolution>>(new Map());

  // Stable signature — refetch only when the tuples themselves change.
  const signature = useMemo(
    () => inputs.map((i) => `${i.id}:${i.clinicalSeverity}:${i.followupRisk}`).sort().join('|'),
    [inputs],
  );

  useEffect(() => {
    const token = getToken();
    if (!token || inputs.length === 0) {
      setMap(new Map());
      return;
    }
    let alive = true;
    resolveOverallRiskBatch(token, inputs)
      .then((results) => {
        if (!alive) return;
        setMap(new Map(results.map((r) => [r.id, r])));
      })
      .catch(() => {
        // Degrade to empty — consumers show "Pending Assessment" for missing ids.
        if (alive) setMap(new Map());
      });
    return () => {
      alive = false;
    };
    // `inputs` intentionally excluded — `signature` is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return map;
}
