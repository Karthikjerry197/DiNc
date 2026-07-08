'use client';

import { useMemo, useState } from 'react';
import type { CounsellingSection, GuidebookDetail } from '@/lib/api';
import GuidebookSection from '@/components/guidebooks/GuidebookSection';
import { humanizeSectionKey } from '@/components/guidebooks/GuidebookTabs';
import { BookOpen, Check, CircleCheck, Phone } from 'lucide-react';

type ProtoTab = 'steps' | 'guide' | 'script';

/** Guidebook keys that read as call-script content (vs. reference guidance). */
const SCRIPT_KEY = /script|counsel|dialog|say/i;

interface CounsellingWizardProps {
  sections: CounsellingSection[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
  /** Guidebook content for the Guide/Script tabs (already in ConsultationContext). */
  guidebook: GuidebookDetail | null;
}

/**
 * Protocol panel (M37C reference-matched) — the left column of the
 * consultation workspace. Three tabs in the header band:
 *   Steps  — the database-driven counselling checklist as one flat, numbered
 *            list (checkbox + text, whitespace-separated, no cards); the tab
 *            itself carries the done/total counter.
 *   Guide  — the matched guidebook's reference sections.
 *   Script — the guidebook's script-like sections (counselling points etc.).
 *
 * Selection logic is unchanged: toggling an item updates selectedIds, which
 * drives the live note (useDocumentationEngine) and CDSE mapping exactly as
 * before. No section content is hardcoded.
 */
export default function CounsellingWizard({
  sections,
  selectedIds,
  onToggle,
  disabled = false,
  guidebook,
}: CounsellingWizardProps) {
  const [tab, setTab] = useState<ProtoTab>('steps');

  // One continuous, numbered step list across all protocol sections (the
  // reference shows a flat 1..N checklist with no section headers).
  const steps = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const done = steps.filter((i) => selectedIds.has(i.id)).length;

  const entries = Object.entries(guidebook?.sections ?? {});
  const scriptEntries = entries.filter(([key]) => SCRIPT_KEY.test(key));
  const guideEntries = entries.filter(([key]) => !SCRIPT_KEY.test(key));

  const tabs: { key: ProtoTab; label: React.ReactNode; icon: React.ReactNode }[] = [
    {
      key: 'steps',
      icon: <CircleCheck size={14} className="cw3-tab-ico-ok" aria-hidden="true" />,
      label: (
        <>
          Steps <span className="cw3-tab-count">{done}/{steps.length}</span>
        </>
      ),
    },
    { key: 'guide', icon: <BookOpen size={14} aria-hidden="true" />, label: 'Guide' },
    { key: 'script', icon: <Phone size={14} aria-hidden="true" />, label: 'Script' },
  ];

  function renderGuidebookEntries(list: [string, string | string[]][], emptyText: string) {
    if (list.length === 0) {
      return <div className="cw-wizard-empty">{emptyText}</div>;
    }
    return list.map(([key, value]) => (
      <section key={key} className="cw3-proto-section">
        <h3 className="cw3-proto-section-title">{humanizeSectionKey(key)}</h3>
        <GuidebookSection value={value} />
      </section>
    ));
  }

  return (
    <div className="cw3-proto">
      {/* Header band: Steps counter tab · Guide · Script */}
      <div className="cw3-tabs" role="tablist" aria-label="Protocol views">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className="cw3-tab"
            onClick={() => setTab(t.key)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Scrollable body — independent of the centre panel */}
      <div className="cw3-proto-body">
        {tab === 'steps' ? (
          steps.length === 0 ? (
            <div className="cw-wizard-empty">
              No counselling content configured for this programme.
              <br />
              Record the care outcome in the centre panel.
            </div>
          ) : (
            steps.map((item, idx) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  className={`cw3-step${isSelected ? ' cw3-step-sel' : ''}`}
                  onClick={() => !disabled && onToggle(item.id)}
                  disabled={disabled}
                >
                  <span className="cw3-step-check" aria-hidden="true">
                    {isSelected ? <Check size={13} /> : null}
                  </span>
                  <span className="cw3-step-text">{idx + 1}. {item.body}</span>
                </button>
              );
            })
          )
        ) : tab === 'guide' ? (
          renderGuidebookEntries(
            guideEntries,
            'No guidebook is mapped to this activity.',
          )
        ) : (
          renderGuidebookEntries(
            scriptEntries,
            'No call script is configured for this guidebook.',
          )
        )}
      </div>
    </div>
  );
}
