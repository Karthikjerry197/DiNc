'use client';

import { Plus, UserRound } from 'lucide-react';
import type { Activity, CitizenDetail, EnrollmentDetail, EnrollmentSummary } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { SkeletonLines } from '@/components/shell/Skeleton';
import CareJourneyProgress from './CareJourneyProgress';

interface CitizenSummaryProps {
  detail: CitizenDetail | null;
  loading: boolean;
  enrollments: EnrollmentSummary[];
  enrollmentsLoading: boolean;
  selectedEnrollmentId: string | null;
  onSelectEnrollment: (id: string) => void;
  enrollmentDetail: EnrollmentDetail | null;
  enrollmentDetailLoading: boolean;
  /** Selected enrollment's workflow activities — drives Care Journey Progress (M37A). */
  activities: Activity[];
  activitiesLoading: boolean;
  onAddProgram: () => void;
  onOpenGuidebook: () => void;
  onStartConsultation: () => void;
  onBack: () => void;
}

function val(text: string | null | undefined): string {
  return text && String(text).trim() ? String(text) : '—';
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
  activities,
  activitiesLoading,
  onAddProgram,
  onOpenGuidebook,
  onStartConsultation,
  onBack,
}: CitizenSummaryProps) {
  if (loading) {
    return (
      <section className="cz-center">
        <SkeletonLines lines={7} />
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="cz-center">
        <div className="empty-state cz-center-empty">
          <div className="empty-state-icon" aria-hidden="true"><UserRound size={22} /></div>
          <div className="empty-state-text">Select a citizen to view their workspace.</div>
        </div>
      </section>
    );
  }

  const { citizen, stats } = detail;
  const activeEnrollments = enrollments.filter((e) => e.status === 'ACTIVE');
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

      {/* Care Journey Progress (M37A) — derived live from the selected
        * enrollment's workflow activities; nothing is stored. */}
      <CareJourneyProgress
        activities={activities}
        loading={activitiesLoading}
        hasEnrollment={!!selectedEnrollmentId}
      />

      {/* Active programs — live enrollments; selecting one updates the panel below. */}
      <div className="cz-section">
        <div className="cz-section-head">
          <span className="cz-section-label">
            Active Programs
            <span className="cz-enroll-count">{activeEnrollments.length}</span>
          </span>
          <button
            type="button"
            className="cz-chip-add"
            title="Add Program"
            onClick={onAddProgram}
          >
            <Plus size={13} aria-hidden="true" /> Add Program
          </button>
        </div>
        {enrollmentsLoading ? (
          <div className="cz-inline-empty">Loading programs…</div>
        ) : activeEnrollments.length > 0 ? (
          <ul className="cz-prog-list">
            {activeEnrollments.map((enrollment) => {
              const label = enrollment.program.name ?? 'Program';
              const selected = enrollment.id === selectedEnrollmentId;
              return (
                <li key={enrollment.id}>
                  <button
                    type="button"
                    className={`cz-prog-row${selected ? ' selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => onSelectEnrollment(enrollment.id)}
                  >
                    <span className="cz-prog-dot" aria-hidden="true" />
                    <span className="cz-prog-name">{label}</span>
                    {selected && <span className="cz-prog-current">Currently Selected</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="cz-inline-empty">No active clinical programs.</div>
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
            <span className="cz-stat-value" style={{ color: 'var(--p)' }}>{stats.completed}</span>
            <span className="cz-stat-label">Completed</span>
          </div>
          <div className="cz-stat">
            <span className="cz-stat-value" style={{ color: 'var(--warn)' }}>{stats.pending}</span>
            <span className="cz-stat-label">Pending</span>
          </div>
        </div>
      </div>

      {/* Action buttons — every action here is live (M35A Wave 1 removed the
        * Edit / Close / Remove / FAQs / Manage Activities placeholders; they
        * return only when their functionality ships). */}
      <div className="cz-actions">
        <div className="cz-actions-row">
          <button
            type="button"
            className="wl-btn wl-btn-soft"
            title="Open the guidebook for this enrollment"
            onClick={onOpenGuidebook}
          >
            Guidebook
          </button>
          <button
            type="button"
            className="wl-btn wl-btn-soft"
            title="Start or continue a consultation for this citizen"
            onClick={onStartConsultation}
          >
            Start Consultation
          </button>
        </div>
      </div>
    </section>
  );
}
