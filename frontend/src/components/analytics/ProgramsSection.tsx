'use client';

import { useEffect, useState } from 'react';
import {
  fetchProgramAnalytics,
  type AnalyticsQueryParams,
  type ProgramAnalyticsRow,
} from '@/lib/api';
import { ProgressBar } from './Charts';
import { Inbox } from 'lucide-react';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface Props {
  token: string;
  params: AnalyticsQueryParams;
}

export default function ProgramsSection({ token, params }: Props) {
  const [rows, setRows] = useState<ProgramAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchProgramAnalytics(token, params)
      .then(d => { if (alive) { setRows(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, JSON.stringify(params)]);

  if (loading) return <SkeletonLines lines={6} />;
  if (error) return <div className="rp-error">{error}</div>;

  if (rows.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
          <div className="empty-state-text">No program data for the selected filters.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Program Performance</h2>
        <span className="an-null">{rows.length} program{rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="wf-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Program</th>
              <th style={{ textAlign: 'right' }}>Patients</th>
              <th style={{ textAlign: 'right' }}>Active</th>
              <th style={{ textAlign: 'right' }}>Completed</th>
              <th style={{ textAlign: 'right' }}>Pending</th>
              <th style={{ textAlign: 'right' }}>Overdue</th>
              <th style={{ minWidth: 140 }}>Completion Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.programId}>
                <td style={{ fontWeight: 600 }}>{r.program}</td>
                <td style={{ textAlign: 'right' }}>{r.registeredPatients.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.activeEnrollments.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }} className="an-hi-green">{r.completedActivities.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.pendingActivities.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }} className={r.overdueActivities > 0 ? 'an-hi-red' : ''}>
                  {r.overdueActivities.toLocaleString()}
                </td>
                <td>
                  <div className="an-rate">
                    <span className="an-rate-pct">{r.completionRate}%</span>
                    <span className="an-rate-bar">
                      <ProgressBar value={r.completionRate} color={r.completionRate >= 80 ? '#15803d' : r.completionRate >= 50 ? '#d97706' : '#b91c1c'} />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
