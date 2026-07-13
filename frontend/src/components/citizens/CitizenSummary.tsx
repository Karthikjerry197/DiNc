'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Flag, Phone, Plus, UserRound } from 'lucide-react';
import {
  resolveOverallRisk,
  type Activity,
  type CitizenDetail,
  type EnrollmentDetail,
  type EnrollmentSummary,
  type OverallRiskResolution,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { SkeletonLines } from '@/components/shell/Skeleton';
import { predictFollowupDefault } from '@/lib/ai';
import { DefaultProbBadge } from '@/components/intelligence/badges';
import OverallRiskBadge from '@/components/intelligence/OverallRiskBadge';

interface CitizenSummaryProps {
  detail: CitizenDetail | null;
  loading: boolean;
  /** Clinical risk of the selected citizen (from the list; backend-driven). */
  riskLevel?: string | null;
  enrollments: EnrollmentSummary[];
  enrollmentsLoading: boolean;
  selectedEnrollmentId: string | null;
  onSelectEnrollment: (id: string) => void;
  enrollmentDetail: EnrollmentDetail | null;
  enrollmentDetailLoading: boolean;
  /** Selected enrollment's workflow activities — drives the KPI trio & progress. */
  activities: Activity[];
  activitiesLoading: boolean;
  onAddProgram: () => void;
  onOpenGuidebook: () => void;
  onStartConsultation: () => void;
  /** Opens the shared Report Duplicate workflow for this citizen (same dialog as Worklist/Dashboard). */
  onReportDuplicate: () => void;
}

function val(text: string | null | undefined): string {
  return text && String(text).trim() ? String(text) : '—';
}

const DAY_MS = 86_400_000;

/** Done / pending / overdue tallies for the selected enrollment's activities. */
function tally(activities: Activity[]) {
  let done = 0;
  let overdue = 0;
  let pending = 0;
  const now = Date.now();
  for (const a of activities) {
    const isDone = ['COMPLETED', 'DONE', 'CLOSED'].includes(a.status.toUpperCase());
    if (isDone) done += 1;
    else if (a.dueDate && new Date(a.dueDate).getTime() < now) overdue += 1;
    else pending += 1;
  }
  const total = activities.length;
  const completion = total ? Math.round((done / total) * 100) : 0;
  return { done, overdue, pending, total, completion };
}

export default function CitizenSummary({
  detail,
  loading,
  riskLevel,
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
  onReportDuplicate,
}: CitizenSummaryProps) {
  const kpi = useMemo(() => tally(activities), [activities]);

  // Header follow-up default badge (spec §5.2). Approximation from the selected
  // programme's activity tally only — overdue activities stand in for missed
  // follow-ups; the full Intelligence tab uses the richer journey-based vector.
  const followup = useMemo(
    () =>
      predictFollowupDefault({
        priorMissed: kpi.overdue,
        priorReschedules: 0,
        attendanceRate: kpi.total ? kpi.done / kpi.total : null,
        followUpGapDays: null,
        chronicConditions: 1,
        age: detail?.citizen.age ?? null,
        overdueNow: kpi.overdue > 0,
        daysSinceContact: null,
        defaulterSignals: kpi.overdue,
      }),
    [kpi, detail?.citizen.age],
  );

  // Overall Risk — the PRIMARY patient risk, resolved by the shared Overall Risk
  // Service (Clinical Severity × Follow-up Risk). This component never combines
  // the inputs itself; it only renders the service's answer.
  const [overall, setOverall] = useState<OverallRiskResolution | null>(null);
  const followupBand = followup.band;
  useEffect(() => {
    const token = getToken();
    if (!token || !detail) { setOverall(null); return; }
    let alive = true;
    resolveOverallRisk(token, riskLevel ?? 'NONE', followupBand)
      .then((r) => { if (alive) setOverall(r); })
      .catch(() => { if (alive) setOverall(null); });
    return () => { alive = false; };
  }, [detail, riskLevel, followupBand]);

  if (loading) {
    return (
      <section className="cz-center czx-summary">
        <SkeletonLines lines={8} />
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="cz-center czx-summary">
        <div className="empty-state cz-center-empty">
          <div className="empty-state-icon" aria-hidden="true"><UserRound size={22} /></div>
          <div className="empty-state-text">Select a citizen to view their workspace.</div>
        </div>
      </section>
    );
  }

  const { citizen } = detail;
  const activeEnrollments = enrollments.filter((e) => e.status === 'ACTIVE');
  const name = citizen.fullName?.trim() ? citizen.fullName : citizen.uhid;
  const demographics = [
    citizen.age != null ? `${citizen.age}y` : null,
    citizen.gender,
    citizen.phone,
    citizen.district,
  ].filter(Boolean);

  const risk = riskLevel?.trim() ? riskLevel.trim() : null;

  const infoRows: { label: string; value: string | null }[] = enrollmentDetail
    ? [
        { label: 'CPHC Service', value: enrollmentDetail.cphcService },
        { label: 'Event', value: enrollmentDetail.event },
        { label: 'Condition', value: enrollmentDetail.condition },
        { label: 'Assignee', value: enrollmentDetail.assignee },
        { label: 'Priority', value: enrollmentDetail.priority },
        { label: 'Status', value: enrollmentDetail.status },
        { label: 'Rev. Status', value: enrollmentDetail.reviewStatus },
        { label: 'Enrolled', value: formatDate(enrollmentDetail.enrollmentDate) },
        { label: 'Geo Unit', value: enrollmentDetail.geographicUnit },
      ]
    : [];

  return (
    <section className="cz-center czx-summary">
      {/* Identity header — UHID anchor + name + risk + programme count */}
      <div className="czx-identity">
        <div className="czx-identity-avatar" aria-hidden="true">
          {(name[0] ?? '#').toUpperCase()}
        </div>
        <div className="czx-identity-body">
          <div className="czx-identity-top">
            <span className="czx-identity-uhid">{citizen.uhid}</span>
            {/* PRIMARY — Overall Risk (matrix-driven, shared service) */}
            {overall && <OverallRiskBadge resolution={overall} />}
            {/* Supporting — Clinical Severity and Follow-up Default Probability */}
            {risk && <span className={`czx-risk czx-risk-${risk.toLowerCase()}`}>{risk}</span>}
            {activities.length > 0 && (
              <DefaultProbBadge probability={followup.probability} band={followup.band} />
            )}
          </div>
          <div className="czx-identity-name">{name}</div>
          <div className="czx-identity-meta">
            {demographics.length ? demographics.join(' · ') : 'No demographics on record'}
          </div>
          <div className="czx-identity-progs">{activeEnrollments.length} enrolled programme{activeEnrollments.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {/* Enrolled programmes — chips select which programme drives the detail below */}
      <div className="czx-block">
        <div className="czx-block-head">
          <span className="czx-block-label">Enrolled Programmes</span>
          <button type="button" className="czx-chip-add" title="Add programme" onClick={onAddProgram}>
            <Plus size={12} aria-hidden="true" /> Add
          </button>
        </div>
        {enrollmentsLoading ? (
          <div className="cz-inline-empty">Loading programmes…</div>
        ) : activeEnrollments.length > 0 ? (
          <div className="czx-chips">
            {activeEnrollments.map((enrollment) => {
              const selected = enrollment.id === selectedEnrollmentId;
              return (
                <button
                  key={enrollment.id}
                  type="button"
                  className={`czx-chip${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => onSelectEnrollment(enrollment.id)}
                >
                  {selected && <span className="czx-chip-tick" aria-hidden="true">✓ </span>}
                  {enrollment.program.name ?? 'Programme'}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="cz-inline-empty">No active clinical programmes.</div>
        )}
      </div>

      {/* Selected enrollment detail */}
      <div className="czx-block">
        {enrollmentDetailLoading ? (
          <div className="cz-inline-empty">Loading enrollment…</div>
        ) : enrollmentDetail ? (
          <>
            <div className="czx-prog-title">{enrollmentDetail.program.name}</div>
            <dl className="czx-info">
              {infoRows.map((row) => (
                <div key={row.label} className="czx-info-row">
                  <dt>{row.label}</dt>
                  <dd>{val(row.value)}</dd>
                </div>
              ))}
            </dl>
            {enrollmentDetail.remarks?.trim() && (
              <div className="czx-remarks">
                <span className="czx-remarks-label">Remarks</span>
                <p>{enrollmentDetail.remarks}</p>
              </div>
            )}
          </>
        ) : (
          <div className="cz-inline-empty">No active enrollment for this citizen.</div>
        )}
      </div>

      {/* KPI trio + completion — for the selected programme */}
      <div className="czx-kpis">
        <div className="czx-kpi">
          <span className="czx-kpi-num czx-kpi-done">{activitiesLoading ? '—' : kpi.done}</span>
          <span className="czx-kpi-label">Done</span>
        </div>
        <div className="czx-kpi">
          <span className="czx-kpi-num czx-kpi-pend">{activitiesLoading ? '—' : kpi.pending}</span>
          <span className="czx-kpi-label">Pending</span>
        </div>
        <div className="czx-kpi">
          <span className="czx-kpi-num czx-kpi-over">{activitiesLoading ? '—' : kpi.overdue}</span>
          <span className="czx-kpi-label">Overdue</span>
        </div>
      </div>
      <div className="czx-progress">
        <div className="czx-progress-head">
          <span>Completion</span>
          <span className="czx-progress-pct">{kpi.completion}%</span>
        </div>
        <div className="czx-progress-track">
          <div className="czx-progress-fill" style={{ width: `${kpi.completion}%` }} />
        </div>
      </div>

      {/* Live actions */}
      <div className="czx-actions">
        <button type="button" className="czx-btn czx-btn-primary" onClick={onStartConsultation}>
          <Phone size={13} aria-hidden="true" /> Start Call
        </button>
        <button type="button" className="czx-btn czx-btn-soft" onClick={onOpenGuidebook}>
          <BookOpen size={13} aria-hidden="true" /> Guidebook
        </button>
        <button
          type="button"
          className="czx-btn czx-btn-soft"
          title="Report Duplicate"
          aria-label="Report Duplicate"
          onClick={onReportDuplicate}
        >
          <Flag size={13} aria-hidden="true" /> Report Duplicate
        </button>
      </div>
    </section>
  );
}
