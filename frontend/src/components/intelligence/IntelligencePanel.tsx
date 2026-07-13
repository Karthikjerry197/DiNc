'use client';

/**
 * Patient Intelligence Panel (spec §5.1) — one pane combining explainable risk,
 * follow-up default, and care recommendations for a citizen.
 *
 * Self-loading by `citizenId` (mirrors ClinicalDecisionPanel / ClinicalJourney):
 * it fetches the citizen detail, clinical journey and CDSE risk that DiNC
 * already exposes, projects them onto engine features, then runs the Predictor
 * seam via `usePatientIntelligence`. Every number is shown WITH its reason,
 * confidence, timestamp and model version — never a bare score.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, BrainCircuit, ChevronRight, CircleAlert, CircleCheck, Clock, Lightbulb, TriangleAlert } from 'lucide-react';
import {
  fetchCitizenDetail,
  fetchClinicalJourney,
  fetchCitizenRisk,
  resolveOverallRisk,
  type CitizenDetail,
  type ClinicalJourneyEntry,
  type CitizenRiskSummary,
  type OverallRiskResolution,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  buildPatientFeatures,
  usePatientIntelligence,
  type CareLink,
  type CareRecommendation,
  type DincRiskLevel,
  type PatientFeatures,
  type PredictionFactor,
  type PatientIntelligence,
} from '@/lib/ai';
import { RiskScoreBadge } from './badges';
import RiskGauge from './RiskGauge';
import ReferenceBadge from '@/components/reference/ReferenceBadge';
import type { ReferenceOption } from '@/lib/useReferenceData';

/** Offline fallback for the `risk_level` reference category (Clinical Severity). */
const RISK_LEVEL_FALLBACK: ReferenceOption[] = [
  { code: 'NONE', displayName: 'None', colour: '#4b5563' },
  { code: 'LOW', displayName: 'Low', colour: '#15803d' },
  { code: 'MODERATE', displayName: 'Moderate', colour: '#b45309' },
  { code: 'SEVERE', displayName: 'Severe', colour: '#b91c1c' },
];

/** Distinct icon per Overall Risk level (visual indicator alongside colour). */
const OVERALL_ICON: Record<'LOW' | 'MODERATE' | 'HIGH', ReactNode> = {
  LOW: <CircleCheck size={22} aria-hidden="true" />,
  MODERATE: <CircleAlert size={22} aria-hidden="true" />,
  HIGH: <TriangleAlert size={22} aria-hidden="true" />,
};

/** Short clinical-severity notes keyed by CDSE category. */
const CLINICAL_SEVERITY_NOTE: Record<string, string> = {
  NONE: 'No care recorded yet — severity is classified after the first consultation.',
  LOW: 'No danger signs, referral criteria, or adherence concerns identified.',
  MODERATE: 'A medication-adherence or lifestyle concern was identified.',
  SEVERE: 'Danger sign / referral criteria detected.',
};

/** Clinical-severity icon per CDSE category (colour comes from the badge). */
const SEVERITY_ICON: Record<string, ReactNode> = {
  NONE: <Clock size={16} aria-hidden="true" />,
  LOW: <CircleCheck size={16} aria-hidden="true" />,
  MODERATE: <CircleAlert size={16} aria-hidden="true" />,
  SEVERE: <TriangleAlert size={16} aria-hidden="true" />,
};

/** Severity → tone class (NONE reads as neutral, not "good"). */
const SEVERITY_TONE: Record<string, 'none' | 'low' | 'moderate' | 'severe'> = {
  NONE: 'none', LOW: 'low', MODERATE: 'moderate', SEVERE: 'severe',
};

/** Clinician-facing band word — the follow-up model's "Medium" reads as "Moderate". */
function bandDisplay(band: string): string {
  return band === 'Medium' ? 'Moderate' : band;
}

/** Priority word shown as a coloured badge, derived from the Overall Risk level. */
const OVERALL_PRIORITY_WORD: Record<'LOW' | 'MODERATE' | 'HIGH', string> = {
  HIGH: 'URGENT', MODERATE: 'SOON', LOW: 'ROUTINE',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Sub-sections ──────────────────────────────────────────────────────────────

/** Supporting card — Clinical Severity (CDSE category), rendered from Reference Data. */
function ClinicalSeverityCard({ level }: { level: DincRiskLevel | null }) {
  const lvl = level ?? 'NONE';
  const tone = SEVERITY_TONE[lvl] ?? 'none';
  return (
    <div className="ai-support-card">
      <div className="ai-support-label">Clinical Severity</div>
      <div className="ai-support-value ai-sev-value">
        <span className={`ai-sev-icon ai-sev-icon--${tone}`}>{SEVERITY_ICON[lvl]}</span>
        <ReferenceBadge category="risk_level" code={lvl} fallback={RISK_LEVEL_FALLBACK} />
      </div>
      <p className="ai-support-note">{CLINICAL_SEVERITY_NOTE[lvl] ?? ''}</p>
    </div>
  );
}

/** Supporting card — Follow-up prediction, shown as three labelled fields. */
function FollowupProbabilityCard({ intel }: { intel: PatientIntelligence }) {
  const { followup } = intel;
  const tone = followup.band === 'High' ? 'severe' : followup.band === 'Medium' ? 'moderate' : 'low';
  return (
    <div className="ai-support-card">
      <div className="ai-support-label">Follow-up Prediction</div>

      <div className="ai-fu-field">
        <span className="ai-fu-field-label">Follow-up Default Probability</span>
        <span className={`ai-support-pct ai-support-pct--${tone}`}>{followup.probability}%</span>
        <div className="ai-bar-track">
          <div className={`ai-bar-fill ai-bar-fill--${tone}`} style={{ width: `${followup.probability}%` }} />
        </div>
      </div>

      <div className="ai-fu-row">
        <div className="ai-fu-field">
          <span className="ai-fu-field-label">Risk Band</span>
          <span className={`ai-fu-band ai-fu-band--${tone}`}>{bandDisplay(followup.band)}</span>
        </div>
        <div className="ai-fu-field">
          <span className="ai-fu-field-label">Recommended Follow-up</span>
          <span className="ai-fu-followup">{followup.priority.label}</span>
        </div>
      </div>

      <p className="ai-support-note">Predicted probability the citizen misses their next follow-up.</p>
    </div>
  );
}

function TopFactors({ title, factors }: { title: string; factors: PredictionFactor[] }) {
  const active = factors.filter((f) => f.active).slice(0, 5);
  if (active.length === 0) {
    return (
      <div className="ai-section">
        <div className="ai-section-head"><span className="ai-section-title">{title}</span></div>
        <p className="ai-muted">No contributing factors on record.</p>
      </div>
    );
  }
  const maxPts = Math.max(...active.map((f) => f.points), 1);
  return (
    <div className="ai-section">
      <div className="ai-section-head"><span className="ai-section-title">{title}</span></div>
      <ul className="ai-factor-list">
        {active.map((f) => (
          <li key={f.key} className="ai-factor">
            <div className="ai-factor-top">
              <span className="ai-factor-label">{f.label}</span>
              <span className="ai-factor-pts">+{f.points}</span>
            </div>
            <div className="ai-factor-track">
              <div className="ai-factor-bar" style={{ width: `${(f.points / maxPts) * 100}%` }} />
            </div>
            <div className="ai-factor-reason">{f.reason}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecommendedActions({
  recs,
  onLink,
}: {
  recs: CareRecommendation[];
  onLink: (link: CareLink) => void;
}) {
  return (
    <div className="ai-section">
      <div className="ai-section-head">
        <span className="ai-section-title">
          <Lightbulb size={13} aria-hidden="true" /> Recommended actions
        </span>
      </div>
      <ul className="ai-rec-list">
        {recs.map((r) => (
          <li key={r.key} className={`ai-rec ai-rec--${r.priority.toLowerCase()}`}>
            <div className="ai-rec-head">
              <span className="ai-rec-action">{r.action}</span>
              <span className={`ai-rec-pill ai-rec-pill--${r.priority.toLowerCase()}`}>{r.priority}</span>
            </div>
            <div className="ai-rec-reason">{r.reason}</div>
            {r.factors.length > 0 && (
              <div className="ai-rec-factors">
                {r.factors.map((f, i) => (
                  <span key={i} className="ai-chip">{f}</span>
                ))}
              </div>
            )}
            {r.link && (
              <button type="button" className="ai-rec-link" onClick={() => onLink(r.link!)}>
                {r.link.label} <ChevronRight size={12} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Maps a risk word to the shared ai tone classes (low / moderate / severe). */
function riskTone(level: string): 'low' | 'moderate' | 'severe' {
  const v = level.toUpperCase();
  if (v === 'HIGH' || v === 'SEVERE' || v === 'CRITICAL') return 'severe';
  if (v === 'MODERATE' || v === 'MEDIUM') return 'moderate';
  return 'low';
}

/** Outreach action derived from the OVERALL risk level (presentation only — it
 * maps an already-resolved level to guidance; it does not compute Overall Risk). */
function overallAction(level: 'LOW' | 'MODERATE' | 'HIGH'): { label: string } {
  switch (level) {
    case 'HIGH':
      return { label: 'Call within 24 hours' };
    case 'MODERATE':
      return { label: 'Contact within 7 days' };
    case 'LOW':
    default:
      return { label: 'Routine follow-up' };
  }
}

/**
 * Makes the recommendation list reflect OVERALL RISK, not only the follow-up
 * score. When Overall Risk is MODERATE/HIGH it leads with an overall-risk-driven
 * action and drops the "Continue current care plan" fallback, so a high-overall-
 * risk patient never reads as "stay the course".
 */
function recommendationsForOverall(
  base: CareRecommendation[],
  overall: OverallRiskResolution | null,
): CareRecommendation[] {
  if (!overall || overall.overallRisk === 'LOW') return base;
  const lead: CareRecommendation =
    overall.overallRisk === 'HIGH'
      ? {
          key: 'overall-high',
          action: 'Prioritise this patient for urgent follow-up',
          reason: overall.explanation,
          priority: 'High',
          factors: ['Overall risk: HIGH'],
        }
      : {
          key: 'overall-moderate',
          action: 'Schedule a timely follow-up',
          reason: overall.explanation,
          priority: 'Medium',
          factors: ['Overall risk: MODERATE'],
        };
  const rest = base.filter((r) => r.key !== 'continue');
  return [lead, ...rest];
}

/**
 * PRIMARY — Overall Risk. The matrix-driven composite of Clinical Severity ×
 * AI Follow-up Risk. Both the classification and its rationale come from the
 * backend Overall Risk Service (PostgreSQL decision matrix). This component NEVER
 * combines the inputs itself — when `overall` is null it shows a neutral
 * "Pending Assessment" state, so there is exactly one Overall Risk computation
 * path in the platform. The headline action is derived from the Overall Risk.
 */
function OverallRiskHero({ overall }: { overall: OverallRiskResolution | null }) {
  if (!overall) {
    return (
      <div className="ai-overall-hero ai-overall-hero--pending">
        <div className="ai-overall-hero-label">Overall Risk</div>
        <div className="ai-overall-hero-value ai-overall-hero-value--pending">
          <Clock size={22} aria-hidden="true" /> Pending Assessment
        </div>
        <p className="ai-overall-why">
          Overall Risk is calculated once a consultation records the patient&apos;s clinical
          severity and the follow-up model runs. Clinical Severity and Follow-up Default
          Probability are shown below.
        </p>
      </div>
    );
  }
  const tone = riskTone(overall.overallRisk);
  const action = overallAction(overall.overallRisk);
  const priorityWord = OVERALL_PRIORITY_WORD[overall.overallRisk];
  return (
    <div className={`ai-overall-hero ai-overall-hero--${tone}`}>
      <div className="ai-overall-hero-top">
        <div>
          <div className="ai-overall-hero-label">Overall Risk</div>
          <div className={`ai-overall-hero-value ai-overall-hero-value--${tone}`}>
            {OVERALL_ICON[overall.overallRisk]} {overall.overallRisk}
          </div>
        </div>
        <div className="ai-priority">
          <span className="ai-priority-label">Priority</span>
          <span className={`ai-priority-badge ai-priority-badge--${tone}`}>{priorityWord}</span>
          <span className="ai-priority-detail">{action.label}</span>
        </div>
      </div>

      <p className="ai-overall-why">{overall.explanation}</p>

      {/* Clinical decision flow: Clinical Severity → Follow-up Risk → Overall Risk */}
      <div className="ai-decision-flow" aria-label="Clinical Severity then Follow-up Risk determine Overall Risk">
        <div className="ai-decision-step">
          <span className="ai-decision-step-label">Clinical Severity</span>
          <span className={`ai-decision-chip ai-decision-chip--${riskTone(overall.clinicalSeverity)}`}>
            {overall.clinicalSeverity}
          </span>
        </div>
        <ArrowDown className="ai-decision-arrow" size={16} aria-hidden="true" />
        <div className="ai-decision-step">
          <span className="ai-decision-step-label">Follow-up Risk</span>
          <span className={`ai-decision-chip ai-decision-chip--${riskTone(overall.followupRisk)}`}>
            {overall.followupRisk}
          </span>
        </div>
        <ArrowDown className="ai-decision-arrow" size={16} aria-hidden="true" />
        <div className="ai-decision-step ai-decision-step--result">
          <span className="ai-decision-step-label">Overall Risk</span>
          <span className={`ai-decision-chip ai-decision-chip--strong ai-decision-chip--${tone}`}>
            {overall.overallRisk}
          </span>
        </div>
      </div>
    </div>
  );
}

/** SUPPORTING — the explainable follow-up risk assessment (augments, never
 * replaces, the Overall Risk hero above). The gauge is deliberately small so it
 * reads as supporting detail. */
function FollowupRiskAssessment({ intel }: { intel: PatientIntelligence }) {
  return (
    <div className="ai-section">
      <div className="ai-section-head">
        <span className="ai-section-title">Follow-up Risk Assessment</span>
        <RiskScoreBadge score={intel.risk.score} level={intel.risk.level} />
      </div>
      <div className="ai-risk-supporting">
        <RiskGauge score={intel.risk.score} level={intel.risk.level} confidence={intel.risk.confidence.value} />
      </div>
    </div>
  );
}

function ModelMetaFooter({ intel }: { intel: PatientIntelligence }) {
  return (
    <div className="ai-meta-footer">
      <span className="ai-meta-item">Engine: <strong>{intel.engine}</strong></span>
      <span className="ai-meta-item">risk {intel.risk.modelVersion}</span>
      <span className="ai-meta-item">follow-up {intel.followup.meta.modelVersion}</span>
      <span className="ai-meta-item">Generated {formatDateTime(intel.generatedAt)}</span>
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export default function IntelligencePanel({ citizenId }: { citizenId: string | null }) {
  const router = useRouter();
  const [detail, setDetail] = useState<CitizenDetail | null>(null);
  const [journey, setJourney] = useState<ClinicalJourneyEntry[]>([]);
  const [risk, setRisk] = useState<CitizenRiskSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!citizenId) return;
    const token = getToken();
    if (!token) return;
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      fetchCitizenDetail(token, citizenId),
      fetchClinicalJourney(token, citizenId).catch(() => [] as ClinicalJourneyEntry[]),
      fetchCitizenRisk(token, citizenId).catch(() => null),
    ])
      .then(([d, j, rk]) => {
        if (!alive) return;
        setDetail(d);
        setJourney(j);
        setRisk(rk);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError('Unable to load intelligence inputs.');
        setLoading(false);
      });
    return () => { alive = false; };
  }, [citizenId]);

  const features: PatientFeatures | null = useMemo(
    () => (detail ? buildPatientFeatures(detail, journey, risk) : null),
    [detail, journey, risk],
  );

  const { data: intel, loading: computing } = usePatientIntelligence(citizenId, features);

  // Overall Risk — resolved by the backend matrix service from the two engine
  // inputs (Clinical Severity × AI Follow-up Risk). Recomputed whenever either
  // input changes. Degrades silently if the API is unavailable (the individual
  // Clinical Severity and Follow-up sections still render).
  const [overall, setOverall] = useState<OverallRiskResolution | null>(null);
  // Clinical Severity is the CDSE category; when no consultation exists yet it is
  // NONE (the backend maps NONE → the matrix's lowest severity, LOW).
  const clinicalSeverity = intel ? (intel.risk.dincLevel ?? 'NONE') : null;
  const followupBand = intel?.followup.band ?? null;

  useEffect(() => {
    const token = getToken();
    if (!token || !clinicalSeverity || !followupBand) {
      setOverall(null);
      return;
    }
    let alive = true;
    resolveOverallRisk(token, clinicalSeverity, followupBand)
      .then((r) => { if (alive) setOverall(r); })
      .catch(() => { if (alive) setOverall(null); });
    return () => { alive = false; };
  }, [clinicalSeverity, followupBand]);

  const openLink = (link: CareLink) => {
    const base = link.kind === 'faq' ? '/knowledge-base' : '/guidebooks';
    router.push(`${base}?q=${encodeURIComponent(link.query)}`);
  };

  if (!citizenId) {
    return (
      <section className="ai-panel">
        <div className="ai-empty">
          <BrainCircuit size={22} aria-hidden="true" />
          <p>Select a citizen to view clinical decision support.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="ai-panel">
      <div className="ai-panel-head">
        <span className="ai-panel-title">
          <BrainCircuit size={16} aria-hidden="true" /> Patient Intelligence
        </span>
        <span className="ai-panel-tag">Clinical decision support</span>
      </div>

      {(loading || computing) && <div className="ai-loading">Computing intelligence…</div>}
      {error && !loading && (
        <div className="ai-error"><TriangleAlert size={13} aria-hidden="true" /> {error}</div>
      )}

      {intel && !loading && (
        <>
          {/* 1 — PRIMARY: Overall Risk */}
          <OverallRiskHero overall={overall} />
          {features?.approximate && (
            <div className="ai-hero-approx">Based on worklist rows only — limited signals.</div>
          )}

          {/* 2 — Recommended actions, driven by Overall Risk (clinicians ask
              "how risky?" then "what do I do?"). */}
          <RecommendedActions recs={recommendationsForOverall(intel.care.recommendations, overall)} onLink={openLink} />

          {/* 3 — Supporting details: Clinical Severity and the Follow-up prediction */}
          <div className="ai-support-row">
            <ClinicalSeverityCard level={intel.risk.dincLevel} />
            <FollowupProbabilityCard intel={intel} />
          </div>

          {/* 4 — Follow-up Risk Assessment (supporting gauge) and explainability */}
          <FollowupRiskAssessment intel={intel} />
          <TopFactors title="Why the Follow-up Default Probability" factors={intel.followup.factors} />
          <TopFactors title="Why the risk assessment" factors={intel.risk.factors} />
          <ModelMetaFooter intel={intel} />
        </>
      )}
    </section>
  );
}
