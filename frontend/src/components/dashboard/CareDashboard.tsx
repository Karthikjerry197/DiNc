'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchActiveAlerts,
  fetchAdminDashboard,
  fetchWorklistOverview,
  type AdminDashboardSummary,
  type AlertWithCitizen,
  type WorklistItem,
  type WorklistStats,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import { roleLabel } from '@/lib/format';
import { distinctPatients, groupCareTasks } from '@/lib/urgency';
import ReportDuplicateDialog, {
  type ReportDuplicateTarget,
} from '@/components/dataquality/ReportDuplicateDialog';
import Workspace from '@/components/workspace/Workspace';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceGrid from '@/components/workspace/WorkspaceGrid';
import Panel from '@/components/workspace/Panel';
import PanelHeader from '@/components/workspace/PanelHeader';
import PanelContent from '@/components/workspace/PanelContent';
import KpiRibbon, { type KpiItem } from '@/components/workspace/KpiRibbon';
import { useWorkspaceShell } from '@/components/workspace/useWorkspaceShell';
import {
  CalendarClock,
  CalendarDays,
  CircleCheck,
  ClipboardList,
  ListChecks,
  ShieldAlert,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import FollowupTable from './widgets/FollowupTable';
import CareInspector from './CareInspector';
import { SkeletonStats, SkeletonTable } from '@/components/shell/Skeleton';

/** Consistent KPI ribbon icon size (matches the Admin Dashboard). */
const KPI_ICON = 18;

function fmt(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString();
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

/**
 * A visual task group inside the Care Dashboard's main panel — coloured
 * heading + count over the shared compact follow-up table. Grouping is purely
 * frontend; the backend response order inside each group is untouched.
 */
function TaskGroup({
  icon,
  tone,
  title,
  items,
  emptyText,
  onFlash,
  onConsult,
  onDuplicate,
}: {
  icon: ReactNode;
  tone: 'danger' | 'warn' | 'ok';
  title: string;
  items: WorklistItem[];
  emptyText: string;
  onFlash: (msg: string) => void;
  onConsult: (activityId: string) => void;
  onDuplicate: (citizenId: string, uhid: string, fullName: string) => void;
}) {
  return (
    <section className="care-group">
      <h3 className={`care-group-title care-group-title--${tone}`}>
        {icon}
        {title}
        <span className="care-group-count">({items.length})</span>
      </h3>
      {items.length > 0 ? (
        <FollowupTable
          items={items}
          onFlash={onFlash}
          onConsult={onConsult}
          onDuplicate={onDuplicate}
        />
      ) : (
        <div className="care-group-empty">{emptyText}</div>
      )}
    </section>
  );
}

/**
 * Care Dashboard (M36) — the workspace for frontline roles (CLINICIAN, ANM,
 * CARE_ASSISTANT). Where the Admin Dashboard is an operations command centre,
 * this page answers one question: "What do I need to do today?"
 *
 * All data comes from the EXISTING viewer-scoped endpoints (M31): the worklist
 * overview, the dashboard summary's per-user worklist block, and the active
 * alerts feed. No new APIs; management/population metrics are never shown here.
 */
export default function CareDashboard() {
  const router = useRouter();
  const { user } = useUser();
  const [items, setItems]     = useState<WorklistItem[]>([]);
  const [stats, setStats]     = useState<WorklistStats | null>(null);
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [alerts, setAlerts]   = useState<AlertWithCitizen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [reportTarget, setReportTarget] = useState<ReportDuplicateTarget | null>(null);
  const [toast, setToast]     = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fixed, non-scrolling workspace shell — same frame as the Admin Dashboard.
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
      fetchWorklistOverview(token),
      // Only the viewer-scoped `worklist` block (Completed Today, No Answer)
      // is read from the summary; its population stats are ignored here.
      fetchAdminDashboard(token),
      fetchActiveAlerts(token).catch(() => [] as AlertWithCitizen[]),
    ])
      .then(([overview, dashSummary, activeAlerts]) => {
        setItems(overview.items);
        setStats(overview.stats);
        setSummary(dashSummary);
        setAlerts(activeAlerts);
        setError('');
        setLoading(false);
      })
      .catch(() => {
        setError('Unable to load your dashboard data.');
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const groups = useMemo(() => groupCareTasks(items), [items]);

  // Derived, viewer-scoped worker metrics (frontend-only — no new APIs).
  const todaysPatients  = distinctPatients([...groups.immediate, ...groups.dueToday]);
  const attentionCount  = distinctPatients(groups.immediate);
  const severePatients  = distinctPatients(items.filter((i) => i.riskLevel === 'SEVERE'));
  const overdueCount    = stats?.overdue ?? 0;
  const newAssignments  = useMemo(
    () =>
      [...groups.immediate, ...groups.dueToday, ...groups.upcoming].filter(
        (i) => i.reminders === 0,
      ).length,
    [groups],
  );
  const topActivityId =
    groups.immediate[0]?.id ?? groups.dueToday[0]?.id ?? groups.upcoming[0]?.id ?? null;

  const summarySentence =
    `You have ${todaysPatients} assigned ${plural(todaysPatients, 'patient')} today. ` +
    `${attentionCount} ${attentionCount === 1 ? 'requires' : 'require'} immediate attention. ` +
    `${overdueCount} ${plural(overdueCount, 'follow-up')} ${overdueCount === 1 ? 'is' : 'are'} overdue.`;

  const onConsult = useCallback(
    (activityId: string) =>
      router.push(`/worklist/${activityId}/consult?returnUrl=${encodeURIComponent('/dashboard')}`),
    [router],
  );
  const onDuplicate = useCallback(
    (citizenId: string, uhid: string, fullName: string) =>
      setReportTarget({ id: citizenId, uhid, fullName }),
    [],
  );

  // Worker-focused KPIs (M36) — deliberately NOT the management ribbon.
  const kpis: KpiItem[] = [
    {
      id: 'today-patients', icon: <UsersRound size={KPI_ICON} />, value: fmt(todaysPatients),
      label: "Today's Patients",
      onClick: () => router.push('/worklist'),
    },
    {
      id: 'pending', icon: <ListChecks size={KPI_ICON} />, value: fmt(stats?.pending),
      label: 'Pending Activities',
      onClick: () => router.push('/worklist'),
    },
    {
      id: 'overdue', icon: <CalendarClock size={KPI_ICON} />, value: fmt(stats?.overdue),
      label: 'Overdue Follow-ups',
      tone: overdueCount > 0 ? 'danger' : 'default',
      onClick: () => router.push('/worklist'),
    },
    {
      id: 'high-risk', icon: <ShieldAlert size={KPI_ICON} />, value: fmt(severePatients),
      label: 'High Risk Patients',
      tone: severePatients > 0 ? 'danger' : 'default',
      onClick: () => router.push('/notifications'),
    },
    {
      id: 'completed-today', icon: <CircleCheck size={KPI_ICON} />,
      value: fmt(summary?.worklist.completedToday),
      label: 'Completed Today',
      tone: 'success',
    },
  ];

  if (loading) {
    return (
      <Workspace aria-label="My Day">
        <WorkspaceHeader title="Dashboard" />
        <WorkspaceGrid template="single">
          <Panel variant="subtle" aria-label="Dashboard">
            <PanelContent>
              <>
                <SkeletonStats cards={5} />
                <SkeletonTable rows={8} />
              </>
            </PanelContent>
          </Panel>
        </WorkspaceGrid>
      </Workspace>
    );
  }

  return (
    <Workspace aria-label="My Day">
      <WorkspaceHeader
        title={`${timeGreeting()}, ${user.full_name}`}
        subtitle={`${roleLabel(user.role)} · ${summarySentence}`}
      />

      <KpiRibbon items={kpis} aria-label="My workload today" />

      {error && <div className="dash-error">{error}</div>}

      <WorkspaceGrid template="primary-inspector" className="dash-regions">
        <Panel aria-label="My Tasks">
          <PanelHeader
            title={
              <span className="dash-inline-icon-title">
                <ClipboardList size={16} aria-hidden="true" />
                My Tasks
              </span>
            }
            subtitle="Your assigned work, most urgent first"
          />
          <PanelContent>
            <TaskGroup
              icon={<TriangleAlert size={15} aria-hidden="true" />}
              tone="danger"
              title="Needs Immediate Attention"
              items={groups.immediate}
              emptyText="Nothing urgent right now — no overdue, severe or escalated items."
              onFlash={flash}
              onConsult={onConsult}
              onDuplicate={onDuplicate}
            />
            <TaskGroup
              icon={<CalendarClock size={15} aria-hidden="true" />}
              tone="warn"
              title="Due Today"
              items={groups.dueToday}
              emptyText="No further activities are scheduled for today."
              onFlash={flash}
              onConsult={onConsult}
              onDuplicate={onDuplicate}
            />
            <TaskGroup
              icon={<CalendarDays size={15} aria-hidden="true" />}
              tone="ok"
              title="Upcoming"
              items={groups.upcoming}
              emptyText="No upcoming assigned work."
              onFlash={flash}
              onConsult={onConsult}
              onDuplicate={onDuplicate}
            />
          </PanelContent>
        </Panel>

        <CareInspector
          alerts={alerts}
          priorities={{
            severePatients,
            overdueActivities: overdueCount,
            callbackRequests: summary?.worklist.noAnswer ?? 0,
            newAssignments,
          }}
          topActivityId={topActivityId}
        />
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
