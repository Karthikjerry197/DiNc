'use client';

import { useEffect, useState } from 'react';
import {
  fetchWorkerPerformance,
  type AnalyticsQueryParams,
  type WorkerPerformanceRow,
} from '@/lib/api';
import { ProgressBar } from './Charts';
import { Lock, UsersRound } from 'lucide-react';
import { SkeletonLines } from '@/components/shell/Skeleton';
import { useRoles } from '@/lib/useRoles';

interface Props {
  token: string;
  params: AnalyticsQueryParams;
  isAdmin: boolean;
}

export default function WorkersSection({ token, params, isAdmin }: Props) {
  // Role display names from the rbac_roles single source of truth (M40).
  const { labelFor: roleLabel } = useRoles();
  const [rows, setRows] = useState<WorkerPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchWorkerPerformance(token, params)
      .then(d => { if (alive) { setRows(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, JSON.stringify(params)]);

  if (loading) return <SkeletonLines lines={6} />;
  if (error) return <div className="rp-error">{error}</div>;

  if (!isAdmin) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true"><Lock size={22} /></div>
          <div className="empty-state-text">Worker performance data is available to administrators only.</div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true"><UsersRound size={22} /></div>
          <div className="empty-state-text">No worker data for the selected filters.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Worker Performance</h2>
        <span className="an-null">{rows.length} worker{rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="wf-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Role</th>
              <th style={{ textAlign: 'right' }}>Assigned</th>
              <th style={{ textAlign: 'right' }}>Completed</th>
              <th style={{ textAlign: 'right' }}>Pending</th>
              <th style={{ textAlign: 'right' }}>Overdue</th>
              <th style={{ minWidth: 140 }}>Rate</th>
              <th style={{ textAlign: 'right' }}>Avg (h)</th>
              <th style={{ textAlign: 'right' }}>Escalations</th>
              <th style={{ textAlign: 'right' }}>Retries</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.username}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.fullName}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{r.username}</div>
                </td>
                <td>
                  <span className="pill pill-low">{roleLabel(r.role)}</span>
                </td>
                <td style={{ textAlign: 'right' }}>{r.assigned.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }} className="an-hi-green">{r.completed.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{r.pending.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }} className={r.overdue > 0 ? 'an-hi-red' : ''}>
                  {r.overdue.toLocaleString()}
                </td>
                <td>
                  <div className="an-rate">
                    <span className="an-rate-pct">{r.completionRate}%</span>
                    <span className="an-rate-bar">
                      <ProgressBar
                        value={r.completionRate}
                        color={r.completionRate >= 80 ? '#15803d' : r.completionRate >= 50 ? '#d97706' : '#b91c1c'}
                      />
                    </span>
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {r.averageResponseHours != null ? r.averageResponseHours : <span className="an-null">—</span>}
                </td>
                <td style={{ textAlign: 'right' }} className={r.escalations > 0 ? 'an-hi-amber' : ''}>
                  {r.escalations.toLocaleString()}
                </td>
                <td style={{ textAlign: 'right' }}>{r.retries.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
