'use client';

import { useEffect, useState } from 'react';
import {
  fetchExecutiveSummary,
  type AnalyticsQueryParams,
  type ExecutiveSummary,
} from '@/lib/api';
import { ProgressBar } from './Charts';

interface Props {
  token: string;
  params: AnalyticsQueryParams;
}

interface KpiCardProps {
  label: string;
  value: number | null | undefined;
  accent?: string;
  sub?: string;
}

function KpiCard({ label, value, accent, sub }: KpiCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-value" style={accent ? { color: accent } : undefined}>
        {value == null ? '—' : value.toLocaleString()}
      </div>
      <div className="stat-card-label">{label}</div>
      {sub && <div className="an-null" style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function ExecutiveSection({ token, params }: Props) {
  const [data, setData] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchExecutiveSummary(token, params)
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, JSON.stringify(params)]);

  if (loading) return <div className="rp-loading">Loading executive summary&hellip;</div>;
  if (error) return <div className="rp-error">{error}</div>;
  if (!data) return null;

  const overdueAccent = data.overdueActivities && data.overdueActivities > 0 ? '#b91c1c' : undefined;
  const escalatedAccent = data.escalatedCases && data.escalatedCases > 0 ? '#b91c1c' : undefined;
  const pendingAccent = data.pendingActivities && data.pendingActivities > 10 ? '#b45309' : undefined;

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
        <KpiCard label="Total Registered Patients" value={data.totalPatients} />
        <KpiCard label="Enrolled Today" value={data.todaysRegistrations} accent="#15803d" />
        <KpiCard label="Active Enrollments" value={data.activeEnrollments} accent="#0284c7" />
        <KpiCard label="Pending Activities" value={data.pendingActivities} accent={pendingAccent} />
        <KpiCard label="Completed Activities" value={data.completedActivities} accent="#15803d" />
        <KpiCard label="Overdue Activities" value={data.overdueActivities} accent={overdueAccent} />
        <KpiCard label="Escalated Cases" value={data.escalatedCases} accent={escalatedAccent} />
        <KpiCard label="Duplicate Requests" value={data.duplicateRequests} />
        <KpiCard label="Scheduler Runs Today" value={data.schedulerRunsToday} />
      </div>

      <div className="an-chart-row">
        <div className="panel">
          <div className="an-chart-title">Activity Completion Rate</div>
          {data.completionRate != null ? (
            <>
              <div className="rp-big-num" style={{ color: '#24a148' }}>{data.completionRate}%</div>
              <ProgressBar value={data.completionRate} color="#24a148" />
            </>
          ) : (
            <span className="an-null">No activity data yet</span>
          )}

          {data.workflowSuccessRate != null && (
            <div style={{ marginTop: 20 }}>
              <div className="an-chart-title">Workflow Success Rate</div>
              <div className="rp-big-num" style={{ color: '#0284c7', fontSize: 28 }}>
                {data.workflowSuccessRate}%
              </div>
              <ProgressBar value={data.workflowSuccessRate} color="#0284c7" />
            </div>
          )}
        </div>

        <div className="panel">
          <div className="an-chart-title">Average Response Time</div>
          {data.averageResponseHours != null ? (
            <>
              <div className="rp-big-num" style={{ color: '#1f2937' }}>
                {data.averageResponseHours}h
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                from activity creation to outcome recording
              </div>
            </>
          ) : (
            <span className="an-null">No completed activities in range</span>
          )}

          <div style={{ marginTop: 24, padding: '14px 0', borderTop: '1px solid #f0f4f1' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Pending', value: data.pendingActivities, color: '#b45309' },
                { label: 'Completed', value: data.completedActivities, color: '#15803d' },
                { label: 'Overdue', value: data.overdueActivities, color: '#b91c1c' },
                { label: 'Escalated', value: data.escalatedCases, color: '#7c3aed' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: item.color, letterSpacing: '-0.02em' }}>
                    {item.value?.toLocaleString() ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
