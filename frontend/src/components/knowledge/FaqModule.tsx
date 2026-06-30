'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteFaq,
  fetchFaqs,
  type CategoryCount,
  type KnowledgeFaq,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import FaqEditorDialog from './FaqEditorDialog';

interface FaqModuleProps {
  isAdmin: boolean;
  onToast: (message: string) => void;
}

/**
 * FAQ module — searchable, category-chipped accordion. All content is loaded
 * dynamically from the faqs table; administrators can add/edit/delete.
 */
export default function FaqModule({ isAdmin, onToast }: FaqModuleProps) {
  const [faqs, setFaqs] = useState<KnowledgeFaq[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<KnowledgeFaq | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) return setLoading(false);
    setLoading(true);
    fetchFaqs(token)
      .then((data) => { setFaqs(data.faqs); setCategories(data.categories); setError(''); setLoading(false); })
      .catch((err) => { setError(err instanceof Error ? err.message : 'Unable to load FAQs.'); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return faqs.filter((f) => {
      if (activeCategory && (f.category ?? 'Uncategorised') !== activeCategory) return false;
      if (!q) return true;
      return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
    });
  }, [faqs, search, activeCategory]);

  async function handleDelete(faq: KnowledgeFaq) {
    const token = getToken();
    if (!token) return;
    if (!window.confirm(`Delete this FAQ?\n\n${faq.question}`)) return;
    try {
      await deleteFaq(token, faq.id);
      onToast('FAQ deleted.');
      load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to delete FAQ.');
    }
  }

  return (
    <div>
      <div className="kh-toolbar">
        <div className="wl-filter-search kh-search">
          <span className="wl-filter-search-icon" aria-hidden="true">🔍</span>
          <input className="wl-filter-search-input" placeholder="Search FAQs…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            ＋ Add FAQ
          </button>
        )}
      </div>

      <div className="kh-chips">
        <button type="button" className={`kh-chip${activeCategory === null ? ' active' : ''}`} onClick={() => setActiveCategory(null)}>
          All <span className="kh-chip-count">{faqs.length}</span>
        </button>
        {categories.map((c) => (
          <button key={c.name} type="button" className={`kh-chip${activeCategory === c.name ? ' active' : ''}`}
            onClick={() => setActiveCategory(c.name)}>
            {c.name} <span className="kh-chip-count">{c.count}</span>
          </button>
        ))}
      </div>

      {error && <div className="dash-error">{error}</div>}

      {loading ? (
        <div className="dash-loading">Loading FAQs&hellip;</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">∅</div>
          <div className="empty-state-text">No FAQs match your search.</div>
        </div>
      ) : (
        <div className="kh-accordion">
          {filtered.map((faq) => {
            const open = openId === faq.id;
            return (
              <div key={faq.id} className={`kh-acc-item${open ? ' open' : ''}`}>
                <button type="button" className="kh-acc-head" aria-expanded={open}
                  onClick={() => setOpenId(open ? null : faq.id)}>
                  <span className="kh-acc-q">{faq.question}</span>
                  <span className="kh-acc-meta">
                    {faq.category && <span className="kh-badge">{faq.category}</span>}
                    <span className="kh-acc-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                  </span>
                </button>
                {open && (
                  <div className="kh-acc-body">
                    <p className="kh-acc-answer">{faq.answer}</p>
                    {isAdmin && (
                      <div className="kh-acc-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(faq); setEditorOpen(true); }}>Edit</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(faq)}>Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FaqEditorDialog
        faq={editing}
        open={editorOpen}
        knownCategories={categories.map((c) => c.name)}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); onToast(editing ? 'FAQ updated.' : 'FAQ added.'); load(); }}
      />
    </div>
  );
}
