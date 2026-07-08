/**
 * The swap seam — why this layer is "ML-ready".
 *
 *   UI → Predictor (interface) → LocalRuleBasedPredictor   (default, in-process)
 *                              ↘ RemotePredictor           (POST features → Python ML)
 *
 * Predictions are async even though the rules resolve instantly, so swapping in
 * a real model via `setPredictor(new RemotePredictor(...))` is one call with
 * ZERO UI change. The `PatientIntelligence` shape is the contract the future
 * service must return. This mirrors DiNC's existing provider-abstraction pattern
 * (see the telephony `DialInfo.provider` seam).
 */

import type { PatientFeatures, PatientIntelligence } from './types';
import { computePatientIntelligence } from './intelligence';

export interface Predictor {
  predict(features: PatientFeatures): Promise<PatientIntelligence>;
  predictMany?(features: PatientFeatures[]): Promise<PatientIntelligence[]>;
}

/** Default predictor: runs the pure rule engines in-process. */
export class LocalRuleBasedPredictor implements Predictor {
  async predict(features: PatientFeatures): Promise<PatientIntelligence> {
    return computePatientIntelligence(features);
  }

  async predictMany(features: PatientFeatures[]): Promise<PatientIntelligence[]> {
    return features.map(computePatientIntelligence);
  }
}

/**
 * Future path: POSTs `{ features }` to a backend route (e.g.
 * `POST /api/intelligence/predict`) that proxies a Python ML service returning
 * the same `PatientIntelligence` shape. Implemented but intentionally UNWIRED —
 * `getPredictor()` returns the local predictor until `setPredictor` swaps it.
 */
export class RemotePredictor implements Predictor {
  constructor(
    private readonly endpoint: string,
    private readonly authHeader?: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authHeader) h.Authorization = this.authHeader;
    return h;
  }

  async predict(features: PatientFeatures): Promise<PatientIntelligence> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ features }),
    });
    if (!res.ok) throw new Error(`RemotePredictor failed: ${res.status}`);
    return res.json() as Promise<PatientIntelligence>;
  }

  async predictMany(features: PatientFeatures[]): Promise<PatientIntelligence[]> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ features }),
    });
    if (!res.ok) throw new Error(`RemotePredictor failed: ${res.status}`);
    return res.json() as Promise<PatientIntelligence[]>;
  }
}

let current: Predictor = new LocalRuleBasedPredictor();

export function getPredictor(): Predictor {
  return current;
}

export function setPredictor(next: Predictor): void {
  current = next;
}
