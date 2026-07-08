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

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrainCircuit, ChevronRight, Lightbulb, TriangleAlert } from 'lucide-react';
import {
  fetchCitizenDetail,
  fetchClinicalJourney,
  fetchCitizenRisk,
  type CitizenDetail,
  type ClinicalJourneyEntry,
  type CitizenRiskSummary,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  buildPatientFeatures,
  usePatientIntelligence,
  type CareLink,
  type CareRecommendation,
  type PatientFeatures,
  type PredictionFactor,
  type PatientIntelligence,
} from '@/lib/ai';
import { RiskScoreBadge, DefaultProbBadge } from './badges';
import RiskGauge from './RiskGauge';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Sub-sections ──────────────────────────────────────────────────────────────

function DefaultProbBar({ intel }: { intel: PatientIntelligence }) {
  const { followup } = intel;
  const top = followup.factors.filter((f) => f.active).slice(0, 3);
  const tone = followup.band === 'High' ? 'severe' : followup.band === 'Medium' ? 'moderate' : 'low';
  return (
    <div className="ai-section">
      <div className="ai-section-head">
        <span className="ai-section-title">Follow-up default risk</span>
        <DefaultProbBadge probability={followup.probability} band={followup.band} />
      </div>
      <p className="ai-lead">
        <strong>{followup.probability}%</strong> likely to miss the next follow-up — {followup.priority.label}.
      </p>
      <div className="ai-bar-track">
        <div className={`ai-bar-fill ai-bar-fill--${tone}`} style={{ width: `${followup.probability}%` }} />
      </div>
      {top.length > 0 && (
        <ul className="ai-reason-list">
          {top.map((f) => (
            <li key={f.key}>
              <span className="ai-reason-pts">+{f.points}</span> {f.reason}
            </li>
          ))}
        </ul>
      )}
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

  const openLink = (link: CareLink) => {
    const base = link.kind === 'faq' ? '/knowledge-base' : '/guidebooks';
    router.push(`${base}?q=${encodeURIComponent(link.query)}`);
  };

  if (!citizenId) {
    return (
      <section className="ai-panel">
        <div className="ai-empty">
          <BrainCircuit size={22} aria-hidden="true" />
          <p>Select a citizen to view AI-assisted decision support.</p>
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
        <span className="ai-panel-tag">AI-assisted decision support</span>
      </div>

      {(loading || computing) && <div className="ai-loading">Computing intelligence…</div>}
      {error && !loading && (
        <div className="ai-error"><TriangleAlert size={13} aria-hidden="true" /> {error}</div>
      )}

      {intel && !loading && (
        <>
          <div className="ai-hero">
            <RiskGauge score={intel.risk.score} level={intel.risk.level} confidence={intel.risk.confidence.value} />
            <div className="ai-hero-side">
              <div className="ai-hero-badges">
                <RiskScoreBadge score={intel.risk.score} level={intel.risk.level} />
                <DefaultProbBadge probability={intel.followup.probability} band={intel.followup.band} />
              </div>
              <div className="ai-hero-action">
                <span className="ai-hero-action-urgency">{intel.risk.recommended.urgency}</span>
                <span className="ai-hero-action-label">{intel.risk.recommended.label}</span>
              </div>
              {intel.risk.dincLevel && (
                <div className="ai-hero-dinc">
                  DiNC clinical category: <strong>{intel.risk.dincLevel}</strong> (unchanged)
                </div>
              )}
              {features?.approximate && (
                <div className="ai-hero-approx">Based on worklist rows only — limited signals.</div>
              )}
            </div>
          </div>

          <DefaultProbBar intel={intel} />
          <RecommendedActions recs={intel.care.recommendations} onLink={openLink} />
          <TopFactors title="Why this risk score" factors={intel.risk.factors} />
          <ModelMetaFooter intel={intel} />
        </>
      )}
    </section>
  );
}
