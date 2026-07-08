/**
 * Feature builders — project DiNC's EXISTING data (citizen detail, clinical
 * journey, worklist rows, CDSE risk) onto the engine feature vector. No new
 * schema, no new API: everything is derived from what DiNC already returns.
 *
 * Two builders are provided:
 *  - `buildPatientFeatures` — full vector for the citizen detail page.
 *  - `worklistFeatures`     — a LIGHTER approximation from loaded worklist rows
 *    only (no outcome-text signals). See the approximation note on that fn.
 */

import type {
  CitizenDetail,
  ClinicalJourneyEntry,
  CitizenRiskSummary,
  WorklistItem,
} from '@/lib/api';
import type { DincRiskLevel, PatientFeatures } from './types';

const DAY_MS = 86_400_000;

const DONE = new Set(['COMPLETED', 'DONE', 'CLOSED']);
const MISSED_RE = /no answer|not reachable|unreachable|no response|missed|did not|not available/i;
const RESCHEDULE_RE = /reschedul/i;
const ESCALATION_RE = /escalat|referr|emergency|hospitali[sz]/i;
const NONADHERENCE_RE = /non[- ]?adheren|missed dose|not taking|stopped medic|defaul/i;

const PRIORITY_ORDER = ['LOW', 'NORMAL', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY'];

function higherPriority(a: string | null, b: string | null): string | null {
  const ia = a ? PRIORITY_ORDER.indexOf(a.toUpperCase()) : -1;
  const ib = b ? PRIORITY_ORDER.indexOf(b.toUpperCase()) : -1;
  return ia >= ib ? a : b;
}

function daysBetween(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / DAY_MS);
}

/** Rank DiNC clinical categories so we can take the severest. */
const RISK_RANK: Record<string, number> = { NONE: 0, LOW: 1, MODERATE: 2, SEVERE: 3 };
function severest(a: DincRiskLevel | null, b: string | null): DincRiskLevel | null {
  const bn = (b ?? '').toUpperCase();
  const bLevel = bn in RISK_RANK ? (bn as DincRiskLevel) : null;
  if (!a) return bLevel;
  if (!bLevel) return a;
  return RISK_RANK[a] >= RISK_RANK[bLevel] ? a : bLevel;
}

/**
 * Full feature vector for the citizen detail page. Derives adherence/missed/
 * contact signals from the Clinical Journey (outcome text + categories),
 * overdue/priority from the activity list, and the clinical category from the
 * CDSE risk summary (when loaded).
 */
export function buildPatientFeatures(
  detail: CitizenDetail,
  journey: ClinicalJourneyEntry[],
  risk?: CitizenRiskSummary | null,
): PatientFeatures {
  const now = Date.now();

  const conditions = Array.from(
    new Set(
      [
        detail.enrollment?.condition ?? null,
        ...journey.map((j) => j.disease),
      ].filter((c): c is string => !!c && c.trim().length > 0),
    ),
  );

  // Activity-derived signals.
  let overdueCount = 0;
  let topPriority: string | null = detail.enrollment?.priority ?? null;
  let followUpGapDays: number | null = null;
  let hasOpenActivity = false;
  for (const a of detail.activities) {
    const done = DONE.has(a.status.toUpperCase());
    if (!done) hasOpenActivity = true;
    if (!done && a.dueDate) {
      const t = new Date(a.dueDate).getTime();
      if (!Number.isNaN(t)) {
        if (t < now) overdueCount += 1;
        else {
          const gap = Math.floor((t - now) / DAY_MS);
          followUpGapDays = followUpGapDays == null ? gap : Math.min(followUpGapDays, gap);
        }
      }
    }
    topPriority = higherPriority(topPriority, a.priority);
  }

  // Journey-derived signals (outcome text + categories).
  let missedFollowups = 0;
  let priorReschedules = 0;
  let escalations = 0;
  let nonAdherenceSignals = 0;
  let lastContact: number | null = null;
  for (const j of journey) {
    const text = `${j.outcomeName ?? ''} ${j.summary ?? ''} ${j.activityStatus ?? ''}`;
    if (MISSED_RE.test(text)) missedFollowups += 1;
    if (RESCHEDULE_RE.test(text) || (j.activityStatus ?? '').toUpperCase() === 'RESCHEDULED') {
      priorReschedules += 1;
    }
    if (ESCALATION_RE.test(text) || j.outcomeCategory === 'REFERRAL_CRITERIA') escalations += 1;
    if (NONADHERENCE_RE.test(text) || j.outcomeCategory === 'MEDICATION_ADHERENCE') {
      nonAdherenceSignals += 1;
    }
    if ((j.eventType === 'CONSULTATION' || j.eventType === 'ACTIVITY') && j.date) {
      const t = new Date(j.date).getTime();
      if (!Number.isNaN(t)) lastContact = lastContact == null ? t : Math.max(lastContact, t);
    }
  }

  const daysSinceContact = lastContact != null ? Math.floor((now - lastContact) / DAY_MS) : null;

  // Activity completion as an attendance proxy.
  const attendanceRate =
    detail.stats.total > 0 ? detail.stats.completed / detail.stats.total : null;

  const currentRiskLevel = severest(
    (risk?.riskLevel as DincRiskLevel | undefined) ?? null,
    null,
  );
  const severeConditions = currentRiskLevel === 'SEVERE' ? 1 : 0;

  return {
    age: detail.citizen.age,
    gender: detail.citizen.gender,
    conditions,
    chronicConditions: conditions.length,
    severeConditions,
    overdueCount,
    missedFollowups,
    priorReschedules,
    attendanceRate,
    followUpGapDays,
    daysSinceContact,
    escalations,
    nonAdherenceSignals,
    defaulterSignals: missedFollowups + priorReschedules + escalations,
    topPriority,
    currentRiskLevel,
    hasOpenVisit: hasOpenActivity,
    hasOpenCall: hasOpenActivity,
    approximate: false,
  };
}

/**
 * Lighter approximation built from loaded worklist rows only.
 *
 * APPROXIMATION: worklist rows carry no outcome text, journey, or demographics,
 * so `missedFollowups`, `priorReschedules`, `nonAdherenceSignals`,
 * `attendanceRate`, `age`, `gender` and `daysSinceContact` are NOT available and
 * default to 0 / null. Overdue, escalation, priority and the CDSE risk level are
 * all present on the row, so risk/follow-up ranking on the worklist stays
 * meaningful — it is just less complete than the full detail-page vector
 * (reflected in a lower confidence). `approximate` is set to true.
 */
export function worklistFeatures(rows: WorklistItem[]): Map<string, PatientFeatures> {
  const now = Date.now();
  const byCitizen = new Map<string, WorklistItem[]>();
  for (const row of rows) {
    if (!row.citizenId) continue;
    const list = byCitizen.get(row.citizenId) ?? [];
    list.push(row);
    byCitizen.set(row.citizenId, list);
  }

  const out = new Map<string, PatientFeatures>();
  for (const [citizenId, items] of byCitizen) {
    let overdueCount = 0;
    let escalations = 0;
    let topPriority: string | null = null;
    let currentRiskLevel: DincRiskLevel | null = null;
    let followUpGapDays: number | null = null;
    let hasOpen = false;
    const conditions = new Set<string>();

    for (const it of items) {
      const status = it.status.toUpperCase();
      if (status === 'PENDING' || status === 'EMERGENCY') hasOpen = true;
      if (it.dueDate) {
        const t = new Date(it.dueDate).getTime();
        if (!Number.isNaN(t)) {
          if (t < now && (status === 'PENDING' || status === 'EMERGENCY')) overdueCount += 1;
          else if (t >= now) {
            const gap = Math.floor((t - now) / DAY_MS);
            followUpGapDays = followUpGapDays == null ? gap : Math.min(followUpGapDays, gap);
          }
        }
      }
      if (it.isEscalation) escalations += 1;
      topPriority = higherPriority(topPriority, it.priority);
      currentRiskLevel = severest(currentRiskLevel, it.riskLevel);
      if (it.type) conditions.add(it.type);
    }

    const conditionList = Array.from(conditions);
    out.set(citizenId, {
      age: null,
      gender: null,
      conditions: conditionList,
      chronicConditions: conditionList.length,
      severeConditions: currentRiskLevel === 'SEVERE' ? 1 : 0,
      overdueCount,
      missedFollowups: 0,
      priorReschedules: 0,
      attendanceRate: null,
      followUpGapDays,
      daysSinceContact: null,
      escalations,
      nonAdherenceSignals: 0,
      defaulterSignals: escalations + overdueCount,
      topPriority,
      currentRiskLevel,
      hasOpenVisit: hasOpen,
      hasOpenCall: hasOpen,
      approximate: true,
    });
  }
  return out;
}

/** Stable string key for hook deps / memoization. */
export function featuresKey(id: string, f: PatientFeatures): string {
  return [
    id,
    f.age ?? '_',
    f.conditions.length,
    f.severeConditions,
    f.overdueCount,
    f.missedFollowups,
    f.priorReschedules,
    f.attendanceRate ?? '_',
    f.followUpGapDays ?? '_',
    f.daysSinceContact ?? '_',
    f.escalations,
    f.nonAdherenceSignals,
    f.topPriority ?? '_',
    f.currentRiskLevel ?? '_',
    f.approximate ? 'a' : 'f',
  ].join('|');
}
