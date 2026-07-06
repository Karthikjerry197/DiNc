'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  bulkImportGuidebooks,
  type BulkGuidebookImportResult,
  type ImportGuidebookPayload,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { csvTextToGrid } from '@/lib/csv';
import { validateGuidebookJson } from './ImportProtocolDialog';
import { FileText, TriangleAlert } from 'lucide-react';
import { useDialogA11y } from '@/lib/useDialogA11y';

interface BulkUploadProtocolsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after an upload that created at least one guidebook. */
  onUploaded: (result: BulkGuidebookImportResult) => void;
}

/** One guidebook parsed from the uploaded file: a ready payload or an error. */
interface ParsedEntry {
  code: string;
  title: string;
  sectionCount: number;
  payload?: ImportGuidebookPayload;
  error?: string;
}

/**
 * Validates a parsed JSON document (single guidebook object or an array of
 * them) through the shared single-import validator — one validation path.
 */
function entriesFromJson(raw: unknown): ParsedEntry[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((item, i) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    const code = typeof obj.code === 'string' ? obj.code.trim() : '';
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const result = validateGuidebookJson(item);
    if ('error' in result) {
      return { code: code || `#${i + 1}`, title, sectionCount: 0, error: result.error };
    }
    return {
      code: result.payload.code,
      title: result.payload.title,
      sectionCount: Object.keys(result.payload.sections).length,
      payload: result.payload,
    };
  });
}

const CSV_HEADERS = ['code', 'category', 'title', 'source', 'section', 'content'] as const;

/**
 * Assembles guidebooks from a CSV/Excel grid, then validates each through the
 * same shared validator. Expected columns: code, category, title, source,
 * section, content. One row per section entry; rows sharing (code, section)
 * accumulate into an ordered list; a section with a single row becomes text.
 */
function entriesFromGrid(grid: string[][]): { entries: ParsedEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  if (grid.length < 2) {
    return { entries: [], warnings: ['Provide a header row and at least one data row.'] };
  }
  const headers = grid[0].map((h) => String(h ?? '').toLowerCase().trim().replace(/\s+/g, '_'));
  const col: Partial<Record<(typeof CSV_HEADERS)[number], number>> = {};
  CSV_HEADERS.forEach((name) => {
    const idx = headers.indexOf(name);
    if (idx >= 0) col[name] = idx;
  });
  if (col.code === undefined || col.section === undefined || col.content === undefined) {
    return { entries: [], warnings: ['The header row must include at least: code, section, content.'] };
  }

  interface Draft {
    category: string;
    title: string;
    source: string;
    sections: Map<string, string[]>;
  }
  const drafts = new Map<string, Draft>();
  const cell = (cells: string[], idx: number | undefined) =>
    idx === undefined ? '' : String(cells[idx] ?? '').trim();

  for (let i = 1; i < grid.length; i += 1) {
    const cells = grid[i];
    if (!cells || cells.every((c) => !String(c ?? '').trim())) continue;
    const code = cell(cells, col.code);
    const section = cell(cells, col.section);
    const content = cell(cells, col.content);
    if (!code) {
      warnings.push(`Row ${i + 1} skipped: code is required.`);
      continue;
    }
    let draft = drafts.get(code);
    if (!draft) {
      draft = {
        category: cell(cells, col.category),
        title: cell(cells, col.title),
        source: cell(cells, col.source),
        sections: new Map(),
      };
      drafts.set(code, draft);
    }
    // Later rows may fill metadata the first row left blank.
    if (!draft.category) draft.category = cell(cells, col.category);
    if (!draft.title) draft.title = cell(cells, col.title);
    if (!draft.source) draft.source = cell(cells, col.source);
    if (!section || !content) {
      warnings.push(`Row ${i + 1} skipped: section and content are required.`);
      continue;
    }
    const items = draft.sections.get(section) ?? [];
    items.push(content);
    draft.sections.set(section, items);
  }

  const entries = Array.from(drafts.entries()).map(([code, draft]) => {
    const sections: Record<string, string | string[]> = {};
    draft.sections.forEach((items, name) => {
      sections[name] = items.length === 1 ? items[0] : items;
    });
    const raw = {
      code,
      category: draft.category,
      title: draft.title,
      source: draft.source || undefined,
      sections,
    };
    const result = validateGuidebookJson(raw);
    if ('error' in result) {
      return { code, title: draft.title, sectionCount: 0, error: result.error };
    }
    return {
      code: result.payload.code,
      title: result.payload.title,
      sectionCount: Object.keys(result.payload.sections).length,
      payload: result.payload,
    };
  });
  return { entries, warnings };
}

function parseText(text: string): { entries: ParsedEntry[]; warnings: string[] } {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { entries: entriesFromJson(JSON.parse(trimmed)), warnings: [] };
    } catch {
      return { entries: [], warnings: ['The pasted text is not valid JSON.'] };
    }
  }
  return entriesFromGrid(csvTextToGrid(text));
}

/**
 * Bulk Upload dialog for guidebooks. JSON is the primary format (an array of
 * guidebook objects — the same shape as single import); CSV / Excel is the
 * secondary format (one row per section entry). Every guidebook is validated
 * client-side through the shared validator, previewed, then imported through
 * the single bulk endpoint with a per-guidebook result report.
 */
export default function BulkUploadProtocolsDialog({
  open,
  onClose,
  onUploaded,
}: BulkUploadProtocolsDialogProps) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileParsed, setFileParsed] = useState<{ entries: ParsedEntry[]; warnings: string[] } | null>(null);
  const [result, setResult] = useState<BulkGuidebookImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pasted = useMemo(() => (text.trim() ? parseText(text) : null), [text]);
  const parsed = fileParsed ?? pasted ?? { entries: [], warnings: [] };
  const ready = parsed.entries.filter((e) => e.payload);
  const invalid = parsed.entries.filter((e) => e.error);

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, handleClose);

  if (!open) return null;

  function reset() {
    setText('');
    setFileName('');
    setFileParsed(null);
    setResult(null);
    setError('');
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setText('');
    setResult(null);
    setError('');
    const reader = new FileReader();
    const isExcel = /\.xlsx?$/i.test(file.name);
    const isJson = /\.json$/i.test(file.name);
    reader.onload = () => {
      try {
        if (isExcel) {
          const wb = XLSX.read(reader.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
          setFileParsed(entriesFromGrid(grid.map((r) => r.map((c) => String(c ?? '')))));
        } else if (isJson) {
          setFileParsed({ entries: entriesFromJson(JSON.parse(String(reader.result ?? ''))), warnings: [] });
        } else {
          setFileParsed(entriesFromGrid(csvTextToGrid(String(reader.result ?? ''))));
        }
      } catch {
        setFileParsed(null);
        setError('Unable to parse the file. Please check the format.');
      }
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  async function handleUpload() {
    if (saving) return;
    setError('');
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    if (ready.length === 0) {
      setError('No valid guidebooks to import.');
      return;
    }
    setSaving(true);
    try {
      const res = await bulkImportGuidebooks(token, ready.map((e) => e.payload!));
      setResult(res);
      if (res.created > 0) onUploaded(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import the guidebooks.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={handleClose}>
      <div
        className="modal modal-wide"
        ref={dialogRef} role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-protocols-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="bulk-protocols-title" className="modal-title">Bulk Upload Protocols</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={handleClose} disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          <p className="dq-dialog-note">
            Upload <strong>JSON</strong> (an array of guidebooks — same shape as single import) or{' '}
            <strong>CSV / Excel</strong> with columns{' '}
            <code>code, category, title, source, section, content</code> (one row per section entry;
            rows with the same code and section build an ordered list). Duplicate codes are reported
            and skipped, never overwritten.
          </p>

          <div className="fg">
            <label className="fl" htmlFor="bp-file">JSON / CSV / Excel File</label>
            <input
              id="bp-file"
              type="file"
              accept=".json,.csv,.xlsx,.xls,application/json,text/csv"
              className="fc"
              disabled={saving}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {!fileName && (
            <div className="fg">
              <label className="fl" htmlFor="bp-text">Or paste JSON / CSV</label>
              <textarea
                id="bp-text"
                className="fc"
                rows={7}
                value={text}
                disabled={saving}
                placeholder={'[\n  { "code": "GB016", "category": "MATERNAL", "title": "…", "sections": { "summary": "…" } },\n  { "code": "GB017", … }\n]'}
                onChange={(e) => { setText(e.target.value); setResult(null); setError(''); }}
              />
            </div>
          )}

          <div className="bu-parsed">
            {fileName && <span className="bu-file-name"><FileText size={13} aria-hidden="true" /> {fileName}</span>}
            <span>
              {ready.length} guidebook(s) ready
              {invalid.length > 0 ? ` · ${invalid.length} with errors` : ''}
            </span>
          </div>

          {parsed.entries.length > 0 && (
            <ul className="ip-preview-list">
              {parsed.entries.map((entry, i) => (
                <li key={`${entry.code}-${i}`}>
                  <span>
                    <strong>{entry.code}</strong>
                    {entry.title ? ` · ${entry.title}` : ''}
                  </span>
                  {entry.error ? (
                    <span className="ip-preview-kind bp-entry-error"><TriangleAlert size={12} aria-hidden="true" /> {entry.error}</span>
                  ) : (
                    <span className="ip-preview-kind">
                      {entry.sectionCount} section{entry.sectionCount === 1 ? '' : 's'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {parsed.warnings.length > 0 && (
            <div className="bu-warnings">
              {parsed.warnings.slice(0, 6).map((w, i) => <div key={i}><TriangleAlert size={12} aria-hidden="true" /> {w}</div>)}
              {parsed.warnings.length > 6 && <div>…and {parsed.warnings.length - 6} more.</div>}
            </div>
          )}

          {result && (
            <div className="bu-result">
              <div className="bu-result-row">
                <span className="bu-stat bu-ok">{result.created} created</span>
                <span className="bu-stat bu-skip">{result.duplicate} duplicate</span>
                <span className="bu-stat bu-err">{result.failed} failed</span>
                <span className="bu-stat">of {result.total}</span>
              </div>
              {result.rows
                .filter((r) => r.status !== 'CREATED')
                .slice(0, 8)
                .map((r) => (
                  <div key={r.row} className="bu-err-line">
                    {r.code ?? `Row ${r.row}`} · {r.status === 'DUPLICATE' ? 'Duplicate' : 'Failed'}
                    {r.reason ? ` · ${r.reason}` : ''}
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={saving}>
            {result ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={saving || ready.length === 0 || !!result}
          >
            {saving ? 'Importing…' : `Import ${ready.length || ''} Guidebook(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
