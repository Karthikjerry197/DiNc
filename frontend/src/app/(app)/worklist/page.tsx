'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchWorklistItemGuidebook,
  fetchWorklistOverview,
  type WorklistItem,
  type WorklistOverview,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import { sortByUrgency } from '@/lib/urgency';
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

  // Context-aware: resolve the item's guidebook and open it preselected.
  const openGuidebook = useCallback(
    async (itemId: string) => {
      const token = getToken();
      if (!token) {
        router.push('/guidebooks');
        return;
      }
      try {
        const guidebook = await fetchWorklistItemGuidebook(token, itemId);
        // `activity` lets the Guidebooks page offer a direct path into the
        // consultation workspace for this item (M33.1 navigation).
        router.push(
          guidebook
            ? `/guidebooks?g=${guidebook.id}&activity=${itemId}`
            : `/guidebooks?activity=${itemId}`,
        );
      } catch {
        router.push('/guidebooks');
      }
    },
    [router],
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
          <WorklistTable
            items={filteredItems}
            onOpenGuidebook={openGuidebook}
            onReportDuplicate={reportDuplicate}
            onStartCall={startCall}
          />
          <div className="wl-footer">
            <span>
              Showing {filteredItems.length} of {data.items.length}{' '}
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
