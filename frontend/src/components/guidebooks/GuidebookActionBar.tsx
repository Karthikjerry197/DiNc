'use client';

interface GuidebookActionBarProps {
  onDownloadPdf: () => void;
  onVersionHistory: () => void;
  /** Disables Download PDF while the export is being generated. */
  downloading?: boolean;
}

/**
 * Bottom action bar. Every button here is live (M35A Wave 1 removed the
 * Approve / Edit / Delete placeholders; they return when their milestones ship).
 */
export default function GuidebookActionBar({
  onDownloadPdf,
  onVersionHistory,
  downloading = false,
}: GuidebookActionBarProps) {
  return (
    <div className="gb-actionbar">
      <div className="gb-actionbar-group">
        <button
          type="button"
          className="wl-btn"
          title="Download this guidebook as a PDF"
          onClick={onDownloadPdf}
          disabled={downloading}
        >
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
        <button
          type="button"
          className="wl-btn"
          title="View this guidebook's version history"
          onClick={onVersionHistory}
        >
          Version History
        </button>
      </div>
    </div>
  );
}
