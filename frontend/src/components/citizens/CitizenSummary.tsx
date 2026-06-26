'use client';

import type { CitizenDetail, EnrollmentDetail, EnrollmentSummary } from '@/lib/api';

interface CitizenSummaryProps {
  detail: CitizenDetail | null;
  loading: boolean;
  enrollments: EnrollmentSummary[];
  enrollmentsLoading: boolean;
  selectedEnrollmentId: string | null;
  onSelectEnrollment: (id: string) => void;
  enrollmentDetail: EnrollmentDetail | null;
  enrollmentDetailLoading: boolean;
  onAddProgram: () => void;
  onComingSoon: (label: string) => void;
  onBack: () => void;
}

/** Primary action buttons — all UI-only this milestone. */
const PRIMARY_ACTIONS = ['Guidebook', 'Call Next', 'Edit', 'Close', 'Remove'];
const SECONDARY_ACTIONS = ['Guide Book', 'FAQs', 'Manage Activities'];

function val(text: string | null | undefined): string {
  return text && String(text).trim() ? String(text) : '—';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function CitizenSummary({
  detail,
  loading,
  enrollments,
  enrollmentsLoading,
  selectedEnrollmentId,
  onSelectEnrollment,
  enrollmentDetail,
  enrollmentDetailLoading,
  onAddProgram,
  onComingSoon,
  onBack,
}: CitizenSummaryProps) {
  if (loading) {
    return (
      <section className="cz-center">
        <div className="dash-loading">Loading citizen&hellip;</div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="cz-center">
        <div className="empty-state cz-center-empty">
          <div className="empty-state-icon" aria-hidden="true">👤</div>
          <div className="empty-state-text">Select a citizen to view their workspace.</div>
        </div>
      </section>
    );
  }

  const { citizen, stats } = detail;
  const name = citizen.fullName?.trim() ? citizen.fullName : citizen.uhid;
  const demographics = [
    citizen.age != null ? `${citizen.age} yrs` : null,
    citizen.gender,
    citizen.district,
    citizen.phone,
  ].filter(Boolean);

  const infoRows: { label: string; value: string | null }[] = enrollmentDetail
    ? [
        { label: 'Program', value: enrollmentDetail.program.name },
        { label: 'Sub Program', value: enrollmentDetail.subProgram?.name ?? null },
        { label: 'CPHC Service', value: enrollmentDetail.cphcService },
        { label: 'Event', value: enrollmentDetail.event },
        { label: 'Condition', value: enrollmentDetail.condition },
        { label: 'Assignee', value: enrollmentDetail.assignee },
        { label: 'Priority', value: enrollmentDetail.priority },
        { label: 'Status', value: enrollmentDetail.status },
        { label: 'Review Status', value: enrollmentDetail.reviewStatus },
        { label: 'Enrollment Date', value: formatDate(enrollmentDetail.enrollmentDate) },
        { label: 'Geographic Unit', value: enrollmentDetail.geographicUnit },
        { label: 'Remarks', value: enrollmentDetail.remarks },
      ]
    : [];

  return (
    <section className="cz-center">
      <div className="cz-center-head">
        <button type="button" className="cz-back" onClick={onBack} title="Back to Worklist">
          ‹ Back
        </button>
        <span className="cz-uhid-badge">{citizen.uhid}</span>
      </div>

      <div className="cz-identity">
        <div className="cz-identity-avatar" aria-hidden="true">
          {(name[0] ?? '#').toUpperCase()}
        </div>
        <div>
          <div className="cz-identity-name">{name}</div>
          <div className="cz-identity-meta">
            {demographics.length ? demographics.join(' · ') : 'No demographics on record'}
          </div>
        </div>
      </div>

      {/* Program chips — live enrollments; selecting one updates the panel below. */}
      <div className="cz-section">
        <div className="cz-section-head">
          <span className="cz-section-label">Enrolled Programs</span>
          <button
            type="button"
            className="cz-chip-add"
            title="Add Program"
            onClick={onAddProgram}
          >
            ＋ Add Program
          </button>
        </div>
        {enrollmentsLoading ? (
          <div className="cz-inline-empty">Loading programs…</div>
        ) : enrollments.length > 0 ? (
          <div className="cz-chips">
            {enrollments.map((enrollment) => {
              const label = enrollment.program.name ?? 'Program';
              const active = enrollment.id === selectedEnrollmentId;
              return (
                <div
                  key={enrollment.id}
                  className={`cz-program-chip${active ? ' active' : ''}`}
                  title={enrollment.status}
                >
                  <button
                    type="button"
                    className="cz-chip-select"
                    aria-pressed={active}
                    onClick={() => onSelectEnrollment(enrollment.id)}
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    className="cz-chip-x"
                    title="Remove program"
                    aria-label={`Remove ${label}`}
                    onClick={() => onComingSoon('Remove program')}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cz-inline-empty">No programs enrolled.</div>
        )}
      </div>

      {/* Enrollment information — driven by the selected enrollment. */}
      <div className="cz-section">
        <span className="cz-section-label">Enrollment Information</span>
        {enrollmentDetailLoading ? (
          <div className="cz-inline-empty">Loading enrollment…</div>
        ) : enrollmentDetail ? (
          <div className="cz-info-grid">
            {infoRows.map((row) => (
              <div key={row.label} className="cz-info-row">
                <span className="cz-info-label">{row.label}</span>
                <span className="cz-info-value">{val(row.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="cz-inline-empty">No active enrollment for this citizen.</div>
        )}
      </div>

      {/* Completion statistics */}
      <div className="cz-section">
        <span className="cz-section-label">Completion</span>
        <div className="cz-stats">
          <div className="cz-stat">
            <span className="cz-stat-value">{stats.total}</span>
            <span className="cz-stat-label">Total</span>
          </div>
          <div className="cz-stat">
            <span className="cz-stat-value" style={{ color: '#24a148' }}>{stats.completed}</span>
            <span className="cz-stat-label">Completed</span>
          </div>
          <div className="cz-stat">
            <span className="cz-stat-value" style={{ color: '#d97706' }}>{stats.pending}</span>
            <span className="cz-stat-label">Pending</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="cz-actions">
        <div className="cz-actions-row">
          {PRIMARY_ACTIONS.map((label) => (
            <button
              key={label}
              type="button"
              className="wl-btn wl-btn-soft"
              title={label}
              onClick={() => onComingSoon(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="cz-actions-row">
          {SECONDARY_ACTIONS.map((label) => (
            <button
              key={label}
              type="button"
              className="wl-btn"
              title={label}
              onClick={() => onComingSoon(label)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
