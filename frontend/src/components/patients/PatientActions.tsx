'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BulkUploadResult, CitizenListItem } from '@/lib/api';
import NewPatientDialog from './NewPatientDialog';
import BulkUploadDialog from './BulkUploadDialog';

interface PatientActionsProps {
  /** 'dashboard' renders prominent action cards; 'toolbar' renders a button row. */
  variant?: 'dashboard' | 'toolbar';
  /** Dashboard only: also show Worklist + Guidebooks navigation shortcuts. */
  includeNavShortcuts?: boolean;
  /** Fired after a patient is created or a bulk upload completes (to refresh). */
  onChanged?: () => void;
  /** Optional toast hook so the host page can surface a confirmation. */
  onToast?: (message: string) => void;
}

/**
 * The SINGLE operational entry point for Patient Registration and Bulk Upload.
 *
 * Reused identically by the Dashboard (Quick Actions cards), the Citizens page and
 * the Worklist page (toolbar). It owns the dialog state and mounts the one
 * NewPatientDialog and one BulkUploadDialog — so there is exactly one
 * implementation of each workflow regardless of where it is launched.
 */
export default function PatientActions({
  variant = 'toolbar',
  includeNavShortcuts = false,
  onChanged,
  onToast,
}: PatientActionsProps) {
  const [newOpen, setNewOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  function handleCreated(citizen: CitizenListItem) {
    setNewOpen(false);
    onToast?.(`Patient ${citizen.uhid} registered.`);
    onChanged?.();
  }

  function handleUploaded(result: BulkUploadResult) {
    onToast?.(`Bulk upload: ${result.created} created, ${result.skipped} skipped.`);
    onChanged?.();
  }

  const isCards = variant === 'dashboard';

  return (
    <>
      <div className={isCards ? 'quick-actions' : 'op-toolbar'}>
        <button
          type="button"
          className={isCards ? 'quick-action qa-primary' : 'btn btn-primary btn-sm'}
          onClick={() => setNewOpen(true)}
        >
          <span className="qa-icon" aria-hidden="true">➕</span>
          <span className="qa-label">New Patient</span>
        </button>

        <button
          type="button"
          className={isCards ? 'quick-action' : 'btn btn-ghost btn-sm'}
          onClick={() => setBulkOpen(true)}
        >
          <span className="qa-icon" aria-hidden="true">📂</span>
          <span className="qa-label">Bulk Upload Patients</span>
        </button>

        {isCards && includeNavShortcuts && (
          <>
            <Link href="/worklist" className="quick-action">
              <span className="qa-icon" aria-hidden="true">📋</span>
              <span className="qa-label">Worklist</span>
            </Link>
            <Link href="/guidebooks" className="quick-action">
              <span className="qa-icon" aria-hidden="true">📖</span>
              <span className="qa-label">Guidebooks</span>
            </Link>
          </>
        )}
      </div>

      <NewPatientDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={handleCreated} />
      <BulkUploadDialog open={bulkOpen} onClose={() => setBulkOpen(false)} onUploaded={handleUploaded} />
    </>
  );
}
