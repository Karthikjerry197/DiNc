'use client';

import { useEffect, useRef, useState } from 'react';
import {
  fetchCdsRecommendations,
  type CdsRecommendation,
  type CdsResponse,
  type RecommendationPriority,
  type RiskLevel,
} from '@/lib/api';
import { getToken } from '@/lib/session';

// ── Helpers ───────────────────────────────────────────────────────────────────

const RISK_LABELS: Record<RiskLevel, string> = {
  LOW:      'Low Risk',
  MODERATE: 'Moderate Risk',
  HIGH:     'High Risk',
};

const PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  CRITICAL:    'Critical',
  HIGH:        'High Priority',
  RECOMMENDED: 'Recommended',
  PREVENTIVE:  'Preventive',
  INFORMATION: 'Information',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`cdse-risk-badge cdse-risk-badge--${level.toLowerCase()}`}>
      {level === 'HIGH' && <span aria-hidden="true">⚠</span>}
      {level === 'MODERATE' && <span aria-hidden="true">◈</span>}
      {level === 'LOW' && <span aria-hidden="true">✓</span>}
      {RISK_LABELS[level]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: RecommendationPriority }) {
  return (
    <span className={`cdse-priority cdse-priority--${priority}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function RecommendationCard({ rec }: { rec: CdsRecommendation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`cdse-rec cdse-rec--${rec.priority.toLowerCase()}`}>
      <button
        type="button"
        className="cdse-rec-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <PriorityBadge priority={rec.priority} />
        <span className="cdse-rec-title">{rec.title}</span>
        <span className="cdse-rec-toggle" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>

      {/* Reasons are always visible — the most actionable part */}
      <div className="cdse-rec-body">
        <p className="cdse-rec-why-label">Recommended because:</p>
        <ul className="cdse-reasons">
          {rec.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>

        {expanded && (
          <div className="cdse-rec-detail">
            <p className="cdse-rec-explanation">{rec.explanation}</p>
            <div className="cdse-rec-action">
              <span className="cdse-rec-action-label">Suggested action: </span>
              {rec.action}
            </div>
            <div className="cdse-rec-rule">{rec.supportingRule}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

interface Props {
  citizenId: string | null | undefined;
}

export default function ClinicalDecisionPanel({ citizenId }: Props) {
  const [data, setData] = useState<CdsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    setData(null);

    fetchCdsRecommendations(token, citizenId)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Unable to load recommendations');
        setLoading(false);
      });

    return () => { alive = false; };
  }, [citizenId]);

  // Don't render the panel at all if there's no citizen
  if (!citizenId) return null;

  return (
    <div className="cdse-panel">
      {/* ── Panel header ── */}
      <div className="cdse-panel-head">
        <div className="cdse-panel-title-row">
          <span className="cdse-panel-title">Clinical Decision Support</span>
          {data && !loading && (
            <RiskBadge level={data.overallRisk} />
          )}
        </div>
        <button
          type="button"
          className="cdse-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand clinical decisions' : 'Collapse clinical decisions'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {/* ── Panel body ── */}
      {!collapsed && (
        <div className="cdse-panel-body">
          {loading && (
            <div className="cdse-loading">
              <span className="cdse-loading-dot" />
              Evaluating clinical rules&hellip;
            </div>
          )}

          {error && !loading && (
            <div className="cdse-error">
              <span aria-hidden="true">⚠</span> {error}
            </div>
          )}

          {data && !loading && (
            <>
              {data.recommendations.length === 0 ? (
                <div className="cdse-empty">
                  <span className="cdse-empty-icon" aria-hidden="true">✓</span>
                  <span className="cdse-empty-text">
                    No active clinical concerns identified.
                    {data.totalActivePrograms === 0 && ' Citizen is not enrolled in any programme.'}
                  </span>
                </div>
              ) : (
                <div className="cdse-recs-list">
                  {data.recommendations.map((rec) => (
                    <RecommendationCard key={rec.ruleId} rec={rec} />
                  ))}
                </div>
              )}

              <div className="cdse-panel-footer">
                <span>{data.riskExplanation}</span>
                <span className="cdse-footer-meta">
                  {data.totalActivePrograms} programme{data.totalActivePrograms !== 1 ? 's' : ''}
                  {' · '}
                  {data.totalConsultations} consultation{data.totalConsultations !== 1 ? 's' : ''}
                  {' · '}
                  Evaluated {new Date(data.evaluatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
