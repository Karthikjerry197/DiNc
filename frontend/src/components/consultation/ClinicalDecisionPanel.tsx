'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchCitizenRisk, type CitizenRiskSummary, type CdseRiskLevel } from '@/lib/api';
import { getToken } from '@/lib/session';

// ── Risk display helpers ──────────────────────────────────────────────────────

const RISK_CONFIG: Record<CdseRiskLevel, { label: string; icon: string; cls: string }> = {
  NONE:     { label: 'No Consultation',  icon: '○', cls: 'none'     },
  LOW:      { label: 'Low Risk',         icon: '✓', cls: 'low'      },
  MODERATE: { label: 'Moderate Risk',    icon: '◈', cls: 'moderate' },
  SEVERE:   { label: 'Severe Risk',      icon: '⚠', cls: 'severe'   },
};

function RiskBadge({ level }: { level: CdseRiskLevel }) {
  const cfg = RISK_CONFIG[level];
  return (
    <span className={`cdse-risk-badge cdse-risk-badge--${cfg.cls}`}>
      <span aria-hidden="true">{cfg.icon}</span>
      {cfg.label}
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
              <span aria-hidden="true">⚠</span> {error}
            </div>
          )}

          {data && !loading && (
            <>
              {riskLevel === 'NONE' && (
                <div className="cdse-empty">
                  <span className="cdse-empty-icon" aria-hidden="true">○</span>
                  <span className="cdse-empty-text">
                    No consultation recorded yet. Risk will be classified after the first consultation.
                  </span>
                </div>
              )}

              {riskLevel === 'LOW' && (
                <div className="cdse-risk-detail cdse-risk-detail--low">
                  <span className="cdse-risk-detail-icon" aria-hidden="true">✓</span>
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
                      {riskLevel === 'SEVERE' ? '⚠' : '◈'}
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
