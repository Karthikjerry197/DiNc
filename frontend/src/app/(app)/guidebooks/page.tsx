'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  fetchGuidebookDetail,
  fetchGuidebooksList,
  type GuidebookDetail,
  type GuidebookListItem,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import GuidebookToolbar from '@/components/guidebooks/GuidebookToolbar';
import GuidebookList from '@/components/guidebooks/GuidebookList';
import GuidebookHeader from '@/components/guidebooks/GuidebookHeader';
import GuidebookTabs from '@/components/guidebooks/GuidebookTabs';
import GuidebookSection from '@/components/guidebooks/GuidebookSection';
import GuidebookActionBar from '@/components/guidebooks/GuidebookActionBar';
import EmptyGuidebook from '@/components/guidebooks/EmptyGuidebook';
import ImportProtocolDialog from '@/components/guidebooks/ImportProtocolDialog';
import VersionHistoryDialog from '@/components/guidebooks/VersionHistoryDialog';
import { downloadGuidebookPdf } from '@/lib/guidebookPdf';
import { SkeletonLines } from '@/components/shell/Skeleton';

// Lazy-loaded so the Excel parser (xlsx) is only fetched when an administrator
// actually opens Bulk Upload — same pattern as PatientActions' BulkUploadDialog.
const BulkUploadProtocolsDialog = dynamic(
  () => import('@/components/guidebooks/BulkUploadProtocolsDialog'),
  { ssr: false },
);

/**
 * Guidebooks & Clinical Decision Support workspace. The section tabs are fully
 * data-driven: one tab per key in the guidebook's stored sections, in stored
 * order — unknown future sections appear automatically. Action-bar buttons
 * are all live (import, bulk upload, PDF export, version history).
 */
export default function GuidebooksPage() {
  const [guidebooks, setGuidebooks] = useState<GuidebookListItem[]>([]);
  // Guidebook → Consultation (M33.1): when opened from a worklist item
  // (?activity=<id>), offer a direct path into its consultation workspace.
  const [consultActivityId, setConsultActivityId] = useState<string | null>(null);
  // Related Guidebooks (M42): the other guidebooks mapped to the same clinical
  // context, passed as ?related=<id,id>. Rendered as quick-switch chips.
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GuidebookDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastKind, setToastKind] = useState<'ok' | 'err'>('ok');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    setToast(message);
    setToastKind(kind);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), kind === 'err' ? 4200 : 2600);
  }, []);

  useEffect(() => {
    let active = true;
    const token = getToken();
    if (!token) {
      setListLoading(false);
      return;
    }

    fetchGuidebooksList(token)
      .then((list) => {
        if (!active) return;
        setGuidebooks(list);
        setListLoading(false);
        // Context-aware entry: ?g=<guidebookId> preselects that guidebook
        // (and so highlights its program/category); otherwise the first.
        const params = new URLSearchParams(window.location.search);
        const requested = params.get('g');
        // `?q=<text>` deep-link (e.g. from AI care recommendations): when no
        // explicit guidebook id is given, preselect the first whose searchable
        // text matches the query. Purely additive — falls back to the first.
        const query = params.get('q')?.trim().toLowerCase() ?? '';
        const matched =
          !requested && query
            ? list.find((g) =>
                Object.values(g).some(
                  (v) => typeof v === 'string' && v.toLowerCase().includes(query),
                ),
              )?.id
            : undefined;
        const initial = list.find((g) => g.id === requested)?.id ?? matched ?? list[0]?.id ?? null;
        setSelectedId(initial);
        setConsultActivityId(params.get('activity'));
        // Related guidebooks and the "no mapping" deep-link message (M42).
        const relatedParam = params.get('related');
        setRelatedIds(
          relatedParam
            ? relatedParam.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        );
        if (params.get('unmapped') === '1') {
          showToast('No guidebook is currently mapped for this programme.', 'err');
        }
      })
      .catch(() => {
        if (active) {
          setError('Unable to load guidebooks.');
          setListLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const token = getToken();
    if (!token) return;

    let active = true;
    setDetailLoading(true);
    fetchGuidebookDetail(token, selectedId)
      .then((d) => {
        if (active) {
          setDetail(d);
          setActiveTab(Object.keys(d.sections)[0] ?? '');
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

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  /** Section keys in stored order — the entire tab set, no hardcoded names. */
  const sectionKeys = detail ? Object.keys(detail.sections) : [];

  /** Related guidebooks to offer as quick-switch chips (excludes the open one). */
  const relatedItems = relatedIds
    .map((id) => guidebooks.find((g) => g.id === id))
    .filter((g): g is GuidebookListItem => !!g && g.id !== selectedId);

  /** Adds a freshly imported guidebook to the list (server sort order) and opens it. */
  const handleImported = useCallback(
    (created: GuidebookListItem) => {
      setImportOpen(false);
      setGuidebooks((prev) =>
        [...prev, created].sort(
          (a, b) =>
            a.category.localeCompare(b.category) || a.title.localeCompare(b.title),
        ),
      );
      setSelectedId(created.id);
      showToast(`Protocol '${created.code}' imported.`);
    },
    [showToast],
  );

  /** After a bulk upload creates guidebooks, re-fetch the list from the server. */
  const handleBulkUploaded = useCallback(
    (result: { created: number }) => {
      const token = getToken();
      if (!token) return;
      fetchGuidebooksList(token)
        .then((list) => {
          setGuidebooks(list);
          showToast(`${result.created} protocol(s) imported.`);
        })
        .catch(() => undefined);
    },
    [showToast],
  );

  const handleDownloadPdf = useCallback(async () => {
    if (!detail || downloading) return;
    setDownloading(true);
    try {
      await downloadGuidebookPdf(detail);
    } catch {
      showToast('Unable to generate the PDF.', 'err');
    } finally {
      setDownloading(false);
    }
  }, [detail, downloading, showToast]);

  return (
    <div className="page gb-page">
      <GuidebookToolbar
        total={guidebooks.length}
        onNewProtocol={() => setImportOpen(true)}
        onBulkUpload={() => setBulkOpen(true)}
      />

      {error && <div className="dash-error">{error}</div>}

      {consultActivityId && (
        <div className="gb-consult-banner">
          <span>You opened this guidebook from a worklist activity.</span>
          <Link
            className="btn btn-primary gb-consult-banner-btn"
            href={`/worklist/${consultActivityId}/consult`}
          >
            Start Call →
          </Link>
        </div>
      )}

      <div className="gb-workspace">
        {listLoading ? (
          <aside className="gb-list">
            <SkeletonLines lines={6} />
          </aside>
        ) : (
          <GuidebookList
            guidebooks={guidebooks}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}

        <div className="gb-main">
          {detailLoading ? (
            <SkeletonLines lines={8} />
          ) : !detail ? (
            <EmptyGuidebook
              title="Select a guidebook"
              message="Choose a protocol from the list to view its clinical decision support."
            />
          ) : (
            <>
              {relatedItems.length > 0 && (
                <div className="gb-related">
                  <span className="gb-related-label">Related Guidebooks</span>
                  <div className="gb-related-chips">
                    {relatedItems.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        className="gb-related-chip"
                        title={g.summary ?? undefined}
                        onClick={() => setSelectedId(g.id)}
                      >
                        {g.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <GuidebookHeader detail={detail} />
              {sectionKeys.length === 0 ? (
                <div className="gb-tab-content">
                  <EmptyGuidebook
                    title="No sections available"
                    message="This guidebook has no structured content in the current records."
                  />
                </div>
              ) : (
                <>
                  <GuidebookTabs tabs={sectionKeys} active={activeTab} onChange={setActiveTab} />
                  <div className="gb-tab-content">
                    <GuidebookSection value={detail.sections[activeTab]} />
                  </div>
                </>
              )}
              <GuidebookActionBar
                onDownloadPdf={handleDownloadPdf}
                onVersionHistory={() => setHistoryOpen(true)}
                downloading={downloading}
              />
            </>
          )}
        </div>
      </div>

      <ImportProtocolDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
      />

      {bulkOpen && (
        <BulkUploadProtocolsDialog
          open
          onClose={() => setBulkOpen(false)}
          onUploaded={handleBulkUploaded}
        />
      )}

      <VersionHistoryDialog
        open={historyOpen}
        guidebookId={selectedId}
        guidebookTitle={detail ? `${detail.code} · ${detail.title}` : ''}
        onClose={() => setHistoryOpen(false)}
      />

      {toast && (
        <div className={`cz-toast${toastKind === 'err' ? ' cz-toast--err' : ''}`} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
