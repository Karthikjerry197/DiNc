'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import GuidebookTabs, { GUIDEBOOK_TABS } from '@/components/guidebooks/GuidebookTabs';
import GuidebookOverview from '@/components/guidebooks/GuidebookOverview';
import GuidebookActionBar from '@/components/guidebooks/GuidebookActionBar';
import EmptyGuidebook from '@/components/guidebooks/EmptyGuidebook';

/**
 * Guidebooks & Clinical Decision Support workspace — visual framework only.
 * Real guidebook data populates the list and the Overview tab; every other tab
 * and every action button is a placeholder ("Coming in a future milestone").
 */
export default function GuidebooksPage() {
  const [guidebooks, setGuidebooks] = useState<GuidebookListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GuidebookDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((label: string) => {
    setToast(`${label} — Coming in a future milestone.`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(guidebooks.map((g) => g.category))).sort(),
    [guidebooks],
  );

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
        setSelectedId(list[0]?.id ?? null);
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
    setActiveTab('overview');
    fetchGuidebookDetail(token, selectedId)
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

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const activeTabLabel =
    GUIDEBOOK_TABS.find((t) => t.key === activeTab)?.label ?? 'This section';

  return (
    <div className="page gb-page">
      <GuidebookToolbar
        categories={categories}
        total={guidebooks.length}
        onComingSoon={notify}
      />

      {error && <div className="dash-error">{error}</div>}

      <div className="gb-workspace">
        {listLoading ? (
          <aside className="gb-list">
            <div className="dash-loading">Loading&hellip;</div>
          </aside>
        ) : (
          <GuidebookList
            guidebooks={guidebooks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onComingSoon={notify}
          />
        )}

        <div className="gb-main">
          {detailLoading ? (
            <div className="dash-loading">Loading guidebook&hellip;</div>
          ) : !detail ? (
            <EmptyGuidebook
              title="Select a guidebook"
              message="Choose a protocol from the list to view its clinical decision support."
            />
          ) : (
            <>
              <GuidebookHeader detail={detail} />
              <GuidebookTabs active={activeTab} onChange={setActiveTab} />
              <div className="gb-tab-content">
                {activeTab === 'overview' ? (
                  <GuidebookOverview detail={detail} />
                ) : (
                  <EmptyGuidebook
                    icon="🚧"
                    title={activeTabLabel}
                    message="Coming in a future milestone."
                  />
                )}
              </div>
              <GuidebookActionBar onComingSoon={notify} />
            </>
          )}
        </div>
      </div>

      {toast && <div className="cz-toast">{toast}</div>}
    </div>
  );
}
