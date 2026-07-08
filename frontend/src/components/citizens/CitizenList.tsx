'use client';

import { memo, useMemo, useState } from 'react';
import { Inbox, Search } from 'lucide-react';
import type { CitizenListItem } from '@/lib/api';

interface CitizenListProps {
  citizens: CitizenListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function displayName(citizen: CitizenListItem): string {
  return citizen.fullName?.trim() ? citizen.fullName : citizen.uhid;
}

function avatarText(citizen: CitizenListItem): string {
  const source = citizen.fullName?.trim() || citizen.uhid;
  const parts = source.split(/[\s-]+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return initials || '#';
}

/** Compact programme-count meta shown under the UHID (matches the reference). */
function programMeta(citizen: CitizenListItem): string {
  const n = citizen.programs.length;
  return n === 1 ? '1 enrolled programme' : `${n} enrolled programmes`;
}

/** Short backend-driven risk chip for severe/moderate; null otherwise. */
function riskChip(citizen: CitizenListItem): { label: string; cls: string } | null {
  switch (citizen.riskLevel) {
    case 'SEVERE':   return { label: 'SEV', cls: 'severe' };
    case 'MODERATE': return { label: 'MOD', cls: 'moderate' };
    default:         return null;
  }
}

/** Distinct sorted values across an array field of the citizen list. */
function options(citizens: CitizenListItem[], pick: (c: CitizenListItem) => string[]): string[] {
  return Array.from(new Set(citizens.flatMap(pick))).sort();
}

/**
 * Left panel: searchable, filterable, scrollable list of citizen cards.
 * Memoized: the card list re-renders only when the citizen data or selection
 * changes — not when unrelated workspace panels (detail, activities, toasts)
 * update on the page.
 */
function CitizenList({ citizens, selectedId, onSelect }: CitizenListProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [risk, setRisk] = useState('');
  const [program, setProgram] = useState('');
  const [disease, setDisease] = useState('');
  const [worker, setWorker] = useState('');

  const programOptions = useMemo(() => options(citizens, (c) => c.programs), [citizens]);
  const diseaseOptions = useMemo(() => options(citizens, (c) => c.diseases), [citizens]);
  const workerOptions = useMemo(() => options(citizens, (c) => c.workers), [citizens]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return citizens.filter((c) => {
      if (q && !c.uhid.toLowerCase().includes(q) && !(c.fullName ?? '').toLowerCase().includes(q)) {
        return false;
      }
      if (status && !c.statuses.includes(status)) return false;
      if (risk === 'LOW') {
        if (c.riskLevel === 'SEVERE' || c.riskLevel === 'MODERATE') return false;
      } else if (risk && c.riskLevel !== risk) {
        return false;
      }
      if (program && !c.programs.includes(program)) return false;
      if (disease && !c.diseases.includes(disease)) return false;
      if (worker && !c.workers.includes(worker)) return false;
      return true;
    });
  }, [citizens, query, status, risk, program, disease, worker]);

  return (
    <aside className="cz-list czx-list">
      <div className="cz-list-head">
        <h2 className="cz-panel-title">Patients</h2>
        <span className="cz-count">{filtered.length}</span>
      </div>

      <div className="cz-search">
        <span className="cz-search-icon" aria-hidden="true"><Search size={14} /></span>
        <input
          type="text"
          className="cz-search-input"
          placeholder="Search UHID or name…"
          aria-label="Search citizens"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Live list filters (M33.1) — options derive from the loaded records. */}
      <div className="cz-list-filters">
        <select className="wl-select" value={status} aria-label="Filter by program status"
          onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any Status</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select className="wl-select" value={risk} aria-label="Filter by clinical risk"
          onChange={(e) => setRisk(e.target.value)}>
          <option value="">Any Risk</option>
          <option value="SEVERE">Severe</option>
          <option value="MODERATE">Moderate</option>
          <option value="LOW">Low</option>
        </select>
        <select className="wl-select" value={program} aria-label="Filter by program"
          onChange={(e) => setProgram(e.target.value)}>
          <option value="">Any Program</option>
          {programOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="wl-select" value={disease} aria-label="Filter by disease"
          onChange={(e) => setDisease(e.target.value)}>
          <option value="">Any Disease</option>
          {diseaseOptions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="wl-select" value={worker} aria-label="Filter by care worker"
          onChange={(e) => setWorker(e.target.value)}>
          <option value="">Any Care Worker</option>
          {workerOptions.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      <div className="cz-cards">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
            <div className="empty-state-text">
              {citizens.length === 0 ? 'No citizens on record.' : 'No matches.'}
            </div>
          </div>
        ) : (
          filtered.map((citizen) => {
            const risk = riskChip(citizen);
            return (
              <button
                key={citizen.id}
                type="button"
                className={`cz-card czx-card${citizen.id === selectedId ? ' active' : ''}`}
                onClick={() => onSelect(citizen.id)}
                title={displayName(citizen)}
              >
                <span className="cz-card-avatar" aria-hidden="true">{avatarText(citizen)}</span>
                <span className="cz-card-body">
                  <span className="cz-card-uhid czx-card-uhid">{citizen.uhid}</span>
                  <span className="cz-card-meta">{programMeta(citizen)}</span>
                </span>
                {risk && (
                  <span className={`czx-card-risk czx-risk-${risk.cls}`} title={`${citizen.riskLevel} risk`}>
                    {risk.label}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default memo(CitizenList);
