'use client';

import { useEffect, useState } from 'react';
import {
  fetchWorklistAnalytics,
  type AnalyticsQueryParams,
  type WorklistAnalytics,
} from '@/lib/api';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface Props {
  token: string;
  params: AnalyticsQueryParams;
}

function fmt(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString();
}

export default function WorklistSection({ token, params }: Props) {
  const [data, setData] = useState<WorklistAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchWorklistAnalytics(token, params)
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, JSON.stringify(params)]);

  if (loading) return <SkeletonLines lines={6} />;
  if (error) return <div className="rp-error">{error}</div>;
  if (!data) return null;

  const primary = [
    { label: 'Pending', value: data.pending, color: '#b45309' },
    { label: 'Completed', value: data.completed, color: '#15803d' },
    { label: 'Overdue', value: data.overdue, color: '#b91c1c' },
    { label: 'Escalated', value: data.escalated, color: '#7c3aed' },
  ];

  const secondary = [
    { label: 'Created Today', value: data.createdToday },
    { label: 'Completed Today', value: data.completedToday },
    { label: 'Created This Week', value: data.createdThisWeek },
    { label: 'Total Retries', value: data.totalRetries },
    {
      label: 'Avg Completion',
      value: data.averageCompletionHours != null ? `${data.averageCompletionHours}h` : null,
    },
  ];

  return (
    <div>
      <div className="stat-grid an-kpi-4" style={{ marginBottom: 0 }}>
        {primary.map(item => (
          <div className="stat-card" key={item.label}>
            <div className="stat-card-value" style={{ color: item.color }}>
              {item.value.toLocaleString()}
            </div>
            <div className="stat-card-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="rp-secondary-grid">
        {secondary.map(item => (
          <div className="rp-secondary-card" key={item.label}>
            <div className="rp-secondary-value">
              {item.value == null ? <span className="an-null">—</span> : String(item.value)}
            </div>
            <div className="rp-secondary-label">{item.label}</div>
          </div>
        ))}
      </div>

      {data.totalRetries > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <h2 className="panel-title">Retry Summary</h2>
          </div>
          <div style={{ display: 'flex', gap: 32, fontSize: 13, color: '#374151' }}>
            <div>
              <strong>{fmt(data.totalRetries)}</strong> total retry attempts logged
            </div>
            {data.averageCompletionHours != null && (
              <div>
                Average {data.averageCompletionHours}h from assignment to completion
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
