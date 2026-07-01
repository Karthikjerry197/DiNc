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
import DashboardDesigner from './DashboardDesigner';

/**
 * Admin Dashboard — owns data fetching and global dialogs.
 * All widget rendering is delegated to DashboardDesigner so this component
 * stays focussed on data concerns (not layout concerns).
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
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="dash-loading">Loading dashboard&hellip;</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Operations command centre · live system summary</p>
        </div>
      </div>

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
    </div>
  );
}
