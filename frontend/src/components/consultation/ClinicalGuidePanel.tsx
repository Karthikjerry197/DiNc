'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { GuidebookDetail, GuidebookSections } from '@/lib/api';
import type { ReactNode } from 'react';
import { BookOpen, ClipboardList, FileText, Lightbulb, ListChecks, MessageCircle, TriangleAlert, Workflow } from 'lucide-react';

// ── Section metadata ──────────────────────────────────────────────────────────
// Known sections get curated icons and accent colours.
// Unknown sections get a default neutral style — forward-compatible by design.

interface SectionMeta {
  title: string;
  icon: ReactNode;
  accentClass: string;
}

const KNOWN_SECTIONS: Record<string, SectionMeta> = {
  summary:           { title: 'Summary',              icon: <ClipboardList size={13} />, accentClass: '' },
  checklist:         { title: 'Clinical Checklist',   icon: <ListChecks size={13} />, accentClass: '' },
  counsellingPoints: { title: 'Counselling',           icon: <MessageCircle size={13} />, accentClass: 'cw-guide-badge-counselling' },
  referralGuidance:  { title: 'Referral Guidance',    icon: <Workflow size={13} />, accentClass: 'cw-guide-badge-referral' },
  clinicalPearls:    { title: 'Clinical Pearls',      icon: <Lightbulb size={13} />, accentClass: 'cw-guide-badge-pearls' },
  contraindications: { title: 'Contraindications',    icon: <TriangleAlert size={13} />,  accentClass: 'cw-guide-badge-contraindications' },
};

// Preferred rendering order for known sections.
const PREFERRED_ORDER = [
  'summary', 'checklist', 'counsellingPoints',
  'referralGuidance', 'clinicalPearls', 'contraindications',
];

const DEFAULT_META: SectionMeta = { title: '', icon: <FileText size={13} />, accentClass: '' };

/** Converts camelCase / snake_case key to a readable title. */
function keyToTitle(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function getMeta(key: string): SectionMeta {
  const known = KNOWN_SECTIONS[key];
  if (known) return known;
  return { ...DEFAULT_META, title: keyToTitle(key) };
}

/** Orders section keys: known sections first (PREFERRED_ORDER), then extras alphabetically. */
function orderKeys(keys: string[]): string[] {
  const known = PREFERRED_ORDER.filter((k) => keys.includes(k));
  const extra = keys.filter((k) => !PREFERRED_ORDER.includes(k)).sort();
  return [...known, ...extra];
}

// ── Collapsible section component ─────────────────────────────────────────────

interface CollapsibleSectionProps {
  sectionKey: string;
  value: string | string[];
}

function CollapsibleSection({ sectionKey, value }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(true);
  const meta = getMeta(sectionKey);
  const isList = Array.isArray(value);

  return (
    <div className="cw-guide-section">
      <button
        type="button"
        className="cw-guide-section-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`cw-guide-badge ${meta.accentClass}`}>
          {meta.icon} {meta.title || keyToTitle(sectionKey)}
        </span>
        <span className="cw-guide-toggle-arrow" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="cw-guide-section-body">
          {isList ? (
            <ul className="cw-guide-list">
              {(value as string[]).map((item, i) => (
                <li key={i} className="cw-guide-item">{item}</li>
              ))}
            </ul>
          ) : (
            <p className="cw-guide-text">{value as string}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Legacy fallback sections ──────────────────────────────────────────────────
// Shown when guidebook_sections JSONB is empty but legacy columns have content.

function LegacySection({
  title, icon, items, text,
}: { title: string; icon: ReactNode; items?: string[]; text?: string | null }) {
  const [open, setOpen] = useState(true);
  const hasContent = (items && items.length > 0) || text;
  if (!hasContent) return null;

  return (
    <div className="cw-guide-section">
      <button
        type="button"
        className="cw-guide-section-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="cw-guide-badge">{icon} {title}</span>
        <span className="cw-guide-toggle-arrow" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="cw-guide-section-body">
          {items && items.length > 0 ? (
            <ul className="cw-guide-list">
              {items.map((item, i) => <li key={i} className="cw-guide-item">{item}</li>)}
            </ul>
          ) : (
            <p className="cw-guide-text">{text}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ClinicalGuidePanelProps {
  guidebook: GuidebookDetail | null;
}

/**
 * Renders a guidebook's clinical sections in the left panel of the Consultation
 * Workspace. All sections are collapsible (▾/▸ toggle). Fully data-driven:
 * any key present in guidebook_sections JSONB is rendered automatically —
 * adding Drug Charts, NHM Circulars, or FAQs requires no frontend changes.
 * Falls back to legacy key_steps / escalation_criteria columns when no
 * structured sections exist yet.
 */
export default function ClinicalGuidePanel({ guidebook }: ClinicalGuidePanelProps) {
  if (!guidebook) {
    return (
      <div className="cw-guide-empty">
        <div style={{ marginBottom: 8 }} aria-hidden="true"><BookOpen size={26} /></div>
        No guidebook is mapped to this activity.
        <br />
        <Link
          href="/guidebooks"
          style={{ color: '#0284c7', fontSize: 12, marginTop: 8, display: 'inline-block' }}
        >
          Browse guidebooks →
        </Link>
      </div>
    );
  }

  const sections: GuidebookSections = guidebook.sections ?? {};
  const sectionKeys = Object.keys(sections);
  const hasStructured = sectionKeys.length > 0;
  const orderedKeys = orderKeys(sectionKeys);

  return (
    <>
      {/* Guidebook identity */}
      <div className="cw-guide-title">{guidebook.title}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
        {guidebook.category} · {guidebook.code}
      </div>

      {/* Structured sections (data-driven) */}
      {hasStructured
        ? orderedKeys.map((key) => (
            <CollapsibleSection key={key} sectionKey={key} value={sections[key]} />
          ))
        : (
          <>
            {/* Legacy fallback: render named columns as collapsible sections */}
            {guidebook.summary && (
              <LegacySection title="Summary" icon={<ClipboardList size={13} />} text={guidebook.summary} />
            )}
            <LegacySection
              title="Key Steps"
              icon={<ListChecks size={13} />}
              items={guidebook.keyRecommendations}
            />
            <LegacySection
              title="Referral Criteria"
              icon={<Workflow size={13} />}
              items={guidebook.referralCriteria}
            />
          </>
        )}

      {guidebook.evidenceSource && (
        <p className="cw-guide-source">Source: {guidebook.evidenceSource}</p>
      )}
    </>
  );
}
