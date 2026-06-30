'use client';

import { useEffect, useState } from 'react';
import { createFaq, updateFaq, type KnowledgeFaq } from '@/lib/api';
import { getToken } from '@/lib/session';

interface FaqEditorDialogProps {
  /** When provided, the dialog edits this FAQ; otherwise it creates a new one. */
  faq: KnowledgeFaq | null;
  open: boolean;
  knownCategories: string[];
  onClose: () => void;
  onSaved: () => void;
}

/** Admin dialog to add or edit an FAQ (reuses one form for both). */
export default function FaqEditorDialog({
  faq,
  open,
  knownCategories,
  onClose,
  onSaved,
}: FaqEditorDialogProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuestion(faq?.question ?? '');
    setAnswer(faq?.answer ?? '');
    setCategory(faq?.category ?? '');
    setError('');
  }, [open, faq]);

  if (!open) return null;

  async function handleSave() {
    setError('');
    const token = getToken();
    if (!token) return setError('Your session has expired. Please sign in again.');
    if (!question.trim() || !answer.trim()) return setError('Question and answer are required.');
    setSaving(true);
    try {
      const payload = { question: question.trim(), answer: answer.trim(), category: category.trim() || undefined };
      if (faq) await updateFaq(token, faq.id, payload);
      else await createFaq(token, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save FAQ.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="faq-editor-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="faq-editor-title" className="modal-title">{faq ? 'Edit FAQ' : 'Add FAQ'}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={saving}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}
          <div className="fg">
            <label className="fl" htmlFor="faq-cat">Category</label>
            <input id="faq-cat" className="fc" list="faq-cat-list" value={category} disabled={saving}
              placeholder="e.g. General" onChange={(e) => setCategory(e.target.value)} />
            <datalist id="faq-cat-list">
              {knownCategories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="fg">
            <label className="fl" htmlFor="faq-q">Question *</label>
            <textarea id="faq-q" className="fc modal-textarea" value={question} disabled={saving} maxLength={2000}
              onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="faq-a">Answer *</label>
            <textarea id="faq-a" className="fc modal-textarea" style={{ minHeight: 120 }} value={answer} disabled={saving}
              maxLength={8000} onChange={(e) => setAnswer(e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : faq ? 'Save Changes' : 'Add FAQ'}
          </button>
        </div>
      </div>
    </div>
  );
}
