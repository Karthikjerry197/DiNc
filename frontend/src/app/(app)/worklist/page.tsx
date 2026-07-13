'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchWorklistItemGuidebook,
  fetchWorklistOverview,
  guidebookHref,
  type WorklistItem,
  type WorklistOverview,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import { sortByUrgency } from '@/lib/urgency';
import {
  worklistFeatures,
  computePatientIntelligence,
  type PatientIntelligence,
} from '@/lib/ai';
import { useOverallRiskBatch } from '@/lib/useOverallRiskBatch';
import type { OverallRiskBatchInput } from '@/lib/api';
import { Sparkles } from 'lucide-react';
import ComingSoon from '@/components/shell/ComingSoon';
import WorklistToolbar from '@/components/worklist/WorklistToolbar';
import WorklistFilters, {
  EMPTY_WORKLIST_FILTERS,
  applyWorklistFilters,
  type WorklistFilterState,
} from '@/components/worklist/WorklistFilters';
import TeamMonitoring from '@/components/worklist/TeamMonitoring';
import WorklistTable from '@/components/worklist/WorklistTable';
import ReportDuplicateDialog, {
  type ReportDuplicateTarget,
} from '@/components/dataquality/ReportDuplicateDialog';
import PatientActions from '@/components/patients/PatientActions';
import { SkeletonTable } from '@/components/shell/Skeleton';

const EMPTY: WorklistOverview = {
  stats: {
    total: null,
    pending: null,
    overdue: null,
    dueToday: null,
    completed: null,
    escalations: null,
  },
  items: [],
  programs: [],
  assignees: [],
  monitoring: [],
};

/**
 * Worklist page. Renders inside the shared application shell (sidebar + top nav
 * are provided by the (app) layout). This milestone builds the UI/layout only —
 * data is read-only and filters/actions are presentational.
 */
export default function WorklistPage() {
  const { can } = useUser();
  const router = useRouter();
  const [data, setData] = useState<WorklistOverview>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportDuplicateTarget | null>(null);
  const [filters, setFilters] = useState<WorklistFilterState>(EMPTY_WORKLIST_FILTERS);
  const [toast, setToast] = useState('');
  // AI prioritisation (spec §5.3): view-over-data only — never mutates the fetch.
  const [aiSort, setAiSort] = useState<'default' | 'risk' | 'defaultProb' | 'priority'>('default');
  const [preset, setPreset] = useState<'none' | 'highRisk' | 'needsAttention'>('none');

  // Care managers (no view-all) work their own queue, so it is ordered by
  // urgency (M36): overdue → severe → due today → high priority → remaining.
  // Visual ordering only — the backend response is untouched, and supervisors
  // (worklist.view.all) keep today's ordering exactly as-is.
  const careView = !can('worklist.view.all');

  // Live filtering (M33.1): applied client-side to the loaded items.
  const filteredItems = useMemo(() => {
    const filtered = applyWorklistFilters(data.items, filters);
    return careView ? sortByUrgency(filtered) : filtered;
  }, [data.items, filters, careView]);
  const diseaseOptions = useMemo(
    () => Array.from(new Set(data.items.map((i) => i.type).filter((t): t is string => !!t))).sort(),
    [data.items],
  );

  // Per-citizen AI intelligence from the loaded rows (approximate — worklist
  // rows carry no journey/outcome text). Computed locally via the composer;
  // the detail-page Intelligence tab uses the async Predictor seam + full data.
  const intelById = useMemo(() => {
    const map = new Map<string, PatientIntelligence>();
    for (const [id, features] of worklistFeatures(data.items)) {
      map.set(id, computePatientIntelligence(features));
    }
    return map;
  }, [data.items]);

  const intelFor = useCallback(
    (item: WorklistItem): PatientIntelligence | undefined =>
      item.citizenId ? intelById.get(item.citizenId) : undefined,
    [intelById],
  );

  // Overall Risk for every loaded citizen, resolved in ONE batch request via the
  // shared OverallRiskService (no per-row calls, no local combination logic).
  const overallInputs = useMemo<OverallRiskBatchInput[]>(() => {
    const arr: OverallRiskBatchInput[] = [];
    for (const [id, intel] of intelById) {
      arr.push({ id, clinicalSeverity: intel.risk.dincLevel ?? 'NONE', followupRisk: intel.followup.band });
    }
    return arr;
  }, [intelById]);
  const overallById = useOverallRiskBatch(overallInputs);

  // Apply the AI preset filter, then the chosen ordering. Stable + non-mutating.
  const displayItems = useMemo(() => {
    let rows = filteredItems;
    if (preset === 'highRisk') {
      rows = rows.filter((i) => {
        const lvl = intelFor(i)?.risk.level;
        return lvl === 'Critical' || lvl === 'High';
      });
    } else if (preset === 'needsAttention') {
      rows = rows.filter((i) => {
        const intel = intelFor(i);
        return (
          i.isEscalation ||
          i.riskLevel === 'SEVERE' ||
          (intel ? intel.followup.band === 'High' || intel.risk.level === 'Critical' || intel.risk.level === 'High' : false)
        );
      });
    }
    if (aiSort === 'default') return rows;
    const score = (i: WorklistItem): number => {
      const intel = intelFor(i);
      if (aiSort === 'risk') return intel?.risk.score ?? -1;
      if (aiSort === 'defaultProb') return intel?.followup.probability ?? -1;
      return intel?.care.priority === 'High' ? 2 : intel?.care.priority === 'Medium' ? 1 : 0;
    };
    return [...rows].sort((a, b) => score(b) - score(a));
  }, [filteredItems, preset, aiSort, intelFor]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const reportDuplicate = useCallback((item: WorklistItem) => {
    if (!item.citizenId) return;
    setReportTarget({ id: item.citizenId, uhid: item.uhid, fullName: item.citizen });
  }, []);

  const startCall = useCallback((item: WorklistItem) => {
    router.push(`/worklist/${item.id}/consult`);
  }, [router]);

  // Re-fetch the worklist (used on mount and after a consultation completes so the
  // list reflects new statuses and auto-generated activities without manual reload).
  const reload = useCallback(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchWorklistOverview(token)
      .then((overview) => {
        setData(overview);
        setError('');
      })
      .catch(() => setError('Unable to load worklist data.'));
  }, []);

  // Context-aware: resolve the item's guidebook (worklist item → programme →
  // disease → mapping) and open the highest-priority match automatically,
  // passing any related guidebooks. When nothing is mapped, show the friendly
  // message in place rather than navigating.
  const openGuidebook = useCallback(
    async (itemId: string) => {
      const token = getToken();
      if (!token) {
        router.push('/guidebooks');
        return;
      }
      try {
        const resolution = await fetchWorklistItemGuidebook(token, itemId);
        if (!resolution.matched || !resolution.guidebook) {
          flash(resolution.message ?? 'No guidebook is currently mapped for this programme.');
          return;
        }
        // `activity` lets the Guidebooks page offer a direct path into the
        // consultation workspace for this item (M33.1 navigation); `related`
        // drives the Related Guidebooks section.
        router.push(guidebookHref(resolution, itemId));
      } catch {
        router.push('/guidebooks');
      }
    },
    [router, flash],
  );

  useEffect(() => {
    let active = true;
    const token = getToken();

    if (!token) {
      // No authenticated session (e.g. guest): render empty states, never fake rows.
      setLoading(false);
      return;
    }

    fetchWorklistOverview(token)
      .then((overview) => {
        if (active) {
          setData(overview);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load worklist data.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!can('worklist.view')) {
    return (
      <ComingSoon
        title="My Worklist"
        description="The worklist is not available for your role."
      />
    );
  }

  return (
    <div className="page wl-page">
      <WorklistToolbar
        stats={data.stats}
        actions={<PatientActions variant="toolbar" onChanged={reload} onToast={flash} />}
      />
      <WorklistFilters
        programs={data.programs}
        assignees={data.assignees}
        diseases={diseaseOptions}
        filters={filters}
        onChange={setFilters}
      />
      {/* Team-wide workload is a supervision view — only for view-all holders. */}
      {can('worklist.view.all') && <TeamMonitoring monitoring={data.monitoring} />}

      {error && <div className="dash-error">{error}</div>}

      {loading ? (
        <div className="panel"><SkeletonTable rows={8} /></div>
      ) : (
        <>
          <div className="wl-ai-controls">
            <div className="wl-ai-presets">
              <button
                type="button"
                className={`wl-ai-preset${preset === 'highRisk' ? ' active' : ''}`}
                onClick={() => setPreset((p) => (p === 'highRisk' ? 'none' : 'highRisk'))}
                aria-pressed={preset === 'highRisk'}
              >
                <Sparkles size={13} aria-hidden="true" /> AI High Risk
              </button>
              <button
                type="button"
                className={`wl-ai-preset${preset === 'needsAttention' ? ' active' : ''}`}
                onClick={() => setPreset((p) => (p === 'needsAttention' ? 'none' : 'needsAttention'))}
                aria-pressed={preset === 'needsAttention'}
              >
                <Sparkles size={13} aria-hidden="true" /> Needs Attention
              </button>
            </div>
            <label className="wl-ai-sort">
              <span>Sort</span>
              <select value={aiSort} onChange={(e) => setAiSort(e.target.value as typeof aiSort)}>
                <option value="default">Default</option>
                <option value="risk">Highest AI Risk</option>
                <option value="defaultProb">Highest Default Probability</option>
                <option value="priority">Highest Priority</option>
              </select>
            </label>
          </div>

          <WorklistTable
            items={displayItems}
            onOpenGuidebook={openGuidebook}
            onReportDuplicate={reportDuplicate}
            onStartCall={startCall}
            intelById={intelById}
            overallById={overallById}
          />
          <div className="wl-footer">
            <span>
              Showing {displayItems.length} of {data.items.length}{' '}
              {data.items.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        </>
      )}

      {reportTarget && (
        <ReportDuplicateDialog
          current={reportTarget}
          open={reportTarget !== null}
          onClose={() => setReportTarget(null)}
          onSubmitted={(request) => {
            setReportTarget(null);
            flash(`Duplicate request ${request.reference} submitted for review.`);
          }}
        />
      )}

      {toast && <div className="cz-toast" role="status">{toast}</div>}
    </div>
  );
}
