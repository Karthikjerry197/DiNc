'use client';

/**
 * React hook wrapping the Predictor seam for the citizen detail page.
 *
 * Async by design (even though the local rules resolve instantly) so the remote
 * ML path is a drop-in. Re-runs only when the memoised `featuresKey` changes.
 */

import { useEffect, useMemo, useState } from 'react';
import type { PatientFeatures, PatientIntelligence } from './types';
import { featuresKey } from './features';
import { getPredictor } from './predictor';

interface IntelligenceState {
  loading: boolean;
  data: PatientIntelligence | null;
  error: string | null;
}

export function usePatientIntelligence(
  id: string | null,
  features: PatientFeatures | null,
): IntelligenceState {
  const key = useMemo(
    () => (id && features ? featuresKey(id, features) : ''),
    [id, features],
  );
  const [state, setState] = useState<IntelligenceState>({
    loading: !!key,
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!key || !features) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    getPredictor()
      .predict(features)
      .then((data) => {
        if (active) setState({ loading: false, data, error: null });
      })
      .catch(() => {
        if (active) {
          setState({ loading: false, data: null, error: 'Unable to compute intelligence.' });
        }
      });
    return () => {
      active = false;
    };
    // features is captured through the stable key; re-run only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
