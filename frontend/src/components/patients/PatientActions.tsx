'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { UserPlus, Upload, ClipboardList, BookOpen } from 'lucide-react';
import type { BulkRegistrationResult, RegistrationResult } from '@/lib/api';
import RegistrationWizard from './RegistrationWizard';

// Lazy-loaded so the Excel parser (xlsx) is only fetched when a worker actually
// opens Bulk Upload — keeping the Dashboard/Citizens/Worklist bundles light.
const BulkUploadDialog = dynamic(() => import('./BulkUploadDialog'), { ssr: false });

interface PatientActionsProps {
  /**
   * 'dashboard' — tall icon cards (original).
   * 'compact'   — slim horizontal pill row (~40% height of dashboard).
   * 'toolbar'   — inline button row.
   */
  variant?: 'dashboard' | 'compact' | 'toolbar';
  /** Dashboard/compact: also show Worklist + Guidebooks navigation shortcuts. */
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
 * RegistrationWizard and one BulkUploadDialog — so there is exactly one
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

  function handleRegistered(result: RegistrationResult) {
    setNewOpen(false);
    const enrolled = result.enrollments.length;
    onToast?.(
      `Patient ${result.uhid} registered${enrolled ? ` · ${enrolled} program(s) enrolled` : ''}.`,
    );
    onChanged?.();
  }

  function handleUploaded(result: BulkRegistrationResult) {
    onToast?.(
      `Bulk upload: ${result.created} created, ${result.duplicate} duplicate, ${result.failed} failed.`,
    );
    onChanged?.();
  }

  const isCards   = variant === 'dashboard';
  const isCompact = variant === 'compact';

  if (isCompact) {
    return (
      <>
        <div className="qa-compact-bar">
          <button
            type="button"
            className="qa-compact-btn qa-compact-btn--primary"
            onClick={() => setNewOpen(true)}
          >
            <span className="qa-compact-icon" aria-hidden="true"><UserPlus size={16} /></span>
            New Patient
          </button>
          <button
            type="button"
            className="qa-compact-btn"
            onClick={() => setBulkOpen(true)}
          >
            <span className="qa-compact-icon" aria-hidden="true"><Upload size={16} /></span>
            Bulk Upload
          </button>
          {includeNavShortcuts && (
            <>
              <Link href="/worklist" className="qa-compact-btn">
                <span className="qa-compact-icon" aria-hidden="true"><ClipboardList size={16} /></span>
                Worklist
              </Link>
              <Link href="/guidebooks" className="qa-compact-btn">
                <span className="qa-compact-icon" aria-hidden="true"><BookOpen size={16} /></span>
                Guidebooks
              </Link>
            </>
          )}
        </div>

        {newOpen && (
          <RegistrationWizard open onClose={() => setNewOpen(false)} onRegistered={handleRegistered} />
        )}
        {bulkOpen && (
          <BulkUploadDialog open onClose={() => setBulkOpen(false)} onUploaded={handleUploaded} />
        )}
      </>
    );
  }

  return (
    <>
      <div className={isCards ? 'quick-actions' : 'op-toolbar'}>
        <button
          type="button"
          className={isCards ? 'quick-action qa-primary' : 'btn btn-primary btn-sm'}
          onClick={() => setNewOpen(true)}
        >
          <span className="qa-icon" aria-hidden="true"><UserPlus size={16} /></span>
          <span className="qa-label">New Patient</span>
        </button>

        <button
          type="button"
          className={isCards ? 'quick-action' : 'btn btn-ghost btn-sm'}
          onClick={() => setBulkOpen(true)}
        >
          <span className="qa-icon" aria-hidden="true"><Upload size={16} /></span>
          <span className="qa-label">Bulk Upload Patients</span>
        </button>

        {isCards && includeNavShortcuts && (
          <>
            <Link href="/worklist" className="quick-action">
              <span className="qa-icon" aria-hidden="true"><ClipboardList size={16} /></span>
              <span className="qa-label">Worklist</span>
            </Link>
            <Link href="/guidebooks" className="quick-action">
              <span className="qa-icon" aria-hidden="true"><BookOpen size={16} /></span>
              <span className="qa-label">Guidebooks</span>
            </Link>
          </>
        )}
      </div>

      {newOpen && (
        <RegistrationWizard open onClose={() => setNewOpen(false)} onRegistered={handleRegistered} />
      )}
      {bulkOpen && (
        <BulkUploadDialog open onClose={() => setBulkOpen(false)} onUploaded={handleUploaded} />
      )}
    </>
  );
}
