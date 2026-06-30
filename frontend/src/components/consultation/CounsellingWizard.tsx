'use client';

import type { CounsellingSection } from '@/lib/api';

interface CounsellingWizardProps {
  sections: CounsellingSection[];
  selectedIds: Set<string>;
  currentStep: number;
  onToggle: (id: string) => void;
  onStep: (step: number) => void;
  disabled?: boolean;
}

/**
 * Tablet-optimised, database-driven counselling wizard.
 *
 * Renders one section at a time with large touch-friendly selectable item rows.
 * Section content comes entirely from the DB via ConsultationContext — no disease
 * content is hardcoded here. Selecting an item immediately updates the live note
 * via the selectedIds → useDocumentationEngine → DocumentationPreview chain.
 *
 * Navigation: tab strip (all sections visible) + Previous / Next / Complete buttons.
 * "Complete →" on the last section advances to step === sections.length, which
 * the parent page renders as the outcome + notes form.
 */
export default function CounsellingWizard({
  sections,
  selectedIds,
  currentStep,
  onToggle,
  onStep,
  disabled = false,
}: CounsellingWizardProps) {
  if (sections.length === 0) {
    return (
      <div className="cw-wizard-empty">
        No counselling content configured for this programme.
        <br />
        Proceed to record the consultation outcome.
      </div>
    );
  }

  const section = sections[currentStep];
  const sectionCounts = sections.map((s) =>
    s.items.filter((i) => selectedIds.has(i.id)).length,
  );

  return (
    <div className="cw-wizard">
      {/* ── Tab strip ─────────────────────────────────────────────────────────── */}
      <div className="cw-wizard-tabs" role="tablist" aria-label="Counselling sections">
        {sections.map((s, idx) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={idx === currentStep}
            className={`cw-wizard-tab${idx === currentStep ? ' cw-wizard-tab-active' : ''}`}
            onClick={() => onStep(idx)}
            disabled={disabled}
          >
            <span className="cw-wizard-tab-name">{s.name}</span>
            {sectionCounts[idx] > 0 && (
              <span className="cw-wizard-tab-badge" aria-label={`${sectionCounts[idx]} selected`}>
                {sectionCounts[idx]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Section header ────────────────────────────────────────────────────── */}
      <div className="cw-wizard-progress">
        <span className="cw-wizard-section-title">{section.name}</span>
        <span className="cw-wizard-step-indicator">
          Section {currentStep + 1} of {sections.length}
        </span>
      </div>

      {/* ── Item list ─────────────────────────────────────────────────────────── */}
      <div className="cw-wizard-items" role="group" aria-label={`${section.name} items`}>
        {section.items.length === 0 ? (
          <div className="cw-wizard-empty">No items in this section.</div>
        ) : (
          section.items.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                className={`cw-wizard-item${isSelected ? ' cw-wizard-item-sel' : ''}`}
                onClick={() => !disabled && onToggle(item.id)}
                disabled={disabled}
              >
                <span className="cw-wizard-check" aria-hidden="true">
                  {isSelected ? '✓' : ''}
                </span>
                <span className="cw-wizard-item-text">{item.body}</span>
              </button>
            );
          })
        )}
      </div>

      {/* ── Navigation bar ────────────────────────────────────────────────────── */}
      <div className="cw-wizard-nav">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onStep(currentStep - 1)}
          disabled={currentStep === 0 || disabled}
        >
          ← Previous
        </button>

        <span className="cw-wizard-sel-count">
          {sectionCounts[currentStep]
            ? `${sectionCounts[currentStep]} item${sectionCounts[currentStep] === 1 ? '' : 's'} selected`
            : 'None selected'}
        </span>

        {currentStep < sections.length - 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onStep(currentStep + 1)}
            disabled={disabled}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onStep(sections.length)}
            disabled={disabled}
          >
            Complete →
          </button>
        )}
      </div>
    </div>
  );
}
