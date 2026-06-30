'use client';

import { useCallback, useRef, useState } from 'react';
import { getCurrentUser } from '@/lib/session';
import KnowledgeSearch from '@/components/knowledge/KnowledgeSearch';
import FaqModule from '@/components/knowledge/FaqModule';
import TrainingCatalogue from '@/components/knowledge/TrainingModule';
import EmergencyModule from '@/components/knowledge/EmergencyModule';

type Tab = 'faq' | 'training' | 'emergency';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'faq', label: 'FAQ', icon: '❓' },
  { key: 'training', label: 'Training', icon: '🎓' },
  { key: 'emergency', label: 'Emergency', icon: '🚨' },
];

/**
 * Knowledge Hub — FAQ, Training and Emergency modules with a unified search.
 * Every section loads its content dynamically from the database (faqs,
 * training_modules, guidebooks); nothing is hardcoded.
 */
export default function KnowledgeHubPage() {
  const isAdmin = getCurrentUser()?.role === 'ADMIN';
  const [tab, setTab] = useState<Tab>('faq');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  return (
    <div className="page kh-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Knowledge Hub</h1>
          <p className="page-subtitle">FAQs, training &amp; emergency protocols for frontline workers</p>
        </div>
      </div>

      <KnowledgeSearch />

      <div className="kh-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`kh-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="kh-panel">
        {tab === 'faq' && <FaqModule isAdmin={isAdmin} onToast={flash} />}
        {tab === 'training' && <TrainingCatalogue />}
        {tab === 'emergency' && <EmergencyModule />}
      </div>

      {toast && <div className="cz-toast">{toast}</div>}
    </div>
  );
}
