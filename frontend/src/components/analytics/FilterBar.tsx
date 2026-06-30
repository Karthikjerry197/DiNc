'use client';

import type { AnalyticsFilterOptions, AnalyticsQueryParams } from '@/lib/api';

interface FilterBarProps {
  params: AnalyticsQueryParams;
  options: AnalyticsFilterOptions | null;
  isAdmin: boolean;
  onChange: (p: AnalyticsQueryParams) => void;
  onReset: () => void;
}

export default function FilterBar({ params, options, isAdmin, onChange, onReset }: FilterBarProps) {
  function set(key: keyof AnalyticsQueryParams, value: string) {
    onChange({ ...params, [key]: value || undefined });
  }

  return (
    <div className="rp-filter-bar panel">
      <div className="rp-filter-row">
        <div className="rp-filter-field">
          <label className="rp-filter-label">From</label>
          <input
            type="date"
            className="rp-filter-input"
            value={params.from ?? ''}
            onChange={e => set('from', e.target.value)}
          />
        </div>
        <div className="rp-filter-field">
          <label className="rp-filter-label">To</label>
          <input
            type="date"
            className="rp-filter-input"
            value={params.to ?? ''}
            onChange={e => set('to', e.target.value)}
          />
        </div>
        <div className="rp-filter-field">
          <label className="rp-filter-label">Program</label>
          <select
            className="rp-filter-input"
            value={params.programId ?? ''}
            onChange={e => set('programId', e.target.value)}
          >
            <option value="">All Programs</option>
            {options?.programs.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="rp-filter-field">
          <label className="rp-filter-label">Condition</label>
          <select
            className="rp-filter-input"
            value={params.diseaseId ?? ''}
            onChange={e => set('diseaseId', e.target.value)}
          >
            <option value="">All Conditions</option>
            {options?.diseases.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="rp-filter-field">
          <label className="rp-filter-label">District</label>
          <select
            className="rp-filter-input"
            value={params.district ?? ''}
            onChange={e => set('district', e.target.value)}
          >
            <option value="">All Districts</option>
            {options?.districts.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        {isAdmin && (
          <div className="rp-filter-field">
            <label className="rp-filter-label">Worker</label>
            <select
              className="rp-filter-input"
              value={params.worker ?? ''}
              onChange={e => set('worker', e.target.value)}
            >
              <option value="">All Workers</option>
              {options?.workers.map(w => (
                <option key={w.username} value={w.username}>{w.fullName}</option>
              ))}
            </select>
          </div>
        )}
        <div className="rp-filter-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
            ↺ Reset
          </button>
        </div>
      </div>
    </div>
  );
}
