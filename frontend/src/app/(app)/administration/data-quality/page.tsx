'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  fetchDuplicateRequests,
  reviewDuplicateRequest,
  resolveDuplicateRequest,
  duplicateReasonLabel,
  type DuplicateRequest,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { useUser } from '@/lib/UserContext';
import ComingSoon from '@/components/shell/ComingSoon';
import CompareRecordsDialog from '@/components/dataquality/CompareRecordsDialog';
import ReviewDecisionDialog, {
  type ReviewDecisionConfig,
} from '@/components/dataquality/ReviewDecisionDialog';
import { Inbox, RefreshCw } from 'lucide-react';
import { SkeletonTable } from '@/components/shell/Skeleton';

type DecisionKind = 'approve' | 'reject' | 'merge' | 'delete';

interface PendingDecision {
  request: DuplicateRequest;
  kind: DecisionKind;
}


function patientLabel(p: DuplicateRequest['currentPatient']): string {
  const name = p.fullName ?? 'Unnamed';
  return p.uhid ? `${p.uhid} · ${name}` : name;
}

function decisionConfig(kind: DecisionKind): ReviewDecisionConfig {
  switch (kind) {
    case 'approve':
      return {
        title: 'Approve Duplicate Request',
        message:
          'Approving confirms these records refer to the same person. You can then merge or delete the duplicate. Nothing is removed yet.',
        confirmLabel: 'Approve',
      };
    case 'reject':
      return {
        title: 'Reject Duplicate Request',
        message:
          'Rejecting marks this request as not a duplicate. Both patient records are kept unchanged. A reason is required.',
        confirmLabel: 'Reject',
        remarksRequired: true,
      };
    case 'merge':
      return {
        title: 'Merge Records',
        message:
          'Merge the duplicate patient into the current patient. The decision is recorded in the audit trail.',
        confirmLabel: 'Confirm Merge',
      };
    case 'delete':
      return {
        title: 'Delete Duplicate',
        message:
          'Delete the duplicate patient record. This is recorded in the audit trail and can only follow an approval.',
        confirmLabel: 'Confirm Delete',
        destructive: true,
      };
  }
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RESOLVED: 'Resolved',
};

/**
 * Administration → Data Quality → Duplicate Requests.
 * Lists every duplicate request and drives the review workflow: compare, approve,
 * reject, and (after approval) merge or delete. Administrators only.
 */
export default function DataQualityPage() {
  const { can } = useUser();
  const isAdmin = can('admin.data-quality');

  const [requests, setRequests] = useState<DuplicateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [compareId, setCompareId] = useState<string | null>(null);
  const [decision, setDecision] = useState<PendingDecision | null>(null);
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchDuplicateRequests(token)
      .then((list) => {
        setRequests(list);
        setError('');
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load duplicate requests.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleConfirm = useCallback(
    async (remarks: string) => {
      if (!decision || saving) return;
      const token = getToken();
      if (!token) {
        setDecisionError('Your session has expired. Please sign in again.');
        return;
      }
      setSaving(true);
      setDecisionError('');
      try {
        const { request, kind } = decision;
        if (kind === 'approve' || kind === 'reject') {
          await reviewDuplicateRequest(token, request.id, kind, remarks || undefined);
        } else {
          await resolveDuplicateRequest(
            token,
            request.id,
            kind === 'merge' ? 'MERGE' : 'DELETE',
            remarks || undefined,
          );
        }
        setDecision(null);
        flash('Request updated.');
        load();
      } catch (err) {
        setDecisionError(err instanceof Error ? err.message : 'Unable to update the request.');
      } finally {
        setSaving(false);
      }
    },
    [decision, saving, flash, load],
  );

  if (!isAdmin) {
    return (
      <ComingSoon
        title="Data Quality"
        description="Duplicate request management is available to administrators only."
      />
    );
  }

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <nav className="dq-breadcrumb" aria-label="Breadcrumb">
            <Link href="/administration">Administration</Link>
            <span aria-hidden="true"> / </span>
            <span>Data Quality</span>
          </nav>
          <h1 className="page-title">Duplicate Requests</h1>
          <p className="page-subtitle">
            {pendingCount} pending · {requests.length} total
          </p>
        </div>
        <button type="button" className="btn btn-ghost dq-refresh" onClick={load}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && <div className="dash-error">{error}</div>}

      <div className="panel">
        {loading ? (
          <SkeletonTable rows={6} />
        ) : requests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true"><Inbox size={22} /></div>
            <div className="empty-state-text">No duplicate requests submitted yet.</div>
          </div>
        ) : (
          <div className="dq-table-wrap">
            <table className="data-table dq-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Submitted By</th>
                  <th>Date</th>
                  <th>Current Patient</th>
                  <th>Possible Duplicate</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th className="dq-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.reference}</td>
                    <td>{r.submittedBy}</td>
                    <td>{formatDate(r.submittedAt)}</td>
                    <td>{patientLabel(r.currentPatient)}</td>
                    <td>{patientLabel(r.duplicatePatient)}</td>
                    <td>{duplicateReasonLabel(r.reason)}</td>
                    <td>
                      <span className={`pill dq-status-${r.status.toLowerCase()}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                        {r.resolution ? ` · ${r.resolution === 'MERGED' ? 'Merged' : 'Deleted'}` : ''}
                      </span>
                    </td>
                    <td className="dq-col-actions">
                      <div className="dq-row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setCompareId(r.id)}
                        >
                          Compare
                        </button>
                        {r.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setDecision({ request: r, kind: 'approve' })}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => setDecision({ request: r, kind: 'reject' })}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {r.status === 'APPROVED' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setDecision({ request: r, kind: 'merge' })}
                            >
                              Merge
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => setDecision({ request: r, kind: 'delete' })}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CompareRecordsDialog
        requestId={compareId ?? ''}
        open={compareId !== null}
        onClose={() => setCompareId(null)}
      />

      <ReviewDecisionDialog
        open={decision !== null}
        config={decision ? decisionConfig(decision.kind) : decisionConfig('approve')}
        saving={saving}
        error={decisionError}
        onConfirm={handleConfirm}
        onClose={() => {
          if (!saving) {
            setDecision(null);
            setDecisionError('');
          }
        }}
      />

      {toast && <div className="cz-toast" role="status">{toast}</div>}
    </div>
  );
}
