'use client';

import type { DuplicateComparison, PatientComparisonSide } from '@/lib/api';
import { formatDate } from '@/lib/format';

/** A single label/value row in the demographics list. */
function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="dq-field">
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{value && value.trim() ? value : '—'}</dd>
    </div>
  );
}

/** Renders one patient column of the side-by-side comparison (four sections). */
function PatientColumn({ side, heading }: { side: PatientComparisonSide; heading: string }) {
  const d = side.demographics;
  const addressParts = [d.address, d.village, d.district].filter((p) => p && p.trim());

  return (
    <div className="dq-compare-col">
      <div className="dq-compare-heading">{heading}</div>

      {/* 1 · Citizen Information */}
      <div className="dq-compare-section">
        <div className="dq-compare-label">Citizen Information</div>
        <dl className="dq-demo">
          <Field label="UHID" value={d.uhid} mono />
          <Field label="ABHA" value={d.abha} mono />
          <Field label="Aadhaar" value={d.aadhaar} mono />
          <Field label="Name" value={d.fullName} />
          <Field label="Date of Birth" value={d.dateOfBirth ? formatDate(d.dateOfBirth) : null} />
          <Field label="Age" value={d.age != null ? `${d.age}` : null} />
          <Field label="Gender" value={d.gender} />
          <Field label="Mobile" value={d.mobile} />
          <Field label="Address" value={addressParts.length ? addressParts.join(', ') : null} />
        </dl>
      </div>

      {/* 2 · Programme Information */}
      <div className="dq-compare-section">
        <div className="dq-compare-label">Programme Enrolments ({side.enrollments.length})</div>
        {side.enrollments.length > 0 ? (
          <ul className="dq-list">
            {side.enrollments.map((e) => (
              <li key={e.id}>
                <span className="dq-list-main">{e.program.name ?? '—'}</span>
                <span className="dq-list-sub">
                  {(e.subProgram?.name ?? '—')} · {formatDate(e.enrollmentDate)} ·{' '}
                  <span className={`pill pill-${e.status.toLowerCase()}`}>{e.status}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dq-muted">No programme enrolments.</div>
        )}
      </div>

      {/* 3 · Clinical Information — Care History (activities) + Alerts */}
      <div className="dq-compare-section">
        <div className="dq-compare-label">Care History ({side.activities.length})</div>
        {side.activities.length > 0 ? (
          <ul className="dq-list">
            {side.activities.slice(0, 8).map((a) => (
              <li key={a.id}>
                <span className="dq-list-main">{a.activity ?? '—'}</span>
                <span className="dq-list-sub">
                  {(a.program ?? '—')} · {formatDate(a.dueDate)} ·{' '}
                  <span className={`pill pill-${a.status.toLowerCase()}`}>{a.status}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dq-muted">No recorded activities.</div>
        )}
      </div>

      <div className="dq-compare-section">
        <div className="dq-compare-label">Clinical Alerts ({side.alerts.length})</div>
        {side.alerts.length > 0 ? (
          <ul className="dq-list">
            {side.alerts.map((al) => (
              <li key={al.id}>
                <span className="dq-list-main">{al.disease ?? 'Clinical alert'}</span>
                <span className="dq-list-sub">
                  <span className={`pill dq-risk-${(al.riskLevel ?? '').toLowerCase()}`}>
                    {al.riskLevel ?? '—'}
                  </span>{' '}
                  · {al.status} · {formatDate(al.triggeredAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dq-muted">No active clinical alerts.</div>
        )}
      </div>

      {/* Matched guidebooks (kept from the original comparison). */}
      <div className="dq-compare-section">
        <div className="dq-compare-label">Guidebooks ({side.guidebooks.length})</div>
        {side.guidebooks.length > 0 ? (
          <ul className="dq-list">
            {side.guidebooks.map((g) => (
              <li key={g.id}>
                <span className="dq-list-main">{g.title}</span>
                <span className="dq-list-sub">{g.code} · {g.category}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dq-muted">No matched guidebooks.</div>
        )}
      </div>
    </div>
  );
}

/**
 * Shared side-by-side comparison used by BOTH the Duplicate Review Workspace and
 * the Compare Records dialog — one implementation, no duplication. Renders the two
 * patient columns plus the request's Administrative Information footer.
 */
export default function ComparisonColumns({ data }: { data: DuplicateComparison }) {
  const r = data.request;
  return (
    <div className="dq-compare">
      <div className="dq-compare-grid">
        <PatientColumn side={data.current} heading="Current Patient" />
        <PatientColumn side={data.duplicate} heading="Suspected Duplicate" />
      </div>

      {/* 4 · Administrative Information (about the request itself) */}
      <div className="dq-admin-info">
        <div className="dq-compare-label">Administrative Information</div>
        <dl className="dq-demo dq-admin-grid">
          <Field label="Created Date" value={formatDate(r.submittedAt)} />
          <Field label="Created By" value={r.submittedBy} />
          <Field label="Last Updated" value={formatDate(r.updatedAt)} />
        </dl>
      </div>
    </div>
  );
}
