'use client';

import { useEffect, useState } from 'react';
import {
  fetchRegistrationAnalytics,
  type AnalyticsQueryParams,
  type RegistrationAnalytics,
} from '@/lib/api';
import { BarChart } from './Charts';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface Props {
  token: string;
  params: AnalyticsQueryParams;
}

export default function RegistrationsSection({ token, params }: Props) {
  const [data, setData] = useState<RegistrationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchRegistrationAnalytics(token, params)
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, JSON.stringify(params)]);

  if (loading) return <SkeletonLines lines={6} />;
  if (error) return <div className="rp-error">{error}</div>;
  if (!data) return null;

  const kpis = [
    { label: 'Registered Today', value: data.today, color: '#15803d' },
    { label: 'This Week', value: data.thisWeek, color: '#0284c7' },
    { label: 'This Month', value: data.thisMonth, color: '#7c3aed' },
    { label: 'Duplicates Prevented', value: data.duplicatesPrevented, color: '#d97706' },
  ];

  return (
    <div>
      <div className="stat-grid an-kpi-4" style={{ marginBottom: 16 }}>
        {kpis.map(k => (
          <div className="stat-card" key={k.label}>
            <div className="stat-card-value" style={{ color: k.color }}>
              {k.value == null ? '—' : k.value.toLocaleString()}
            </div>
            <div className="stat-card-label">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="an-chart-row">
        <div className="panel">
          <div className="an-chart-title">Registrations by Program</div>
          {data.byProgram.length > 0 ? (
            <BarChart
              data={data.byProgram.map(d => ({ label: d.name, value: d.count }))}
              color="#24a148"
            />
          ) : (
            <span className="an-null">No enrollment data in range</span>
          )}
        </div>

        <div className="panel">
          <div className="an-chart-title">Registrations by Worker</div>
          {data.byWorker.length > 0 ? (
            <BarChart
              data={data.byWorker.map(d => ({ label: d.name, value: d.count }))}
              color="#0284c7"
            />
          ) : (
            <span className="an-null">No worker-linked enrollments in range</span>
          )}
        </div>
      </div>

      {data.bulkUploads != null && (
        <div className="panel" style={{ marginTop: 0 }}>
          <div style={{ font: '13px/1.6 inherit', color: '#374151' }}>
            <strong>{data.bulkUploads.toLocaleString()}</strong> bulk uploads recorded.
          </div>
        </div>
      )}
    </div>
  );
}
