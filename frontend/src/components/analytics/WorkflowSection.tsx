'use client';

import { useEffect, useState } from 'react';
import {
  fetchWorkflowAnalytics,
  type AnalyticsQueryParams,
  type WorkflowAnalytics,
} from '@/lib/api';
import { BarChart, PieChart } from './Charts';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface Props {
  token: string;
  params: AnalyticsQueryParams;
}

export default function WorkflowSection({ token, params }: Props) {
  const [data, setData] = useState<WorkflowAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchWorkflowAnalytics(token, params)
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, JSON.stringify(params)]);

  if (loading) return <SkeletonLines lines={6} />;
  if (error) return <div className="rp-error">{error}</div>;
  if (!data) return null;

  const kpis = [
    {
      label: 'Retry Success Rate',
      value: data.retrySuccessRate,
      suffix: '%',
      color: data.retrySuccessRate != null && data.retrySuccessRate >= 60 ? '#15803d' : '#d97706',
    },
    {
      label: 'Escalation Rate',
      value: data.escalationRate,
      suffix: '%',
      color: data.escalationRate != null && data.escalationRate > 20 ? '#b91c1c' : '#1f2937',
    },
    {
      label: 'Avg Rule Delay',
      value: data.averageDelayDays,
      suffix: ' days',
      color: '#1f2937',
    },
    {
      label: 'Rules Executed Today',
      value: data.rulesExecutedToday,
      suffix: '',
      color: '#0284c7',
    },
  ];

  return (
    <div>
      <div className="stat-grid an-kpi-4" style={{ marginBottom: 16 }}>
        {kpis.map(k => (
          <div className="stat-card" key={k.label}>
            <div className="stat-card-value" style={{ color: k.color }}>
              {k.value == null ? <span style={{ fontSize: 18 }} className="an-null">—</span> : `${k.value}${k.suffix}`}
            </div>
            <div className="stat-card-label">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="an-chart-row">
        <div className="panel">
          <div className="an-chart-title">Most Triggered Outcomes</div>
          {data.mostTriggeredOutcomes.length > 0 ? (
            <BarChart
              data={data.mostTriggeredOutcomes.map(d => ({ label: d.name, value: d.count }))}
              color="#24a148"
            />
          ) : (
            <span className="an-null">No outcomes recorded yet</span>
          )}
        </div>

        <div className="panel">
          <div className="an-chart-title">Outcome Category Distribution</div>
          {data.mostCommonOutcomes.length > 0 ? (
            <PieChart
              data={data.mostCommonOutcomes.map(d => ({ label: d.name, value: d.count }))}
            />
          ) : (
            <span className="an-null">No outcome records yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
