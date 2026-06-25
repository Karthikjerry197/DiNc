'use client';

import { useMemo, useState } from 'react';
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

function meta(citizen: CitizenListItem): string {
  const bits = [
    citizen.age != null ? `${citizen.age}y` : null,
    citizen.gender,
    citizen.district,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'No demographics on record';
}

/** Left panel: searchable, scrollable list of citizen cards. */
export default function CitizenList({ citizens, selectedId, onSelect }: CitizenListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return citizens;
    return citizens.filter(
      (c) =>
        c.uhid.toLowerCase().includes(q) ||
        (c.fullName ?? '').toLowerCase().includes(q),
    );
  }, [citizens, query]);

  return (
    <aside className="cz-list">
      <div className="cz-list-head">
        <h2 className="cz-panel-title">Patient Records</h2>
        <span className="cz-count">{citizens.length}</span>
      </div>

      <div className="cz-search">
        <span className="cz-search-icon" aria-hidden="true">🔍</span>
        <input
          type="text"
          className="cz-search-input"
          placeholder="Search by UHID or name…"
          aria-label="Search citizens"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="cz-cards">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">∅</div>
            <div className="empty-state-text">
              {citizens.length === 0 ? 'No citizens on record.' : 'No matches.'}
            </div>
          </div>
        ) : (
          filtered.map((citizen) => (
            <button
              key={citizen.id}
              type="button"
              className={`cz-card${citizen.id === selectedId ? ' active' : ''}`}
              onClick={() => onSelect(citizen.id)}
            >
              <span className="cz-card-avatar" aria-hidden="true">{avatarText(citizen)}</span>
              <span className="cz-card-body">
                <span className="cz-card-name">{displayName(citizen)}</span>
                <span className="cz-card-uhid">{citizen.uhid}</span>
                <span className="cz-card-meta">{meta(citizen)}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
