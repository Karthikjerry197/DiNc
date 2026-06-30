'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchWorklistItemGuidebook,
  fetchWorklistOverview,
  type WorklistItem,
  type WorklistOverview,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import WorklistToolbar from '@/components/worklist/WorklistToolbar';
import WorklistFilters from '@/components/worklist/WorklistFilters';
import TeamMonitoring from '@/components/worklist/TeamMonitoring';
import WorklistTable from '@/components/worklist/WorklistTable';
import ReportDuplicateDialog, {
  type ReportDuplicateTarget,
} from '@/components/dataquality/ReportDuplicateDialog';
import PatientActions from '@/components/patients/PatientActions';

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
  const router = useRouter();
  const [data, setData] = useState<WorklistOverview>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportDuplicateTarget | null>(null);
  const [toast, setToast] = useState('');

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2600);
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
      .then((overview) => setData(overview))
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
        router.push(guidebook ? `/guidebooks?g=${guidebook.id}` : '/guidebooks');
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

  return (
    <div className="page wl-page">
      <WorklistToolbar stats={data.stats} />
      <div className="op-toolbar-bar">
        <PatientActions variant="toolbar" onChanged={reload} onToast={flash} />
      </div>
      <WorklistFilters programs={data.programs} assignees={data.assignees} />
      <TeamMonitoring monitoring={data.monitoring} />

      {error && <div className="dash-error">{error}</div>}

      {loading ? (
        <div className="dash-loading">Loading worklist&hellip;</div>
      ) : (
        <>
          <WorklistTable
            items={data.items}
            onOpenGuidebook={openGuidebook}
            onReportDuplicate={reportDuplicate}
            onStartCall={startCall}
          />
          <div className="wl-footer">
            <span>
              Showing {data.items.length} {data.items.length === 1 ? 'item' : 'items'}
            </span>
            <div className="wl-pagination">
              <button type="button" className="wl-page-btn" disabled title="Previous page">‹</button>
              <span className="wl-page-current">1</span>
              <button type="button" className="wl-page-btn" disabled title="Next page">›</button>
            </div>
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

      {toast && <div className="cz-toast">{toast}</div>}
    </div>
  );
}
