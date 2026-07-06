'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, GraduationCap, HelpCircle, Search } from 'lucide-react';
import {
  searchKnowledge,
  type KnowledgeSearchHit,
  type KnowledgeSearchResult,
} from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * Reusable unified knowledge search. Queries across FAQs, Training and Guidebooks
 * (Emergency) in one call and shows results grouped by type. Debounced; results
 * appear in a panel below the input.
 */
export default function KnowledgeSearch() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<KnowledgeSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      const token = getToken();
      if (!token) return;
      searchKnowledge(token, q)
        .then((r) => setResult(r))
        .catch(() => setResult(null))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const groups: { label: string; icon: ReactNode; hits: KnowledgeSearchHit[] }[] = result
    ? [
        { label: 'FAQs', icon: <HelpCircle size={14} />, hits: result.faqs },
        { label: 'Training', icon: <GraduationCap size={14} />, hits: result.training },
        { label: 'Guidebooks & Emergency', icon: <BookOpen size={14} />, hits: result.guidebooks },
      ]
    : [];

  const total = result ? result.faqs.length + result.training.length + result.guidebooks.length : 0;

  return (
    <div className="kh-globalsearch">
      <div className="wl-filter-search kh-globalsearch-input">
        <span className="wl-filter-search-icon" aria-hidden="true"><Search size={14} /></span>
        <input
          className="wl-filter-search-input"
          placeholder="Search all knowledge — FAQs, training, guidebooks, emergency…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="kh-globalsearch-clear" aria-label="Clear" onClick={() => setQuery('')}>×</button>
        )}
      </div>

      {query.trim().length >= 2 && (
        <div className="kh-results">
          {loading ? (
            <div className="kh-results-empty">Searching…</div>
          ) : total === 0 ? (
            <div className="kh-results-empty">No matches for “{query.trim()}”.</div>
          ) : (
            groups
              .filter((g) => g.hits.length > 0)
              .map((g) => (
                <div key={g.label} className="kh-results-group">
                  <div className="kh-results-group-title">
                    <span aria-hidden="true">{g.icon}</span> {g.label}
                    <span className="kh-chip-count">{g.hits.length}</span>
                  </div>
                  {g.hits.map((h) => (
                    <div key={h.id} className="kh-result">
                      <div className="kh-result-title">{h.title}</div>
                      {h.snippet && <div className="kh-result-snippet">{h.snippet}</div>}
                      {h.category && <span className="kh-badge">{h.category}</span>}
                    </div>
                  ))}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
