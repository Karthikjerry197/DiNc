'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  checkDuplicates,
  fetchRegistrationOptions,
  registerPatient,
  type DuplicateMatch,
  type RegistrationOptions,
  type RegistrationResult,
} from '@/lib/api';
import { getToken } from '@/lib/session';

interface RegistrationWizardProps {
  open: boolean;
  onClose: () => void;
  onRegistered: (result: RegistrationResult) => void;
}

interface FormState {
  fullName: string;
  age: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  address: string;
  village: string;
  district: string;
  aadhaar: string;
  uhid: string;
}

const EMPTY: FormState = {
  fullName: '', age: '', dateOfBirth: '', gender: '', phone: '',
  address: '', village: '', district: '', aadhaar: '', uhid: '',
};

const STEPS = ['Patient', 'Programs', 'Worker', 'Review'];
const GENDERS = ['Female', 'Male', 'Other'];

/**
 * Integrated Patient Registration wizard — the single canonical onboarding
 * workflow (reused from Dashboard, Citizens and Worklist via PatientActions).
 * Captures demographics, program selection and worker assignment, performs
 * duplicate detection at review, then registers atomically server-side (citizen +
 * enrollments + initial activities in one transaction).
 */
export default function RegistrationWizard({ open, onClose, onRegistered }: RegistrationWizardProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [programIds, setProgramIds] = useState<string[]>([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [options, setOptions] = useState<RegistrationOptions | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [force, setForce] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setForm(EMPTY);
    setProgramIds([]);
    setAssignedTo('');
    setDuplicates([]);
    setForce(false);
    setError('');
    const token = getToken();
    if (!token) return;
    fetchRegistrationOptions(token)
      .then(setOptions)
      .catch(() => setError('Unable to load programs and workers.'));
  }, [open]);

  const programName = useMemo(
    () => new Map((options?.programs ?? []).map((p) => [p.id, p.name])),
    [options],
  );
  const workerName = useMemo(
    () => new Map((options?.workers ?? []).map((w) => [w.username, `${w.fullName} (${w.role})`])),
    [options],
  );

  if (!open) return null;

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleProgram(id: string) {
    setProgramIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function validateStep1(): string | null {
    if (!form.fullName.trim()) return 'Full name is required.';
    if (form.age.trim()) {
      const n = Number(form.age);
      if (!Number.isFinite(n) || n < 0 || n > 130) return 'Please enter a valid age.';
    }
    return null;
  }

  async function goNext() {
    setError('');
    if (step === 1) {
      const problem = validateStep1();
      if (problem) return setError(problem);
    }
    if (step === 2 && programIds.length === 0) {
      return setError('Select at least one program (or go back to skip enrollment).');
    }
    if (step === 3) {
      // Entering Review → run duplicate detection.
      await runDuplicateCheck();
    }
    setStep((s) => Math.min(4, s + 1));
  }

  async function runDuplicateCheck() {
    const token = getToken();
    if (!token) return;
    setChecking(true);
    setForce(false);
    try {
      const res = await checkDuplicates(token, {
        uhid: form.uhid.trim() || undefined,
        phone: form.phone.trim() || undefined,
        aadhaar: form.aadhaar.trim() || undefined,
      });
      setDuplicates(res.duplicates);
    } catch {
      setDuplicates([]);
    } finally {
      setChecking(false);
    }
  }

  async function handleRegister() {
    setError('');
    const token = getToken();
    if (!token) return setError('Your session has expired. Please sign in again.');
    setSaving(true);
    try {
      const result = await registerPatient(token, {
        uhid: form.uhid.trim() || undefined,
        fullName: form.fullName.trim(),
        age: form.age.trim() ? Number(form.age) : undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        village: form.village.trim() || undefined,
        district: form.district.trim() || undefined,
        aadhaar: form.aadhaar.trim() || undefined,
        programIds,
        assignedTo: assignedTo || undefined,
        force: force || duplicates.length === 0,
      });
      onRegistered(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register patient.');
    } finally {
      setSaving(false);
    }
  }

  const canConfirm = !saving && !checking && (duplicates.length === 0 || force);

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reg-wizard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="reg-wizard-title" className="modal-title">Register New Patient</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={saving}>×</button>
        </div>

        {/* Progress indicator */}
        <ol className="rw-steps">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n === step ? 'current' : n < step ? 'done' : 'todo';
            return (
              <li key={label} className={`rw-step rw-${state}`}>
                <span className="rw-step-no">{n < step ? '✓' : n}</span>
                <span className="rw-step-label">{label}</span>
              </li>
            );
          })}
        </ol>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          {/* Step 1 — Patient Information */}
          {step === 1 && (
            <>
              <div className="fg">
                <label className="fl" htmlFor="rw-name">Full Name *</label>
                <input id="rw-name" className="fc" value={form.fullName} maxLength={255}
                  onChange={(e) => set('fullName', e.target.value)} />
              </div>
              <div className="modal-row">
                <div className="fg">
                  <label className="fl" htmlFor="rw-age">Age</label>
                  <input id="rw-age" type="number" min={0} max={130} className="fc" value={form.age}
                    onChange={(e) => set('age', e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl" htmlFor="rw-dob">Date of Birth</label>
                  <input id="rw-dob" type="date" className="fc" value={form.dateOfBirth}
                    onChange={(e) => set('dateOfBirth', e.target.value)} />
                </div>
              </div>
              <div className="modal-row">
                <div className="fg">
                  <label className="fl" htmlFor="rw-gender">Gender</label>
                  <select id="rw-gender" className="fc" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                    <option value="">—</option>
                    {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl" htmlFor="rw-phone">Phone</label>
                  <input id="rw-phone" className="fc" value={form.phone} maxLength={20}
                    onChange={(e) => set('phone', e.target.value)} />
                </div>
              </div>
              <div className="fg">
                <label className="fl" htmlFor="rw-address">Address</label>
                <input id="rw-address" className="fc" value={form.address} maxLength={500}
                  onChange={(e) => set('address', e.target.value)} />
              </div>
              <div className="modal-row">
                <div className="fg">
                  <label className="fl" htmlFor="rw-village">Village</label>
                  <input id="rw-village" className="fc" value={form.village} maxLength={120}
                    onChange={(e) => set('village', e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl" htmlFor="rw-district">District</label>
                  <input id="rw-district" className="fc" value={form.district} maxLength={100}
                    onChange={(e) => set('district', e.target.value)} />
                </div>
              </div>
              <div className="modal-row">
                <div className="fg">
                  <label className="fl" htmlFor="rw-aadhaar">Aadhaar (optional)</label>
                  <input id="rw-aadhaar" className="fc" value={form.aadhaar} maxLength={20}
                    onChange={(e) => set('aadhaar', e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl" htmlFor="rw-uhid">Existing UHID (optional)</label>
                  <input id="rw-uhid" className="fc" value={form.uhid} maxLength={50}
                    placeholder="Auto-generated if blank" onChange={(e) => set('uhid', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Step 2 — Programs */}
          {step === 2 && (
            <>
              <p className="dq-dialog-note">Select the clinical programs to enrol this patient into.</p>
              {!options ? (
                <div className="dash-loading">Loading programs&hellip;</div>
              ) : (
                <div className="rw-program-grid">
                  {options.programs.map((p) => {
                    const checked = programIds.includes(p.id);
                    return (
                      <label key={p.id} className={`rw-program${checked ? ' selected' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleProgram(p.id)} />
                        <span className="rw-program-name">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Step 3 — Worker */}
          {step === 3 && (
            <>
              <p className="dq-dialog-note">Assign the responsible health worker for this patient.</p>
              <div className="fg">
                <label className="fl" htmlFor="rw-worker">Responsible Worker</label>
                <select id="rw-worker" className="fc" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {(options?.workers ?? []).map((w) => (
                    <option key={w.username} value={w.username}>{w.fullName} · {w.role}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Step 4 — Review */}
          {step === 4 && (
            <>
              {checking ? (
                <div className="dash-loading">Checking for duplicates&hellip;</div>
              ) : (
                <>
                  {duplicates.length > 0 && (
                    <div className="rw-dup-warning">
                      <div className="rw-dup-head">⚠ Possible duplicate patient found</div>
                      {duplicates.slice(0, 5).map((d) => (
                        <div key={d.id} className="rw-dup-row">
                          <span className="mono">{d.uhid}</span>
                          <span>{d.fullName ?? '—'}</span>
                          <span className="rw-dup-on">matched: {d.matchedOn.join(', ')}</span>
                          <a href={`/citizens?c=${d.id}`} target="_blank" rel="noopener" className="rw-dup-link">
                            Review Existing
                          </a>
                        </div>
                      ))}
                      {!force && (
                        <div className="rw-dup-actions">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>Cancel</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setForce(true)}>
                            Continue Anyway
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rw-review-grid">
                    <section className="tc-panel">
                      <h3 className="tc-section-title">Patient Details</h3>
                      <dl className="tc-info">
                        <div><dt>Name</dt><dd>{form.fullName || '—'}</dd></div>
                        <div><dt>UHID</dt><dd>{form.uhid.trim() || 'Auto-generated'}</dd></div>
                        <div><dt>Age</dt><dd>{form.age || '—'}</dd></div>
                        <div><dt>Gender</dt><dd>{form.gender || '—'}</dd></div>
                        <div><dt>Phone</dt><dd>{form.phone || '—'}</dd></div>
                        <div><dt>Village</dt><dd>{form.village || '—'}</dd></div>
                        <div><dt>District</dt><dd>{form.district || '—'}</dd></div>
                        <div><dt>Aadhaar</dt><dd>{form.aadhaar || '—'}</dd></div>
                      </dl>
                    </section>
                    <section className="tc-panel">
                      <h3 className="tc-section-title">Programs &amp; Assignment</h3>
                      <div className="rw-review-label">Programs ({programIds.length})</div>
                      {programIds.length > 0 ? (
                        <div className="dq-chips">
                          {programIds.map((id) => <span key={id} className="dq-chip">{programName.get(id) ?? id}</span>)}
                        </div>
                      ) : <div className="dq-muted">No programs selected.</div>}
                      <div className="rw-review-label" style={{ marginTop: 12 }}>Assigned Worker</div>
                      <div>{assignedTo ? workerName.get(assignedTo) ?? assignedTo : 'Unassigned'}</div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="modal-foot rw-foot">
          <button type="button" className="btn btn-ghost" onClick={() => (step === 1 ? onClose() : setStep((s) => s - 1))} disabled={saving}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 4 ? (
            <button type="button" className="btn btn-primary" onClick={goNext} disabled={!options && step >= 2}>
              Next →
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleRegister} disabled={!canConfirm}>
              {saving ? 'Registering…' : 'Confirm Registration'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
