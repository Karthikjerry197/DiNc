'use client';

import { useEffect, useState } from 'react';
import { createCitizen, type CitizenListItem } from '@/lib/api';
import { getToken } from '@/lib/session';

interface NewPatientDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (citizen: CitizenListItem) => void;
}

const GENDERS = ['Female', 'Male', 'Other'];

/**
 * Patient Registration dialog — the SINGLE implementation reused from the
 * Dashboard, Citizens and Worklist quick actions. Collects only fields backed by
 * the citizens table and reports backend validation/duplicate errors cleanly.
 */
export default function NewPatientDialog({ open, onClose, onCreated }: NewPatientDialogProps) {
  const [uhid, setUhid] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setUhid('');
    setFullName('');
    setAge('');
    setGender('');
    setPhone('');
    setDistrict('');
    setError('');
  }, [open]);

  if (!open) return null;

  const canSave = uhid.trim().length > 0 && fullName.trim().length > 0 && !saving;

  async function handleSave() {
    setError('');
    const token = getToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    if (!uhid.trim() || !fullName.trim()) {
      setError('UHID and full name are required.');
      return;
    }
    const ageNum = age.trim() ? Number(age) : undefined;
    if (ageNum !== undefined && (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 130)) {
      setError('Please enter a valid age.');
      return;
    }
    setSaving(true);
    try {
      const citizen = await createCitizen(token, {
        uhid: uhid.trim(),
        fullName: fullName.trim(),
        age: ageNum,
        gender: gender || undefined,
        phone: phone.trim() || undefined,
        district: district.trim() || undefined,
      });
      onCreated(citizen);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register patient.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-patient-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="new-patient-title" className="modal-title">Register New Patient</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}

          <div className="fg">
            <label className="fl" htmlFor="np-uhid">UHID *</label>
            <input id="np-uhid" className="fc" value={uhid} disabled={saving} maxLength={50}
              placeholder="e.g. ASSAM-2026-01234" onChange={(e) => setUhid(e.target.value)} />
          </div>

          <div className="fg">
            <label className="fl" htmlFor="np-name">Full Name *</label>
            <input id="np-name" className="fc" value={fullName} disabled={saving} maxLength={255}
              onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="modal-row">
            <div className="fg">
              <label className="fl" htmlFor="np-age">Age</label>
              <input id="np-age" type="number" min={0} max={130} className="fc" value={age}
                disabled={saving} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="np-gender">Gender</label>
              <select id="np-gender" className="fc" value={gender} disabled={saving}
                onChange={(e) => setGender(e.target.value)}>
                <option value="">—</option>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div className="modal-row">
            <div className="fg">
              <label className="fl" htmlFor="np-phone">Phone</label>
              <input id="np-phone" className="fc" value={phone} disabled={saving} maxLength={20}
                onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="np-district">District</label>
              <input id="np-district" className="fc" value={district} disabled={saving} maxLength={100}
                onChange={(e) => setDistrict(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            {saving ? 'Registering…' : 'Register Patient'}
          </button>
        </div>
      </div>
    </div>
  );
}
