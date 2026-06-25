'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchCitizenDetail,
  fetchCitizensList,
  type CitizenDetail,
  type CitizenListItem,
} from '@/lib/api';
import { getToken } from '@/lib/session';
import CitizenList from '@/components/citizens/CitizenList';
import CitizenSummary from '@/components/citizens/CitizenSummary';
import ActivitiesTimeline from '@/components/citizens/ActivitiesTimeline';

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
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((label: string) => {
    setToast(`${label} — Coming in a future milestone.`);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

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
          onComingSoon={notify}
          onBack={() => router.push('/worklist')}
        />

        <ActivitiesTimeline
          detail={detail}
          loading={detailLoading}
          onComingSoon={notify}
        />
      </div>

      {toast && <div className="cz-toast">{toast}</div>}
    </div>
  );
}
