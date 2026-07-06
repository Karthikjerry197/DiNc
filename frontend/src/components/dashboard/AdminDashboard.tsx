'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchActiveAlerts,
  fetchAdminDashboard,
  fetchWorklistOverview,
  type AdminDashboardSummary,
  type AlertWithCitizen,
  type WorklistItem,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import ReportDuplicateDialog, {
  type ReportDuplicateTarget,
} from '@/components/dataquality/ReportDuplicateDialog';
import PatientActions from '@/components/patients/PatientActions';
import Workspace from '@/components/workspace/Workspace';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceGrid from '@/components/workspace/WorkspaceGrid';
import Panel from '@/components/workspace/Panel';
import PanelContent from '@/components/workspace/PanelContent';
import KpiRibbon, { type KpiItem } from '@/components/workspace/KpiRibbon';
import { useWorkspaceShell } from '@/components/workspace/useWorkspaceShell';
import {
  UsersRound,
  ClipboardCheck,
  Layers,
  BookOpen,
  Stethoscope,
  Bell,
  ListChecks,
  HeartPulse,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import TodaysWorklistPanel from './TodaysWorklistPanel';
import DashboardInspector from './DashboardInspector';
import { SkeletonStats, SkeletonTable } from '@/components/shell/Skeleton';

/** Consistent KPI ribbon icon size across the Dashboard. */
const KPI_ICON = 18;

/** Formats a metric value; null/undefined render as an em dash. */
function fmt(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString();
}

/**
 * The clinical risk distribution KPIs (M32) — a management metric, so it lives
 * in the main ribbon rather than the inspector. Counts come from the dashboard
 * summary's `risk` block (existing CDSE clinical_alerts data, no new API).
 */
function clinicalRiskItems(
  risk: AdminDashboardSummary['risk'] | undefined,
  go: (path: string) => void,
): KpiItem[] {
  return [
    {
      id: 'risk-low', icon: <HeartPulse size={KPI_ICON} />, value: fmt(risk?.low), label: 'Low Risk',
      tone: 'success',
      onClick: () => go('/reports?tab=risk'),
    },
    {
      id: 'risk-moderate', icon: <ShieldAlert size={KPI_ICON} />, value: fmt(risk?.moderate), label: 'Moderate Risk',
      tone: (risk?.moderate ?? 0) > 0 ? 'warn' : 'default',
      onClick: () => go('/reports?tab=risk'),
    },
    {
      // Severe risk opens the Action Centre (Notifications), which is the
      // SEVERE-only alert feed (M32) — the natural drill-down for this KPI.
      id: 'risk-severe', icon: <TriangleAlert size={KPI_ICON} />, value: fmt(risk?.severe), label: 'Severe Risk',
      tone: (risk?.severe ?? 0) > 0 ? 'danger' : 'default',
      onClick: () => go('/notifications'),
    },
  ];
}

/**
 * The system-health KPI ribbon items, derived from the existing dashboard
 * `stats` (no new API). Worklist outcome metrics deliberately live in the
 * Worklist panel header, not here — the ribbon shows overall system health
 * plus the clinical risk distribution (M32).
 */
function systemHealthItems(
  stats: AdminDashboardSummary['stats'] | undefined,
  go: (path: string) => void,
): KpiItem[] {
  return [
    {
      id: 'patients', icon: <UsersRound size={KPI_ICON} />, value: fmt(stats?.registeredCitizens), label: 'Patients',
      onClick: () => go('/citizens'),
    },
    {
      id: 'enrollments', icon: <ClipboardCheck size={KPI_ICON} />, value: fmt(stats?.activeEnrollments), label: 'Active Enrollments',
      hint: stats?.totalEnrollments != null ? `${stats.totalEnrollments.toLocaleString()} total` : undefined,
      onClick: () => go('/citizens'),
    },
    {
      id: 'programs', icon: <Layers size={KPI_ICON} />, value: fmt(stats?.programs), label: 'Programmes',
      hint: stats?.subPrograms != null ? `${stats.subPrograms.toLocaleString()} sub` : undefined,
      onClick: () => go('/reports?tab=programs'),
    },
    {
      id: 'knowledge', icon: <BookOpen size={KPI_ICON} />, value: fmt(stats?.knowledgeAssets), label: 'Knowledge Assets',
      onClick: () => go('/knowledge-base'),
    },
    // CPHC Services has no dedicated page/filtered view, so it stays static.
    { id: 'services', icon: <Stethoscope size={KPI_ICON} />, value: fmt(stats?.cphcServices), label: 'CPHC Services' },
    {
      id: 'alerts', icon: <Bell size={KPI_ICON} />, value: fmt(stats?.pendingNotifications), label: 'Pending Alerts',
      tone: (stats?.pendingNotifications ?? 0) > 0 ? 'warn' : 'default',
      onClick: () => go('/notifications'),
    },
    {
      id: 'tasks', icon: <ListChecks size={KPI_ICON} />, value: fmt(stats?.pendingTasks), label: 'Pending Tasks',
      hint: stats?.overdueTasks != null ? `${stats.overdueTasks.toLocaleString()} overdue` : undefined,
      tone: (stats?.overdueTasks ?? 0) > 0 ? 'danger' : 'default',
      onClick: () => go('/worklist'),
    },
  ];
}

/**
 * Admin Dashboard — the purpose-built M27 reference dashboard.
 *
 * Owns data fetching and global dialogs. The page is a single fixed-viewport
 * Workspace composed directly (not from Dashboard Studio): Header · KPI Ribbon ·
 * WorkspaceGrid(primary-inspector) with TodaysWorklistPanel (primary) and a single
 * DashboardInspector. There is no page/body scroll and no `calc(100vh - Npx)`.
 *
 * Dashboard Studio code remains intact but is not mounted here (Option A — the
 * "Edit Dashboard" affordance is hidden until Studio region editing is designed).
 */
export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData]               = useState<AdminDashboardSummary | null>(null);
  const [worklist, setWorklist]       = useState<WorklistItem[]>([]);
  const [alerts, setAlerts]           = useState<AlertWithCitizen[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [reportTarget, setReportTarget] = useState<ReportDuplicateTarget | null>(null);
  const [toast, setToast]             = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    Promise.all([
      fetchAdminDashboard(token),
      fetchWorklistOverview(token),
      // Active clinical alerts feed Priority Alerts; a failure here must not
      // break the dashboard, so it resolves to an empty list.
      fetchActiveAlerts(token).catch(() => [] as AlertWithCitizen[]),
    ])
      .then(([summary, overview, activeAlerts]) => {
        setData(summary);
        setWorklist(overview.items);
        setAlerts(activeAlerts);
        setError('');
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
              <>
                <SkeletonStats cards={6} />
                <SkeletonTable rows={8} />
              </>
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
        actions={
          <PatientActions variant="toolbar" onChanged={load} onToast={flash} />
        }
      />

      <KpiRibbon
        items={[
          ...systemHealthItems(data?.stats, (p) => router.push(p)),
          ...clinicalRiskItems(data?.risk, (p) => router.push(p)),
        ]}
        aria-label="System health and clinical risk"
      />

      {error && <div className="dash-error">{error}</div>}

      {/* Purpose-built regions: primary Worklist (~66%) + single Inspector (~34%). */}
      <WorkspaceGrid template="primary-inspector" className="dash-regions">
        <TodaysWorklistPanel
          worklist={data?.worklist}
          items={worklist}
          onFlash={flash}
          // One consultation workspace application-wide (M33.1): the Dashboard
          // Call opens the same /worklist/:id/consult page as every other
          // entry point, returning here afterwards.
          onConsult={(activityId) =>
            router.push(`/worklist/${activityId}/consult?returnUrl=${encodeURIComponent('/dashboard')}`)
          }
          onDuplicate={(citizenId, uhid, fullName) =>
            setReportTarget({ id: citizenId, uhid, fullName })
          }
        />
        <DashboardInspector data={data} alerts={alerts} />
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

      {toast && <div className="cz-toast" role="status">{toast}</div>}
    </Workspace>
  );
}
