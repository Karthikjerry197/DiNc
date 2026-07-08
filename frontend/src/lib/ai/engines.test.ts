/**
 * Engine unit tests (spec §6). Run with `npm test` (tsx + node:test).
 *
 * The engines are pure, so these tests pin the invariants that make the layer
 * trustworthy: bands, monotonicity, exact points-sum, confidence caps, and the
 * critical multi-morbid care escalation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { confidenceFromCoverage, recommendedActionForRisk } from './ai-common';
import { predictFollowupDefault } from './followup';
import { computeRisk } from './risk';
import { recommendCare } from './care';
import { computePatientIntelligence } from './intelligence';
import type { FollowupInput, PatientFeatures, RiskInput } from './types';

const engagedFollowup: FollowupInput = {
  priorMissed: 0,
  priorReschedules: 0,
  attendanceRate: 0.98,
  followUpGapDays: 14,
  chronicConditions: 1,
  age: 34,
  overdueNow: false,
  daysSinceContact: 7,
  defaulterSignals: 0,
};

const defaulterFollowup: FollowupInput = {
  priorMissed: 5,
  priorReschedules: 3,
  attendanceRate: 0.3,
  followUpGapDays: 60,
  chronicConditions: 3,
  age: 72,
  overdueNow: true,
  daysSinceContact: 90,
  defaulterSignals: 4,
};

// ── Follow-up engine ────────────────────────────────────────────────────────

test('engaged patient falls in the Low band', () => {
  const r = predictFollowupDefault(engagedFollowup);
  assert.equal(r.band, 'Low');
  assert.ok(r.probability < 34, `expected <34, got ${r.probability}`);
  assert.equal(r.priority.label, 'Routine Outreach');
});

test('defaulter falls in the High band', () => {
  const r = predictFollowupDefault(defaulterFollowup);
  assert.equal(r.band, 'High');
  assert.ok(r.probability >= 60, `expected >=60, got ${r.probability}`);
  assert.equal(r.priority.label, 'Call Today');
});

test('probability never exceeds 100', () => {
  const r = predictFollowupDefault(defaulterFollowup);
  assert.ok(r.probability <= 100);
});

test('factor points sum exactly to the probability', () => {
  for (const input of [engagedFollowup, defaulterFollowup]) {
    const r = predictFollowupDefault(input);
    const sum = r.factors.reduce((s, f) => s + f.points, 0);
    assert.equal(sum, r.probability);
  }
});

test('monotonic: more missed appointments never lowers the probability', () => {
  let prev = -1;
  for (let missed = 0; missed <= 8; missed += 1) {
    const r = predictFollowupDefault({ ...engagedFollowup, priorMissed: missed });
    assert.ok(r.probability >= prev, `dropped at missed=${missed}`);
    prev = r.probability;
  }
});

test('every active factor carries a non-empty reason', () => {
  const r = predictFollowupDefault(defaulterFollowup);
  for (const f of r.factors) {
    if (f.active) assert.ok(f.reason.trim().length > 0, `empty reason on ${f.key}`);
  }
});

// ── Risk engine ─────────────────────────────────────────────────────────────

test('risk factor points sum exactly to the score', () => {
  const input: RiskInput = {
    overdueCount: 2,
    missedFollowups: 3,
    conditionCount: 3,
    severeConditions: 1,
    topPriority: 'URGENT',
    escalations: 1,
    nonAdherenceSignals: 2,
    daysSinceContact: 60,
    currentRiskLevel: 'SEVERE',
  };
  const r = computeRisk(input);
  const sum = r.factors.reduce((s, f) => s + f.points, 0);
  assert.equal(sum, r.score);
  assert.ok(r.score <= 100);
});

test('a SEVERE CDSE category is never displayed below High', () => {
  const calm: RiskInput = {
    overdueCount: 0,
    missedFollowups: 0,
    conditionCount: 1,
    severeConditions: 0,
    topPriority: null,
    escalations: 0,
    nonAdherenceSignals: 0,
    daysSinceContact: null,
    currentRiskLevel: 'SEVERE',
  };
  const r = computeRisk(calm);
  assert.ok(r.level === 'High' || r.level === 'Critical');
  assert.equal(r.dincLevel, 'SEVERE');
});

// ── Care engine ─────────────────────────────────────────────────────────────

test('critical multi-morbid case escalates care', () => {
  const care = recommendCare({
    riskLevel: 'Critical',
    riskScore: 88,
    followupBand: 'High',
    followupProbability: 75,
    conditions: ['Hypertension', 'Diabetes'],
    overdueCount: 2,
    missedFollowups: 3,
    nonAdherenceSignals: 2,
    daysSinceContact: 50,
    severeConditions: 2,
    hasOpenVisit: false,
    hasOpenCall: false,
  });
  const keys = new Set(care.recommendations.map((r) => r.key));
  assert.ok(keys.has('call-today'), 'expected call-today');
  assert.ok(keys.has('physician-review'), 'expected physician-review');
  assert.ok(keys.has('medication-counselling'), 'expected medication-counselling');
  assert.equal(care.priority, 'High');
  // Every recommendation must justify itself.
  for (const r of care.recommendations) {
    assert.ok(r.reason.trim().length > 0);
    assert.ok(r.factors.length >= 1);
  }
  // Sorted High → Low.
  const rank = { High: 0, Medium: 1, Low: 2 } as const;
  for (let i = 1; i < care.recommendations.length; i += 1) {
    assert.ok(rank[care.recommendations[i - 1].priority] <= rank[care.recommendations[i].priority]);
  }
});

test('calm low-risk case yields the continue fallback', () => {
  const care = recommendCare({
    riskLevel: 'Low',
    riskScore: 8,
    followupBand: 'Low',
    followupProbability: 10,
    conditions: [],
    overdueCount: 0,
    missedFollowups: 0,
    nonAdherenceSignals: 0,
    daysSinceContact: 5,
    severeConditions: 0,
    hasOpenVisit: false,
    hasOpenCall: false,
  });
  assert.equal(care.recommendations.length, 1);
  assert.equal(care.recommendations[0].key, 'continue');
});

// ── Primitives ──────────────────────────────────────────────────────────────

test('confidenceFromCoverage rises with coverage and caps at 98', () => {
  assert.ok(confidenceFromCoverage(0, 10) < confidenceFromCoverage(5, 10));
  assert.ok(confidenceFromCoverage(5, 10) < confidenceFromCoverage(10, 10));
  assert.equal(confidenceFromCoverage(10, 10), 98);
  assert.ok(confidenceFromCoverage(0, 10) >= 55); // floor
});

test('recommendedActionForRisk maps levels to urgency', () => {
  assert.equal(recommendedActionForRisk('Critical').withinHours, 24);
  assert.equal(recommendedActionForRisk('Critical').urgency, 'Immediate');
  assert.equal(recommendedActionForRisk('High').urgency, 'Priority');
  assert.equal(recommendedActionForRisk('Medium').withinHours, 168);
  assert.equal(recommendedActionForRisk('Low').urgency, 'Routine');
});

// ── Composer ────────────────────────────────────────────────────────────────

test('composer returns the stable PatientIntelligence contract', () => {
  const features: PatientFeatures = {
    age: 68,
    gender: 'F',
    conditions: ['Hypertension', 'Diabetes'],
    chronicConditions: 2,
    severeConditions: 1,
    overdueCount: 2,
    missedFollowups: 3,
    priorReschedules: 1,
    attendanceRate: 0.4,
    followUpGapDays: 45,
    daysSinceContact: 60,
    escalations: 1,
    nonAdherenceSignals: 2,
    defaulterSignals: 4,
    topPriority: 'URGENT',
    currentRiskLevel: 'SEVERE',
    hasOpenVisit: true,
    hasOpenCall: true,
    approximate: false,
  };
  const pi = computePatientIntelligence(features);
  assert.equal(pi.engine, 'rule-based');
  assert.ok(pi.risk && pi.followup && pi.care);
  assert.ok(pi.confidence.value <= 98);
  assert.ok(typeof pi.generatedAt === 'string');
});
