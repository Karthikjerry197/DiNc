'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchDiseaseAnalytics,
  type AnalyticsQueryParams,
  type DiseaseAnalyticsRow,
} from '@/lib/api';
import { BarChart } from './Charts';
import { Inbox } from 'lucide-react';
import { SkeletonLines } from '@/components/shell/Skeleton';

interface Props {
  token: string;
  params: AnalyticsQueryParams;
}

type SortKey = 'disease' | 'totalPatients' | 'activePatients' | 'completedPatients' | 'highRiskPatients';

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'disease', label: 'Disease', numeric: false },
  { key: 'totalPatients', label: 'Total Patients', numeric: true },
  { key: 'activePatients', label: 'Active', numeric: true },
  { key: 'completedPatients', label: 'Completed', numeric: true },
  { key: 'highRiskPatients', label: 'High Risk', numeric: true },
];

export default function DiseasesSection({ token, params }: Props) {
  const [rows, setRows] = useState<DiseaseAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalPatients');
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError('');
    fetchDiseaseAnalytics(token, params)
      .then(d => { if (alive) { setRows(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'Unable to load.'); setLoading(false); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, JSON.stringify(params)]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = sortKey === 'disease'
        ? a.disease.localeCompare(b.disease)
        : a[sortKey] - b[sortKey];
      return sortDesc ? -cmp : cmp;
    });
    return copy;
  }, [rows, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDesc(d => !d);
    } else {
      setSortKey(key);
      setSortDesc(key !== 'disease'); // numbers default high→low, names A→Z
    }
  };

  if (loading) return <SkeletonLines lines={6} />;
  if (error) return <div className="rp-error">{error}</div>;

  if (rows.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
          <div className="empty-state-text">No disease data for the selected filters.</div>
        </div>
      </div>
    );
  }

  const chartData = sorted
    .filter(r => r.totalPatients > 0)
    .slice(0, 12)
    .map(r => ({ label: r.disease, value: r.totalPatients }));

  return (
    <div>
      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Disease Analytics</h2>
          <span className="an-null">{rows.length} disease{rows.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="wf-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    style={{ textAlign: col.numeric ? 'right' : 'left', cursor: 'pointer', userSelect: 'none' }}
                    aria-sort={sortKey === col.key ? (sortDesc ? 'descending' : 'ascending') : 'none'}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}{sortKey === col.key ? (sortDesc ? ' ▼' : ' ▲') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.diseaseId}>
                  <td style={{ fontWeight: 600 }}>{r.disease}</td>
                  <td style={{ textAlign: 'right' }}>{r.totalPatients.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{r.activePatients.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }} className="an-hi-green">{r.completedPatients.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }} className={r.highRiskPatients > 0 ? 'an-hi-red' : ''}>
                    {r.highRiskPatients.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="an-chart-title">Patients by Disease</div>
        {chartData.length > 0 ? (
          <BarChart data={chartData} color="#0284c7" />
        ) : (
          <span className="an-null">No patients enrolled yet</span>
        )}
      </div>
    </div>
  );
}
