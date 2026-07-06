'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  bulkRegisterPatients,
  fetchRegistrationOptions,
  type BulkPatientRow,
  type BulkRegistrationResult,
  type RegistrationOptions,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { csvTextToGrid } from '@/lib/csv';
import { FileText, TriangleAlert } from 'lucide-react';
import { useDialogA11y } from '@/lib/useDialogA11y';

interface BulkUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: (result: BulkRegistrationResult) => void;
}

const HEADER_ALIASES: Record<string, keyof BulkPatientRow> = {
  uhid: 'uhid',
  full_name: 'fullName',
  fullname: 'fullName',
  name: 'fullName',
  age: 'age',
  gender: 'gender',
  sex: 'gender',
  phone: 'phone',
  mobile: 'phone',
  address: 'address',
  village: 'village',
  district: 'district',
  aadhaar: 'aadhaar',
  programs: 'programs',
  program: 'programs',
};

/** Maps a 2-D cell grid (header row + data rows) to validated patient rows. */
function gridToRows(grid: string[][]): { rows: BulkPatientRow[]; warnings: string[] } {
  const warnings: string[] = [];
  if (grid.length < 2) return { rows: [], warnings: ['Provide a header row and at least one data row.'] };
  const headers = grid[0].map((h) => String(h ?? '').toLowerCase().trim().replace(/\s+/g, '_'));
  const rows: BulkPatientRow[] = [];
  for (let i = 1; i < grid.length; i += 1) {
    const cells = grid[i];
    if (!cells || cells.every((c) => !String(c ?? '').trim())) continue;
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const field = HEADER_ALIASES[h];
      const raw = String(cells[idx] ?? '').trim();
      if (field && raw) rec[field] = raw;
    });
    if (!rec.fullName) {
      warnings.push(`Row ${i + 1} skipped: name is required.`);
      continue;
    }
    rows.push(rec as unknown as BulkPatientRow);
  }
  return { rows, warnings };
}

function parseCsvText(text: string): { rows: BulkPatientRow[]; warnings: string[] } {
  return gridToRows(csvTextToGrid(text));
}

/**
 * Bulk Upload dialog — extends the single registration workflow to many patients
 * from CSV or Excel (.xlsx). Each row is parsed client-side, then registered +
 * enrolled server-side (atomic per row) into either its own `programs` column or
 * the default programs chosen here. Reports a created/duplicate/skipped/failed
 * summary.
 */
export default function BulkUploadDialog({ open, onClose, onUploaded }: BulkUploadDialogProps) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BulkPatientRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [options, setOptions] = useState<RegistrationOptions | null>(null);
  const [defaultProgramIds, setDefaultProgramIds] = useState<string[]>([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [result, setResult] = useState<BulkRegistrationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setText(''); setRows([]); setWarnings([]); setFileName('');
    setDefaultProgramIds([]); setAssignedTo(''); setResult(null); setError('');
    const token = getToken();
    if (token) fetchRegistrationOptions(token).then(setOptions).catch(() => undefined);
  }, [open]);

  const parsedFromText = useMemo(() => (text.trim() ? parseCsvText(text) : null), [text]);

  // Effective rows: a parsed file takes precedence, else live-parsed paste.
  const effective = fileName ? { rows, warnings } : parsedFromText ?? { rows: [], warnings: [] };

  // Shared dialog behaviour: Escape close, focus trap, focus restore (M35C).
  const dialogRef = useDialogA11y(open, () => !saving && onClose());

  if (!open) return null;

  function handleFile(file: File) {
    setFileName(file.name);
    setText('');
    const reader = new FileReader();
    const isExcel = /\.xlsx?$/i.test(file.name);
    reader.onload = () => {
      try {
        if (isExcel) {
          const wb = XLSX.read(reader.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
          const parsed = gridToRows(grid.map((r) => r.map((c) => String(c ?? ''))));
          setRows(parsed.rows); setWarnings(parsed.warnings);
        } else {
          const parsed = parseCsvText(String(reader.result ?? ''));
          setRows(parsed.rows); setWarnings(parsed.warnings);
        }
      } catch {
        setError('Unable to parse the file. Please check the format.');
      }
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  function toggleProgram(id: string) {
    setDefaultProgramIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function handleUpload() {
    if (saving) return;
    setError(''); setResult(null);
    const token = getToken();
    if (!token) return setError('Your session has expired. Please sign in again.');
    if (effective.rows.length === 0) return setError('No valid patient rows found.');
    setSaving(true);
    try {
      const res = await bulkRegisterPatients(token, {
        patients: effective.rows,
        defaultProgramIds: defaultProgramIds.length ? defaultProgramIds : undefined,
        assignedTo: assignedTo || undefined,
      });
      setResult(res);
      onUploaded(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload patients.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div className="modal modal-wide" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="bulk-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="bulk-title" className="modal-title">Bulk Upload Patients</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={saving}>×</button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          <p className="dq-dialog-note">
            Upload <strong>CSV</strong> or <strong>Excel (.xlsx)</strong> with a header row. Columns:{' '}
            <code>uhid, full_name, age, gender, phone, address, village, district, aadhaar, programs</code>.
            Only <code>full_name</code> is required; UHID auto-generates; duplicates are skipped. The{' '}
            <code>programs</code> column (program codes, separated by <code>;</code>) overrides the defaults below.
          </p>

          <div className="modal-row">
            <div className="fg">
              <label className="fl" htmlFor="bu-file">CSV / Excel File</label>
              <input id="bu-file" type="file" accept=".csv,.xlsx,.xls,text/csv" className="fc" disabled={saving}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="bu-worker">Assign Worker (all rows)</label>
              <select id="bu-worker" className="fc" value={assignedTo} disabled={saving}
                onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">— Unassigned —</option>
                {(options?.workers ?? []).map((w) => (
                  <option key={w.username} value={w.username}>{w.fullName} · {w.role}</option>
                ))}
              </select>
            </div>
          </div>

          {!fileName && (
            <div className="fg">
              <label className="fl" htmlFor="bu-text">Or paste CSV</label>
              <textarea id="bu-text" className="fc modal-textarea bu-textarea" value={text} disabled={saving}
                placeholder={'full_name,age,gender,phone,programs\nAsha Devi,34,Female,9876543210,HYPERTENSION;DIABETES'}
                onChange={(e) => setText(e.target.value)} />
            </div>
          )}

          <div className="fg">
            <label className="fl">Default Programs (applied when a row has no programs column)</label>
            {!options ? (
              <div className="dash-loading">Loading programs&hellip;</div>
            ) : (
              <div className="rw-program-grid">
                {options.programs.map((p) => {
                  const checked = defaultProgramIds.includes(p.id);
                  return (
                    <label key={p.id} className={`rw-program${checked ? ' selected' : ''}`}>
                      <input type="checkbox" checked={checked} disabled={saving} onChange={() => toggleProgram(p.id)} />
                      <span className="rw-program-name">{p.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bu-parsed">
            {fileName && <span className="bu-file-name"><FileText size={13} aria-hidden="true" /> {fileName}</span>}
            <span>{effective.rows.length} valid row(s) ready</span>
          </div>

          {effective.warnings.length > 0 && (
            <div className="bu-warnings">
              {effective.warnings.slice(0, 6).map((w, i) => <div key={i}><TriangleAlert size={12} aria-hidden="true" /> {w}</div>)}
              {effective.warnings.length > 6 && <div>…and {effective.warnings.length - 6} more.</div>}
            </div>
          )}

          {result && (
            <div className="bu-result">
              <div className="bu-result-row">
                <span className="bu-stat bu-ok">{result.created} created</span>
                <span className="bu-stat bu-skip">{result.duplicate} duplicate</span>
                <span className="bu-stat bu-skip">{result.skipped} skipped</span>
                <span className="bu-stat bu-err">{result.failed} failed</span>
                <span className="bu-stat">of {result.total}</span>
              </div>
              {result.rows.filter((r) => r.status === 'FAILED' || r.status === 'DUPLICATE').slice(0, 8).map((r) => (
                <div key={r.row} className="bu-err-line">
                  Row {r.row} · {r.fullName ?? '—'} · {r.status}{r.reason ? ` · ${r.reason}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            {result ? 'Done' : 'Cancel'}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleUpload} disabled={saving || effective.rows.length === 0}>
            {saving ? 'Uploading…' : `Upload ${effective.rows.length || ''} Patient(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
