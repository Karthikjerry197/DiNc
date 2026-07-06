'use client';

import { useMemo, useState } from 'react';
import { Inbox, Search } from 'lucide-react';
import type { GuidebookListItem } from '@/lib/api';
import { categoryIcon, categoryLabel } from './category';

interface GuidebookListProps {
  guidebooks: GuidebookListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Left panel: searchable, scrollable list of guidebook/protocol cards. */
export default function GuidebookList({
  guidebooks,
  selectedId,
  onSelect,
}: GuidebookListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guidebooks;
    return guidebooks.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q) ||
        g.code.toLowerCase().includes(q),
    );
  }, [guidebooks, query]);

  return (
    <aside className="gb-list">
      <div className="gb-list-head">
        <h2 className="cz-panel-title">Clinical Guidebook</h2>
        <span className="cz-count">{filtered.length}</span>
      </div>

      <div className="gb-list-controls">
        <div className="cz-search gb-list-search">
          <span className="cz-search-icon" aria-hidden="true"><Search size={14} /></span>
          <input
            type="text"
            className="cz-search-input"
            placeholder="Search guidebooks…"
            aria-label="Search guidebooks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="gb-cards">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
            <div className="empty-state-text">
              {guidebooks.length === 0 ? 'No guidebooks on record.' : 'No matches.'}
            </div>
          </div>
        ) : (
          filtered.map((guidebook) => (
            <button
              key={guidebook.id}
              type="button"
              className={`gb-card${guidebook.id === selectedId ? ' active' : ''}`}
              onClick={() => onSelect(guidebook.id)}
            >
              <span className="gb-card-icon" aria-hidden="true">
                {categoryIcon(guidebook.category)}
              </span>
              <span className="gb-card-body">
                <span className="gb-card-category">{categoryLabel(guidebook.category)}</span>
                <span className="gb-card-title">{guidebook.title}</span>
                {guidebook.summary && (
                  <span className="gb-card-desc">{guidebook.summary}</span>
                )}
                <span className="gb-card-badges">
                  <span
                    className={`pill ${guidebook.status === 'Active' ? 'pill-completed' : 'pill-low'}`}
                  >
                    {guidebook.status}
                  </span>
                  <span className="gb-card-code">{guidebook.code}</span>
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
