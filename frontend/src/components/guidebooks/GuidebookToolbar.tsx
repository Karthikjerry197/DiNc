'use client';

import { Plus, Upload } from 'lucide-react';

interface GuidebookToolbarProps {
  total: number;
  onNewProtocol: () => void;
  onBulkUpload: () => void;
}

/**
 * Page-level toolbar for the Guidebooks workspace. Every control here is live
 * (M35A Wave 1 removed the non-functional search box and program/category
 * filter selects — the working protocol search lives in the list panel; the
 * toolbar filters return when filtering is actually implemented).
 */
export default function GuidebookToolbar({
  total,
  onNewProtocol,
  onBulkUpload,
}: GuidebookToolbarProps) {
  return (
    <div className="gb-toolbar">
      <div className="gb-toolbar-row">
        <div>
          <h1 className="page-title">Guidebook</h1>
          <p className="page-subtitle">
            Clinical decision support · {total} {total === 1 ? 'protocol' : 'protocols'}
          </p>
        </div>
        <div className="gb-toolbar-actions">
          <button
            type="button"
            className="wl-btn"
            title="Import many protocols from JSON, CSV or Excel"
            onClick={onBulkUpload}
          >
            <Upload size={14} aria-hidden="true" /> Bulk Upload
          </button>
          <button
            type="button"
            className="wl-btn wl-btn-primary"
            title="Import a new protocol from JSON"
            onClick={onNewProtocol}
          >
            <Plus size={14} aria-hidden="true" /> New Protocol
          </button>
        </div>
      </div>
    </div>
  );
}
