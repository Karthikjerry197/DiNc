'use client';

import { useEffect, useState } from 'react';
import { fetchSchedulerAnalytics, type SchedulerAnalytics } from '@/lib/api';
import { ProgressBar } from './Charts';

interface Props {
  token: string;
}

export default function SchedulerSection({ token }: Props) {
  const [data, setData] = useState<SchedulerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchSchedulerAnalytics(token)
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  }, [token]);

  if (loading) return <div className="rp-loading">Loading scheduler analytics&hellip;</div>;
  if (error) return <div className="rp-error">{error}</div>;
  if (!data) return null;

  const primary = [
    { label: 'Total Runs', value: data.totalRuns, color: '#1f2937' },
    { label: 'Activities Generated', value: data.activitiesGenerated, color: '#15803d' },
    { label: 'Retries Executed', value: data.retries, color: '#d97706' },
    { label: 'Escalations', value: data.escalations, color: '#7c3aed' },
    { label: 'Failures', value: data.failures, color: data.failures > 0 ? '#b91c1c' : '#6b7280' },
    { label: 'Runs Today', value: data.runsToday, color: '#0284c7' },
  ];

  return (
    <div>
      <div className="stat-grid rp-sched-grid" style={{ marginBottom: 16 }}>
        {primary.map(item => (
          <div className="stat-card" key={item.label}>
            <div className="stat-card-value" style={{ color: item.color }}>
              {item.value.toLocaleString()}
            </div>
            <div className="stat-card-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="an-chart-row">
        <div className="panel">
          <div className="an-chart-title">Scheduler Success Rate</div>
          {data.successRate != null ? (
            <>
              <div className="rp-big-num" style={{ color: data.successRate >= 90 ? '#15803d' : '#d97706' }}>
                {data.successRate}%
              </div>
              <ProgressBar
                value={data.successRate}
                color={data.successRate >= 90 ? '#15803d' : '#d97706'}
              />
              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                {data.totalRuns - data.failures} successful of {data.totalRuns} total runs
              </div>
            </>
          ) : (
            <span className="an-null">No runs recorded yet</span>
          )}
        </div>

        <div className="panel">
          <div className="an-chart-title">Average Runtime</div>
          {data.averageRuntimeMs != null ? (
            <>
              <div className="rp-big-num" style={{ color: '#1f2937' }}>
                {data.averageRuntimeMs < 1000
                  ? `${data.averageRuntimeMs}ms`
                  : `${(data.averageRuntimeMs / 1000).toFixed(1)}s`}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                per scheduler cycle
              </div>
            </>
          ) : (
            <span className="an-null">No completed runs yet</span>
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0f4f1' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: '#374151' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#15803d' }}>
                  {data.activitiesGenerated.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>activities auto-created</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#d97706' }}>
                  {data.retries.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>retries triggered</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#7c3aed' }}>
                  {data.escalations.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>escalations raised</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {data.failures > 0 && (
        <div className="rp-error" style={{ marginTop: 0 }}>
          {data.failures} scheduler run{data.failures !== 1 ? 's' : ''} recorded failures.
          Review the Administration → Scheduler page for details.
        </div>
      )}
    </div>
  );
}
