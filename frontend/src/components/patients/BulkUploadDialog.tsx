'use client';

import { useEffect, useState } from 'react';
import {
  bulkUploadCitizens,
  type BulkUploadResult,
  type CreateCitizenPayload,
} from '@/lib/api';
import { getToken } from '@/lib/session';

interface BulkUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: (result: BulkUploadResult) => void;
}

const HEADER_ALIASES: Record<string, keyof CreateCitizenPayload> = {
  uhid: 'uhid',
  full_name: 'fullName',
  fullname: 'fullName',
  name: 'fullName',
  age: 'age',
  gender: 'gender',
  sex: 'gender',
  phone: 'phone',
  mobile: 'phone',
  district: 'district',
};

/** Splits one CSV line, honouring simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parses CSV text into validated patient payloads + parse warnings. */
function parseCsv(text: string): { rows: CreateCitizenPayload[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], warnings: ['Provide a header row and at least one patient row.'] };
  }
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: CreateCitizenPayload[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const rec: Partial<CreateCitizenPayload> = {};
    headers.forEach((h, idx) => {
      const field = HEADER_ALIASES[h];
      const raw = (cells[idx] ?? '').trim();
      if (!field || !raw) return;
      if (field === 'age') {
        const n = Number(raw);
        if (Number.isFinite(n)) rec.age = n;
      } else {
        rec[field] = raw as never;
      }
    });
    if (!rec.uhid || !rec.fullName) {
      warnings.push(`Row ${i + 1} skipped: UHID and name are required.`);
      continue;
    }
    rows.push(rec as CreateCitizenPayload);
  }
  return { rows, warnings };
}

/**
 * Bulk Upload dialog — the SINGLE implementation reused everywhere. Parses a CSV
 * (file or pasted text) client-side into the same per-patient shape used by single
 * registration, then submits them and shows a created/skipped/errors summary.
 */
export default function BulkUploadDialog({ open, onClose, onUploaded }: BulkUploadDialogProps) {
  const [text, setText] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parsedCount, setParsedCount] = useState(0);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setText('');
    setWarnings([]);
    setParsedCount(0);
    setResult(null);
    setError('');
  }, [open]);

  if (!open) return null;

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  async function handleUpload() {
    setError('');
    setResult(null);
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    const { rows, warnings: w } = parseCsv(text);
    setWarnings(w);
    setParsedCount(rows.length);
    if (rows.length === 0) {
      setError('No valid patient rows found. Check the format and required columns.');
      return;
    }
    setSaving(true);
    try {
      const res = await bulkUploadCitizens(token, rows);
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
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-upload-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="bulk-upload-title" className="modal-title">Bulk Upload Patients</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          <p className="dq-dialog-note">
            Upload a CSV with a header row. Recognised columns:{' '}
            <code>uhid, full_name, age, gender, phone, district</code>. <code>uhid</code> and{' '}
            <code>full_name</code> are required; duplicate UHIDs are skipped.
          </p>

          <div className="fg">
            <label className="fl" htmlFor="bu-file">CSV File</label>
            <input
              id="bu-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="fc"
              disabled={saving}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          <div className="fg">
            <label className="fl" htmlFor="bu-text">Or paste CSV</label>
            <textarea
              id="bu-text"
              className="fc modal-textarea bu-textarea"
              placeholder={'uhid,full_name,age,gender,phone,district\nASSAM-2026-09001,Asha Devi,34,Female,9876543210,Kamrup'}
              value={text}
              disabled={saving}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {warnings.length > 0 && (
            <div className="bu-warnings">
              {warnings.slice(0, 8).map((w, i) => <div key={i}>⚠ {w}</div>)}
              {warnings.length > 8 && <div>…and {warnings.length - 8} more.</div>}
            </div>
          )}

          {result && (
            <div className="bu-result">
              <div className="bu-result-row">
                <span className="bu-stat bu-ok">{result.created} created</span>
                <span className="bu-stat bu-skip">{result.skipped} skipped (duplicate)</span>
                <span className="bu-stat bu-err">{result.errors.length} errors</span>
                <span className="bu-stat">of {result.total} rows</span>
              </div>
              {result.errors.slice(0, 6).map((e, i) => (
                <div key={i} className="bu-err-line">✗ {e.uhid ?? '(no uhid)'}: {e.reason}</div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            {result ? 'Done' : 'Cancel'}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleUpload} disabled={saving || !text.trim()}>
            {saving ? 'Uploading…' : parsedCount > 0 ? 'Upload Again' : 'Upload Patients'}
          </button>
        </div>
      </div>
    </div>
  );
}
