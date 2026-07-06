'use client';

import { useEffect, useState } from 'react';
import {
  fetchRiskAnalytics,
  type AnalyticsQueryParams,
  type RiskAnalytics,
} from '@/lib/api';
import { LineChart, PieChart } from './Charts';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface Props {
  token: string;
  params: AnalyticsQueryParams;
}

/** "07-03" style tick from an ISO date — keeps the 30-day axis compact. */
function shortDate(iso: string): string {
  return iso.slice(5);
}

export default function RiskSection({ token, params }: Props) {
  const [data, setData] = useState<RiskAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchRiskAnalytics(token, params)
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, JSON.stringify(params)]);

  if (loading) return <SkeletonLines lines={6} />;
  if (error) return <div className="rp-error">{error}</div>;
  if (!data) return null;

  const levels = [
    { label: 'Low Risk', value: data.low, color: 'var(--risk-low)' },
    { label: 'Moderate Risk', value: data.moderate, color: 'var(--risk-moderate)' },
    { label: 'Severe Risk', value: data.severe, color: 'var(--risk-severe)' },
  ];

  const alerts = [
    { label: 'Active Alerts', value: data.activeAlerts },
    { label: 'Resolved Alerts', value: data.resolvedAlerts },
  ];

  const hasTrendData = data.trend.some(p => p.moderate > 0 || p.severe > 0);

  return (
    <div>
      <div className="stat-grid an-kpi-4" style={{ marginBottom: 0 }}>
        {levels.map(item => (
          <div className="stat-card" key={item.label}>
            <div className="stat-card-value" style={{ color: item.color }}>
              {item.value.toLocaleString()}
            </div>
            <div className="stat-card-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="rp-secondary-grid">
        {alerts.map(item => (
          <div className="rp-secondary-card" key={item.label}>
            <div className="rp-secondary-value">{item.value.toLocaleString()}</div>
            <div className="rp-secondary-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="an-chart-row">
        <div className="panel">
          <div className="an-chart-title">30-Day Risk Trend</div>
          {hasTrendData ? (
            <LineChart
              series={[
                {
                  name: 'Moderate',
                  color: 'var(--risk-moderate)',
                  data: data.trend.map(p => ({ label: shortDate(p.date), value: p.moderate })),
                },
                {
                  name: 'Severe',
                  color: 'var(--risk-severe)',
                  data: data.trend.map(p => ({ label: shortDate(p.date), value: p.severe })),
                },
              ]}
            />
          ) : (
            <span className="an-null">No alerts triggered in the last 30 days</span>
          )}
        </div>

        <div className="panel">
          <div className="an-chart-title">Active vs Resolved Alerts</div>
          {data.activeAlerts + data.resolvedAlerts > 0 ? (
            <PieChart data={data.distribution.map(d => ({ label: d.name, value: d.count }))} />
          ) : (
            <span className="an-null">No clinical alerts recorded yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
