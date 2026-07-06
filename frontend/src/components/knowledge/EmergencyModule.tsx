'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchEmergencyProtocols, type EmergencyProtocol } from '@/lib/api';
import { getToken } from '@/lib/session';
import { Inbox, Search, Siren } from 'lucide-react';

/** Friendly labels for the guidebook category codes used as protocol groups. */
const CATEGORY_LABELS: Record<string, string> = {
  EMERGENCY: 'Emergency & First Aid',
  MATERNAL: 'Maternal',
  CHILD: 'Child Health',
  COMMUNICABLE: 'Communicable Diseases',
  MENTAL_HEALTH: 'Mental Health',
  HYPERTENSION: 'Hypertension',
  DIABETES: 'Diabetes',
  RENAL: 'Renal',
  ELDERLY: 'Elderly Care',
  GENERAL: 'General',
};

function label(code: string): string {
  return CATEGORY_LABELS[code] ?? code.replace(/_/g, ' ');
}

/**
 * Emergency Knowledge — large protocol cards grouped by category, built from the
 * structured guidebook records (Recognition / Immediate management / Referral /
 * Notes). Content is loaded dynamically; sections render only when present.
 */
export default function EmergencyModule() {
  const [protocols, setProtocols] = useState<EmergencyProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) return setLoading(false);
    fetchEmergencyProtocols(token)
      .then((p) => { setProtocols(p); setLoading(false); })
      .catch((err) => { setError(err instanceof Error ? err.message : 'Unable to load protocols.'); setLoading(false); });
  }, []);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = protocols.filter(
      (p) => !q || p.title.toLowerCase().includes(q) || (p.recognition ?? '').toLowerCase().includes(q),
    );
    const groups = new Map<string, EmergencyProtocol[]>();
    for (const p of matched) {
      const arr = groups.get(p.category) ?? [];
      arr.push(p);
      groups.set(p.category, arr);
    }
    return Array.from(groups.entries());
  }, [protocols, search]);

  return (
    <div>
      <div className="kh-toolbar">
        <div className="wl-filter-search kh-search">
          <span className="wl-filter-search-icon" aria-hidden="true"><Search size={14} /></span>
          <input className="wl-filter-search-input" placeholder="Search emergency protocols…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {loading ? (
        <div className="dash-loading">Loading protocols&hellip;</div>
      ) : grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
          <div className="empty-state-text">No protocols match your search.</div>
        </div>
      ) : (
        grouped.map(([category, items]) => (
          <section key={category} className="kh-emer-group">
            <h2 className="kh-emer-group-title">
              {category === 'EMERGENCY' && <span aria-hidden="true"><Siren size={14} /> </span>}
              {label(category)}
              <span className="kh-emer-group-count">{items.length}</span>
            </h2>
            <div className="kh-emer-grid">
              {items.map((p) => (
                <article key={p.id} className={`kh-emer-card${p.category === 'EMERGENCY' ? ' urgent' : ''}`}>
                  <div className="kh-emer-card-head">
                    <h3 className="kh-emer-card-title">{p.title}</h3>
                    <span className="kh-badge mono">{p.code}</span>
                  </div>
                  {p.recognition && (
                    <div className="kh-emer-section">
                      <div className="kh-emer-label">Recognition</div>
                      <p>{p.recognition}</p>
                    </div>
                  )}
                  {p.immediateManagement.length > 0 && (
                    <div className="kh-emer-section">
                      <div className="kh-emer-label">Immediate Management</div>
                      <ol className="kh-emer-list">
                        {p.immediateManagement.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </div>
                  )}
                  {p.referralCriteria.length > 0 && (
                    <div className="kh-emer-section">
                      <div className="kh-emer-label">Referral Criteria</div>
                      <ul className="kh-emer-list">
                        {p.referralCriteria.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {p.notes && (
                    <div className="kh-emer-section">
                      <div className="kh-emer-label">Notes</div>
                      <p className="kh-emer-notes">{p.notes}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
