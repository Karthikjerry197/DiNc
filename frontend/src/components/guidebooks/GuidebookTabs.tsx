'use client';

export interface GuidebookTab {
  key: string;
  label: string;
}

/** Tab definitions. Only "overview" renders real content this milestone. */
export const GUIDEBOOK_TABS: GuidebookTab[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'protocol', label: 'Protocol' },
  { key: 'danger-signs', label: 'Danger Signs' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'treatment', label: 'Treatment' },
  { key: 'counselling', label: 'Counselling' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'dos-donts', label: "Do's & Don'ts" },
  { key: 'follow-up', label: 'Follow-up' },
  { key: 'faqs', label: 'FAQs' },
  { key: 'training', label: 'Training' },
  { key: 'references', label: 'References' },
];

interface GuidebookTabsProps {
  active: string;
  onChange: (key: string) => void;
}

export default function GuidebookTabs({ active, onChange }: GuidebookTabsProps) {
  return (
    <div className="gb-tabs" role="tablist" aria-label="Guidebook sections">
      {GUIDEBOOK_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`gb-tab${active === tab.key ? ' active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
