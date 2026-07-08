/**
 * DiNC AI Decision-Support Layer — public barrel.
 *
 * Explainable, ML-ready clinical decision support built as hand-weighted,
 * dependency-free heuristics behind a Predictor swap seam. See docs/AI-LAYER-SPEC.md.
 * This is "AI-assisted decision support", NOT a trained ML model — confidence
 * reflects data completeness, not certainty.
 */

export * from './types';
export * from './ai-common';
export { predictFollowupDefault, bandForProbability } from './followup';
export { computeRisk } from './risk';
export { recommendCare, CARE_CONFIG } from './care';
export { computePatientIntelligence, dincLevelToBand } from './intelligence';
export {
  type Predictor,
  LocalRuleBasedPredictor,
  RemotePredictor,
  getPredictor,
  setPredictor,
} from './predictor';
export { buildPatientFeatures, worklistFeatures, featuresKey } from './features';
export { usePatientIntelligence } from './usePatientIntelligence';
