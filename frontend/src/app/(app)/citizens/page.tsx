'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchCitizenDetail,
  fetchCitizenEnrollments,
  fetchCitizensList,
  fetchEnrollmentActivities,
  fetchEnrollmentDetail,
  fetchEnrollmentGuidebook,
  type Activity,
  type CitizenDetail,
  type CitizenListItem,
  type EnrollmentDetail,
  type EnrollmentSummary,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import ComingSoon from '@/components/shell/ComingSoon';
import CitizenList from '@/components/citizens/CitizenList';
import CitizenSummary from '@/components/citizens/CitizenSummary';
import ActivityWorkspace from '@/components/citizens/ActivityWorkspace';
import AddProgramDialog from '@/components/citizens/AddProgramDialog';
import AddActivityDialog from '@/components/citizens/AddActivityDialog';
import StartConsultationDialog from '@/components/citizens/StartConsultationDialog';
import PatientTimeline from '@/components/citizens/PatientTimeline';
import ClinicalJourney from '@/components/citizens/ClinicalJourney';
import PatientActions from '@/components/patients/PatientActions';
import ClinicalDecisionPanel from '@/components/consultation/ClinicalDecisionPanel';
import Workspace from '@/components/workspace/Workspace';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceGrid from '@/components/workspace/WorkspaceGrid';
import { useWorkspaceShell } from '@/components/workspace/useWorkspaceShell';
import { SkeletonLines } from '@/components/shell/Skeleton';

/**
 * Citizen Workspace — the primary three-panel workspace opened from the
 * Worklist. Every rendered action is live (M35A Wave 1 removed the
 * coming-soon placeholders).
 *
 * useSearchParams requires a Suspense boundary for static prerendering, so the
 * page wraps the workspace (M35E — see the ?c= sync effect below).
 */
export default function CitizensPage() {
  return (
    <Suspense fallback={null}>
      <CitizensWorkspace />
    </Suspense>
  );
}

function CitizensWorkspace() {
  const { can } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Opt into the fixed, non-scrolling workspace shell (Part D) — only when the
  // citizen registry is actually rendered, so the unauthorized fallback keeps
  // its legacy scrolling page.
  useWorkspaceShell(can('citizens.view'));
  const [citizens, setCitizens] = useState<CitizenListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CitizenDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [enrollmentDetail, setEnrollmentDetail] = useState<EnrollmentDetail | null>(null);
  const [enrollmentDetailLoading, setEnrollmentDetailLoading] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesError, setActivitiesError] = useState('');
  const [activitiesRefresh, setActivitiesRefresh] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [startConsultOpen, setStartConsultOpen] = useState(false);
  // Consultations happen on a separate route, so returning here remounts the
  // page and the timeline reloads naturally; the key exists for future in-page
  // refresh triggers and currently never changes.
  const [timelineRefresh] = useState(0);
  const [enrollmentsRefresh, setEnrollmentsRefresh] = useState(0);
  const pendingEnrollmentId = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'journey'>('profile');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  // Refreshes the citizen list (after a registration / bulk upload) without
  // disturbing the current selection.
  const reloadCitizens = useCallback(() => {
    const token = getToken();
    if (!token) return;
    fetchCitizensList(token)
      .then(setCitizens)
      .catch(() => {
        /* keep existing list on failure */
      });
  }, []);

  // Context-aware: resolve the selected enrollment's guidebook, then navigate to
  // the Guidebooks page with it preselected. Falls back to the generic page.
  const openGuidebook = useCallback(async () => {
    const token = getToken();
    if (!token || !selectedEnrollmentId) {
      router.push('/guidebooks');
      return;
    }
    try {
      const guidebook = await fetchEnrollmentGuidebook(token, selectedEnrollmentId);
      if (guidebook) {
        router.push(`/guidebooks?g=${guidebook.id}`);
      } else {
        flash('No specific guidebook for this enrollment.');
        router.push('/guidebooks');
      }
    } catch {
      router.push('/guidebooks');
    }
  }, [router, selectedEnrollmentId, flash]);

  // Load the citizen list once, then select the requested (?c=) or first citizen.
  useEffect(() => {
    let active = true;
    const token = getToken();
    if (!token) {
      setListLoading(false);
      return;
    }

    fetchCitizensList(token)
      .then((list) => {
        if (!active) return;
        setCitizens(list);
        setListLoading(false);
        const requested = new URLSearchParams(window.location.search).get('c');
        const initial = list.find((c) => c.id === requested)?.id ?? list[0]?.id ?? null;
        setSelectedId(initial);
      })
      .catch(() => {
        if (active) {
          setError('Unable to load citizens.');
          setListLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Load detail whenever the selection changes.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const token = getToken();
    if (!token) return;

    let active = true;
    setDetailLoading(true);
    fetchCitizenDetail(token, selectedId)
      .then((d) => {
        if (active) {
          setDetail(d);
          setDetailLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setDetail(null);
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  // Load the selected citizen's enrollments (program chips + chip list).
  useEffect(() => {
    if (!selectedId) {
      setEnrollments([]);
      setSelectedEnrollmentId(null);
      return;
    }
    const token = getToken();
    if (!token) return;

    let active = true;
    setEnrollmentsLoading(true);
    fetchCitizenEnrollments(token, selectedId)
      .then((list) => {
        if (!active) return;
        setEnrollments(list);
        // After a create, select the new enrollment; otherwise keep first.
        const pending = pendingEnrollmentId.current;
        const next =
          (pending && list.find((e) => e.id === pending)?.id) ?? list[0]?.id ?? null;
        pendingEnrollmentId.current = null;
        setSelectedEnrollmentId(next);
        setEnrollmentsLoading(false);
      })
      .catch(() => {
        if (active) {
          setEnrollments([]);
          setSelectedEnrollmentId(null);
          setEnrollmentsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedId, enrollmentsRefresh]);

  // Load detail for the selected enrollment (Enrollment Information panel).
  useEffect(() => {
    if (!selectedEnrollmentId) {
      setEnrollmentDetail(null);
      return;
    }
    const token = getToken();
    if (!token) return;

    let active = true;
    setEnrollmentDetailLoading(true);
    fetchEnrollmentDetail(token, selectedEnrollmentId)
      .then((d) => {
        if (active) {
          setEnrollmentDetail(d);
          setEnrollmentDetailLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setEnrollmentDetail(null);
          setEnrollmentDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedEnrollmentId]);

  // Load activities for the selected enrollment (Activity Workspace).
  useEffect(() => {
    if (!selectedEnrollmentId) {
      setActivities([]);
      setActivitiesError('');
      return;
    }
    const token = getToken();
    if (!token) return;

    let active = true;
    setActivitiesLoading(true);
    setActivitiesError('');
    fetchEnrollmentActivities(token, selectedEnrollmentId)
      .then((list) => {
        if (active) {
          setActivities(list);
          setActivitiesLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setActivities([]);
          setActivitiesError('Unable to load activities.');
          setActivitiesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedEnrollmentId, activitiesRefresh]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Keep the selection in sync when ?c= changes after mount. Same-route
  // navigations (e.g. a TopBar bell alert clicked while already on Citizens)
  // do not remount the page, so the mount-time read alone would leave the URL
  // updated but the selection unchanged (M35E fix).
  const requestedId = searchParams.get('c');
  useEffect(() => {
    if (requestedId) {
      setSelectedId((current) => (current === requestedId ? current : requestedId));
    }
  }, [requestedId]);

  if (!can('citizens.view')) {
    return (
      <ComingSoon
        title="Citizens"
        description="The citizen registry is not available for your role."
      />
    );
  }

  const citizenListPanel = listLoading ? (
    <aside className="cz-list">
      <SkeletonLines lines={6} />
    </aside>
  ) : (
    <CitizenList citizens={citizens} selectedId={selectedId} onSelect={setSelectedId} />
  );

  return (
    <Workspace aria-label="Citizens">
      <WorkspaceHeader
        title="Citizens"
        subtitle="Patient registry & workspace"
        actions={
          <PatientActions variant="toolbar" onChanged={reloadCitizens} onToast={flash} />
        }
        tabs={
          <div className="cz-tab-bar">
            <button
              type="button"
              className={`cz-tab-btn${activeTab === 'profile' ? ' active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Profile
            </button>
            <button
              type="button"
              className={`cz-tab-btn${activeTab === 'journey' ? ' active' : ''}`}
              onClick={() => setActiveTab('journey')}
            >
              Clinical Journey
            </button>
          </div>
        }
      />

      {error && <div className="dash-error">{error}</div>}

      {activeTab === 'profile' ? (
        <>
          <WorkspaceGrid template="list-primary-inspector">
            {citizenListPanel}

            <CitizenSummary
              detail={detail}
              loading={detailLoading}
              enrollments={enrollments}
              enrollmentsLoading={enrollmentsLoading}
              selectedEnrollmentId={selectedEnrollmentId}
              onSelectEnrollment={setSelectedEnrollmentId}
              enrollmentDetail={enrollmentDetail}
              enrollmentDetailLoading={enrollmentDetailLoading}
              activities={activities}
              activitiesLoading={activitiesLoading}
              onAddProgram={() => detail && setAddOpen(true)}
              onOpenGuidebook={openGuidebook}
              onStartConsultation={() => selectedId && setStartConsultOpen(true)}
              onBack={() => router.push('/worklist')}
            />

            <ActivityWorkspace
              activities={activities}
              loading={activitiesLoading}
              error={activitiesError}
              hasEnrollment={!!selectedEnrollmentId}
              onNewActivity={() => selectedEnrollmentId && setAddActivityOpen(true)}
              onStartCall={(activityId) => {
                const returnUrl = encodeURIComponent(`/citizens?c=${selectedId ?? ''}`);
                router.push(`/worklist/${activityId}/consult?returnUrl=${returnUrl}`);
              }}
            />
          </WorkspaceGrid>

          <div className="cz-timeline-dock">
            <PatientTimeline citizenId={selectedId} refreshKey={timelineRefresh} />
          </div>
        </>
      ) : (
        <WorkspaceGrid template="list-detail">
          {citizenListPanel}

          <div className="cz-journey-main">
            <ClinicalDecisionPanel citizenId={selectedId} />
            <ClinicalJourney citizenId={selectedId} />
          </div>
        </WorkspaceGrid>
      )}

      {selectedId && (
        <AddProgramDialog
          citizenId={selectedId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={(result) => {
            setAddOpen(false);
            // Select the new enrollment; its activities (incl. the auto-created
            // initial activity) load automatically in the Activity Workspace.
            pendingEnrollmentId.current = result.enrollment.id;
            setEnrollmentsRefresh((n) => n + 1);
            flash(
              result.activity
                ? 'Program enrolled and initial activity created.'
                : 'Program enrollment added.',
            );
          }}
        />
      )}

      {selectedEnrollmentId && (
        <AddActivityDialog
          enrollmentId={selectedEnrollmentId}
          open={addActivityOpen}
          onClose={() => setAddActivityOpen(false)}
          onCreated={() => {
            setAddActivityOpen(false);
            setActivitiesRefresh((n) => n + 1);
            flash('Activity created.');
          }}
        />
      )}

      {selectedId && (
        <StartConsultationDialog
          citizenId={selectedId}
          enrollments={enrollments}
          open={startConsultOpen}
          onClose={() => setStartConsultOpen(false)}
        />
      )}

      {toast && <div className="cz-toast" role="status">{toast}</div>}
    </Workspace>
  );
}
