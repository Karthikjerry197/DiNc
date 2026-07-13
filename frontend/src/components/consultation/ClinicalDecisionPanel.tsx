'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchCitizenRisk, type CitizenRiskSummary, type CdseRiskLevel } from '@/lib/api';
import { getToken } from '@/lib/session';
import type { ReactNode } from 'react';
import { Circle, CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import ReferenceBadge from '@/components/reference/ReferenceBadge';
import type { ReferenceOption } from '@/lib/useReferenceData';

// ── Risk display helpers ──────────────────────────────────────────────────────
//
// M40 Configuration Convergence: the risk-level LABEL + COLOUR now come from the
// `risk_level` Reference Data category (the single canonical definition), rendered
// via ReferenceBadge. Only the decorative icon — a presentation choice, not a
// business vocabulary — is keyed in code. The fallback is used offline only.

const RISK_LEVEL_FALLBACK: ReferenceOption[] = [
  { code: 'NONE', displayName: 'None', colour: '#4b5563' },
  { code: 'LOW', displayName: 'Low', colour: '#15803d' },
  { code: 'MODERATE', displayName: 'Moderate', colour: '#b45309' },
  { code: 'SEVERE', displayName: 'Severe', colour: '#b91c1c' },
];

const RISK_ICON: Record<CdseRiskLevel, ReactNode> = {
  NONE: <Circle size={12} />,
  LOW: <CircleCheck size={12} />,
  MODERATE: <CircleAlert size={12} />,
  SEVERE: <TriangleAlert size={12} />,
};

function RiskBadge({ level }: { level: CdseRiskLevel }) {
  return (
    <span className={`cdse-risk-badge-wrap cdse-risk-badge-wrap--${level.toLowerCase()}`}>
      <span aria-hidden="true">{RISK_ICON[level]}</span>
      <ReferenceBadge category="risk_level" code={level} fallback={RISK_LEVEL_FALLBACK} />
    </span>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  citizenId: string | null | undefined;
  /** Increment to force a data refresh (e.g. after consultation save). */
  refreshKey?: number;
}

export default function ClinicalDecisionPanel({ citizenId, refreshKey }: Props) {
  const [data, setData]       = useState<CitizenRiskSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!citizenId) return;
    const token = getToken();
    if (!token) return;

    let alive = true;
    setLoading(true);
    setError('');

    fetchCitizenRisk(token, citizenId)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Unable to load risk classification');
        setLoading(false);
      });

    return () => { alive = false; };
  }, [citizenId, refreshKey]);

  if (!citizenId) return null;

  const riskLevel = data?.riskLevel ?? 'NONE';
  const alert     = data?.activeAlert ?? null;

  return (
    <div className="cdse-panel">
      <div className="cdse-panel-head">
        <div className="cdse-panel-title-row">
          <span className="cdse-panel-title">Clinical Risk</span>
          {data && !loading && <RiskBadge level={riskLevel} />}
        </div>
        <button
          type="button"
          className="cdse-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand clinical risk' : 'Collapse clinical risk'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div className="cdse-panel-body">
          {loading && (
            <div className="cdse-loading">
              <span className="cdse-loading-dot" />
              Loading risk classification&hellip;
            </div>
          )}

          {error && !loading && (
            <div className="cdse-error">
              <span aria-hidden="true"><TriangleAlert size={12} /></span> {error}
            </div>
          )}

          {data && !loading && (
            <>
              {riskLevel === 'NONE' && (
                <div className="cdse-empty">
                  <span className="cdse-empty-icon" aria-hidden="true"><Circle size={13} /></span>
                  <span className="cdse-empty-text">
                    No care recorded yet. Risk will be classified after the first care record.
                  </span>
                </div>
              )}

              {riskLevel === 'LOW' && (
                <div className="cdse-risk-detail cdse-risk-detail--low">
                  <span className="cdse-risk-detail-icon" aria-hidden="true"><CircleCheck size={14} /></span>
                  <div>
                    <div className="cdse-risk-detail-title">Low Risk</div>
                    <div className="cdse-risk-detail-sub">
                      No danger signs, referral criteria, or adherence concerns identified.
                    </div>
                  </div>
                </div>
              )}

              {(riskLevel === 'MODERATE' || riskLevel === 'SEVERE') && alert && (
                <div className={`cdse-alert-card cdse-alert-card--${riskLevel.toLowerCase()}`}>
                  <div className="cdse-alert-header">
                    <span className="cdse-alert-icon" aria-hidden="true">
                      {riskLevel === 'SEVERE' ? <TriangleAlert size={15} /> : <CircleAlert size={15} />}
                    </span>
                    <span className="cdse-alert-title">
                      Active Clinical Alert — {riskLevel === 'SEVERE' ? 'Severe Risk' : 'Moderate Risk'}
                    </span>
                  </div>
                  {alert.disease && (
                    <div className="cdse-alert-disease">Condition: {alert.disease}</div>
                  )}
                  <div className="cdse-alert-reason">
                    {riskLevel === 'SEVERE'
                      ? 'Danger sign or referral criterion identified during counselling.'
                      : 'Medication adherence or lifestyle concern identified during counselling.'}
                  </div>
                  <div className="cdse-alert-date">
                    Triggered: {new Date(alert.triggeredAt).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              )}

              {data.evaluatedAt && (
                <div className="cdse-panel-footer">
                  <span className="cdse-footer-meta">
                    Last evaluated{' '}
                    {new Date(data.evaluatedAt).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
