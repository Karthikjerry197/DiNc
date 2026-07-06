'use client';

import { useState } from 'react';
import { createGuidebook, type GuidebookListItem, type ImportGuidebookPayload } from '@/lib/api';
import { getToken } from '@/lib/session';
import { humanizeSectionKey } from './GuidebookTabs';
import { useDialogA11y } from '@/lib/useDialogA11y';

interface ImportProtocolDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (guidebook: GuidebookListItem) => void;
}

/**
 * Validates one parsed JSON guidebook into a clean import payload, or returns an
 * error string. Shared by the single-import and bulk-upload dialogs — there is
 * only one client-side validation path.
 */
export function validateGuidebookJson(
  raw: unknown,
): { payload: ImportGuidebookPayload } | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'The file must contain a single JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const code = str(obj.code);
  const category = str(obj.category);
  const title = str(obj.title);
  if (!code) return { error: '"code" is required.' };
  if (!category) return { error: '"category" is required.' };
  if (!title) return { error: '"title" is required.' };

  if (!obj.sections || typeof obj.sections !== 'object' || Array.isArray(obj.sections)) {
    return { error: '"sections" is required and must be an object.' };
  }

  // Normalize sections to string | string[] (trim, drop empties), preserving order.
  const sections: Record<string, string | string[]> = {};
  for (const [key, val] of Object.entries(obj.sections as Record<string, unknown>)) {
    const k = key.trim();
    if (!k) continue;
    if (typeof val === 'string') {
      if (val.trim()) sections[k] = val.trim();
    } else if (Array.isArray(val)) {
      const items = val
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length > 0) sections[k] = items;
    }
    // Non-string / non-string[] values are ignored (mirrors the backend).
  }
  if (Object.keys(sections).length === 0) {
    return { error: '"sections" must contain at least one text or list section.' };
  }

  const payload: ImportGuidebookPayload = { code, category, title, sections };
  const source = str(obj.source);
  if (source) payload.source = source;
  if (typeof obj.isActive === 'boolean') payload.isActive = obj.isActive;
  return { payload };
}

/**
 * Import Protocol dialog. Upload (or paste) a JSON guidebook, validate it,
 * preview the parsed sections, then import. The imported guidebook renders
 * through the same data-driven path as every other guidebook — no other frontend
 * changes are needed when new section types appear.
 */
export default function ImportProtocolDialog({ open, onClose, onImported }: ImportProtocolDialogProps) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportGuidebookPayload | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, handleClose);

  if (!open) return null;

  function reset() {
    setText('');
    setPreview(null);
    setError('');
  }

  function handleClose() {
    if (importing) return;
    reset();
    onClose();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    setPreview(null);
    setError('');
  }

  function handleValidate() {
    setError('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('The file is not valid JSON.');
      return;
    }
    const result = validateGuidebookJson(parsed);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setPreview(result.payload);
  }

  async function handleImport() {
    if (!preview || importing) return;
    setError('');
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    setImporting(true);
    try {
      const created = await createGuidebook(token, preview);
      reset();
      onImported(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import the guidebook.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={handleClose}>
      <div
        className="modal"
        ref={dialogRef} role="dialog"
        aria-modal="true"
        aria-labelledby="import-protocol-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="import-protocol-title" className="modal-title">Import Protocol</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={handleClose} disabled={importing}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          <div className="dq-dialog-note">
            Upload or paste a guidebook JSON file with <code>code</code>, <code>category</code>,
            <code> title</code> and a <code>sections</code> object. Section names are free-form and
            appear automatically.
          </div>

          {!preview ? (
            <>
              <div className="fg">
                <label className="fl" htmlFor="ip-file">JSON File</label>
                <input id="ip-file" className="fc" type="file" accept="application/json,.json"
                  disabled={importing} onChange={handleFile} />
              </div>
              <div className="fg">
                <label className="fl" htmlFor="ip-text">…or paste JSON</label>
                <textarea id="ip-text" className="fc" rows={10} value={text} disabled={importing}
                  placeholder={'{\n  "code": "GB016",\n  "category": "MATERNAL",\n  "title": "…",\n  "sections": { "summary": "…", "dangerSigns": ["…"] }\n}'}
                  onChange={(e) => { setText(e.target.value); setError(''); }} />
              </div>
            </>
          ) : (
            <div className="ip-preview">
              <div className="ip-preview-head">
                <span className="gb-badge gb-badge-code">{preview.code}</span>
                <span>{preview.title}</span>
                <span className="pill pill-normal">{preview.category}</span>
              </div>
              <div className="fl">Sections to import ({Object.keys(preview.sections).length})</div>
              <ul className="ip-preview-list">
                {Object.entries(preview.sections).map(([key, val]) => (
                  <li key={key}>
                    <strong>{humanizeSectionKey(key)}</strong>
                    <span className="ip-preview-kind">
                      {Array.isArray(val) ? `${val.length} item${val.length === 1 ? '' : 's'}` : 'text'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {preview ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)} disabled={importing}>
                Back
              </button>
              <button type="button" className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? 'Importing…' : 'Import'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={importing}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleValidate} disabled={!text.trim()}>
                Validate &amp; Preview
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
