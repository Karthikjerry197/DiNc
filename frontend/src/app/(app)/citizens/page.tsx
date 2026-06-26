'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchCitizenDetail,
  fetchCitizenEnrollments,
  fetchCitizensList,
  fetchEnrollmentActivities,
  fetchEnrollmentDetail,
  type Activity,
  type CitizenDetail,
  type CitizenListItem,
  type EnrollmentDetail,
  type EnrollmentSummary,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import CitizenList from '@/components/citizens/CitizenList';
import CitizenSummary from '@/components/citizens/CitizenSummary';
import ActivityWorkspace from '@/components/citizens/ActivityWorkspace';
import AddProgramDialog from '@/components/citizens/AddProgramDialog';

/**
 * Citizen Workspace — the primary three-panel workspace opened from the
 * Worklist. This milestone builds the visual framework only: data is read-only
 * and every non-navigation action surfaces a "coming soon" notice.
 */
export default function CitizensPage() {
  const router = useRouter();
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
  const [addOpen, setAddOpen] = useState(false);
  const [enrollmentsRefresh, setEnrollmentsRefresh] = useState(0);
  const pendingEnrollmentId = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const notify = useCallback(
    (label: string) => flash(`${label} — Coming in a future milestone.`),
    [flash],
  );

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
  }, [selectedEnrollmentId]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  return (
    <div className="page cz-page">
      {error && <div className="dash-error">{error}</div>}

      <div className="cz-workspace">
        {listLoading ? (
          <aside className="cz-list">
            <div className="dash-loading">Loading&hellip;</div>
          </aside>
        ) : (
          <CitizenList
            citizens={citizens}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}

        <CitizenSummary
          detail={detail}
          loading={detailLoading}
          enrollments={enrollments}
          enrollmentsLoading={enrollmentsLoading}
          selectedEnrollmentId={selectedEnrollmentId}
          onSelectEnrollment={setSelectedEnrollmentId}
          enrollmentDetail={enrollmentDetail}
          enrollmentDetailLoading={enrollmentDetailLoading}
          onAddProgram={() => detail && setAddOpen(true)}
          onComingSoon={notify}
          onBack={() => router.push('/worklist')}
        />

        <ActivityWorkspace
          activities={activities}
          loading={activitiesLoading}
          error={activitiesError}
          hasEnrollment={!!selectedEnrollmentId}
        />
      </div>

      {selectedId && (
        <AddProgramDialog
          citizenId={selectedId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={(created) => {
            setAddOpen(false);
            pendingEnrollmentId.current = created.id;
            setEnrollmentsRefresh((n) => n + 1);
            flash('Program enrollment added.');
          }}
        />
      )}

      {toast && <div className="cz-toast">{toast}</div>}
    </div>
  );
}
