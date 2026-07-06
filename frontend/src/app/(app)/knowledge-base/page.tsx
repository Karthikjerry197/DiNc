'use client';

import { useCallback, useRef, useState } from 'react';
import { useUser } from '@/lib/UserContext';
import KnowledgeSearch from '@/components/knowledge/KnowledgeSearch';
import FaqModule from '@/components/knowledge/FaqModule';
import TrainingCatalogue from '@/components/knowledge/TrainingModule';
import EmergencyModule from '@/components/knowledge/EmergencyModule';
import type { ReactNode } from 'react';
import { GraduationCap, HelpCircle, Siren } from 'lucide-react';

type Tab = 'faq' | 'training' | 'emergency';

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'faq', label: 'FAQ', icon: <HelpCircle size={14} /> },
  { key: 'training', label: 'Training', icon: <GraduationCap size={14} /> },
  { key: 'emergency', label: 'Emergency', icon: <Siren size={14} /> },
];

/**
 * Knowledge Hub — FAQ, Training and Emergency modules with a unified search.
 * Every section loads its content dynamically from the database (faqs,
 * training_modules, guidebooks); nothing is hardcoded.
 */
export default function KnowledgeHubPage() {
  const { can } = useUser();
  const isAdmin = can('admin.pages');
  const [tab, setTab] = useState<Tab>('faq');
  const [toast, setToast] = useState('');
  const [toastKind, setToastKind] = useState<'ok' | 'err'>('ok');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    setToast(message);
    setToastKind(kind);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), kind === 'err' ? 4200 : 2600);
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

      {toast && (
        <div className={`cz-toast${toastKind === 'err' ? ' cz-toast--err' : ''}`} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
