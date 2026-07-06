'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchTrainingModules, type TrainingModule } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Inbox, Search } from 'lucide-react';

function duration(min: number | null): string {
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Training module — dynamic catalogue from training_modules with search +
 * category filter. Each card shows title, category, description and duration, and
 * expands to the module content (structure is future-ready for quizzes).
 */
export default function TrainingCatalogue() {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return setLoading(false);
    fetchTrainingModules(token)
      .then((m) => { setModules(m); setLoading(false); })
      .catch((err) => { setError(err instanceof Error ? err.message : 'Unable to load training.'); setLoading(false); });
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(modules.map((m) => m.category).filter((c): c is string => !!c))).sort(),
    [modules],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules.filter((m) => {
      if (activeCategory && m.category !== activeCategory) return false;
      if (!q) return true;
      return m.title.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q);
    });
  }, [modules, search, activeCategory]);

  return (
    <div>
      <div className="kh-toolbar">
        <div className="wl-filter-search kh-search">
          <span className="wl-filter-search-icon" aria-hidden="true"><Search size={14} /></span>
          <input className="wl-filter-search-input" placeholder="Search training modules…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="kh-chips">
        <button type="button" className={`kh-chip${activeCategory === null ? ' active' : ''}`} onClick={() => setActiveCategory(null)}>
          All <span className="kh-chip-count">{modules.length}</span>
        </button>
        {categories.map((c) => (
          <button key={c} type="button" className={`kh-chip${activeCategory === c ? ' active' : ''}`} onClick={() => setActiveCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      {error && <div className="dash-error">{error}</div>}

      {loading ? (
        <div className="dash-loading">Loading training&hellip;</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
          <div className="empty-state-text">No training modules match your search.</div>
        </div>
      ) : (
        <div className="kh-train-grid">
          {filtered.map((m) => {
            const open = openId === m.id;
            return (
              <div key={m.id} className="kh-train-card">
                <div className="kh-train-top">
                  {m.category && <span className="kh-badge">{m.category}</span>}
                  <span className="kh-train-duration">⏱ {duration(m.durationMinutes)}</span>
                </div>
                <h3 className="kh-train-title">{m.title}</h3>
                <p className="kh-train-desc">{m.description ?? 'No description provided.'}</p>
                <div className="kh-train-foot">
                  <span className="kh-train-code mono">{m.code}</span>
                  {m.content && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenId(open ? null : m.id)}>
                      {open ? 'Hide' : 'View Module'}
                    </button>
                  )}
                </div>
                {open && m.content && <div className="kh-train-content">{m.content}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
