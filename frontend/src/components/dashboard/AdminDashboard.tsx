'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAdminDashboard,
  fetchWorklistOverview,
  type AdminDashboardSummary,
  type WorklistItem,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import ReportDuplicateDialog, {
  type ReportDuplicateTarget,
} from '@/components/dataquality/ReportDuplicateDialog';
import TeleconsultationWindow from '@/components/consultation/TeleconsultationWindow';
import Workspace from '@/components/workspace/Workspace';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceGrid from '@/components/workspace/WorkspaceGrid';
import Panel from '@/components/workspace/Panel';
import PanelContent from '@/components/workspace/PanelContent';
import { useWorkspaceShell } from '@/components/workspace/useWorkspaceShell';
import DashboardDesigner from './DashboardDesigner';

/**
 * Admin Dashboard — the reference workspace migration (M27).
 *
 * Owns data fetching and global dialogs; delegates all widget rendering to
 * DashboardDesigner. The page is a single fixed-viewport Workspace: the header
 * band stays fixed and the widget grid scrolls only inside its PanelContent —
 * there is no page/body scroll and no `calc(100vh - Npx)` math.
 */
export default function AdminDashboard() {
  const [data, setData]               = useState<AdminDashboardSummary | null>(null);
  const [worklist, setWorklist]       = useState<WorklistItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [reportTarget, setReportTarget] = useState<ReportDuplicateTarget | null>(null);
  const [consultActivityId, setConsultActivityId] = useState<string | null>(null);
  const [toast, setToast]             = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token   = getToken() ?? '';
  const { user, can } = useUser();
  const role    = user.role;
  const isAdmin = can('dashboard.edit');

  // Opt this route into the fixed, non-scrolling workspace shell (Part D).
  useWorkspaceShell();

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    Promise.all([fetchAdminDashboard(token), fetchWorklistOverview(token)])
      .then(([summary, overview]) => {
        setData(summary);
        setWorklist(overview.items);
        setLoading(false);
      })
      .catch(() => {
        setError('Unable to load dashboard data.');
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  if (loading) {
    return (
      <Workspace aria-label="Dashboard">
        <WorkspaceHeader title="Dashboard" />
        <WorkspaceGrid template="single">
          <Panel variant="subtle" aria-label="Dashboard">
            <PanelContent>
              <div className="dash-loading">Loading dashboard&hellip;</div>
            </PanelContent>
          </Panel>
        </WorkspaceGrid>
      </Workspace>
    );
  }

  return (
    <Workspace aria-label="Dashboard">
      <WorkspaceHeader
        title="Dashboard"
        subtitle="Operations command centre • Live system summary"
      />

      <WorkspaceGrid template="single">
        <Panel variant="subtle" aria-label="Dashboard widgets">
          <PanelContent>
            {error && <div className="dash-error">{error}</div>}

            <DashboardDesigner
              token={token}
              role={role}
              isAdmin={isAdmin}
              data={data}
              worklistItems={worklist}
              onLoad={load}
              onFlash={flash}
              onConsult={(activityId) => setConsultActivityId(activityId)}
              onDuplicate={(target) => setReportTarget(target)}
            />
          </PanelContent>
        </Panel>
      </WorkspaceGrid>

      {reportTarget && (
        <ReportDuplicateDialog
          current={reportTarget}
          open
          onClose={() => setReportTarget(null)}
          onSubmitted={(request) => {
            setReportTarget(null);
            flash(`Duplicate request ${request.reference} submitted for review.`);
          }}
        />
      )}

      {consultActivityId && (
        <TeleconsultationWindow
          activityId={consultActivityId}
          open
          onClose={() => setConsultActivityId(null)}
          onCompleted={(result) => {
            setConsultActivityId(null);
            flash(
              result.nextActivity
                ? 'Consultation saved · next activity scheduled.'
                : 'Consultation saved.',
            );
            load();
          }}
        />
      )}

      {toast && <div className="cz-toast">{toast}</div>}
    </Workspace>
  );
}
