'use client';

import type { GuidebookDetail } from '@/lib/api';

interface GuidebookOverviewProps {
  detail: GuidebookDetail;
}

function TextSection({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="gb-section">
      <div className="gb-section-label">{label}</div>
      {value && value.trim() ? (
        <p className="gb-section-text">{value}</p>
      ) : (
        <p className="gb-section-empty">Not available in the current records.</p>
      )}
    </div>
  );
}

function ListSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="gb-section">
      <div className="gb-section-label">{label}</div>
      {items.length > 0 ? (
        <ul className="gb-section-list">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="gb-section-empty">Not available in the current records.</p>
      )}
    </div>
  );
}

/**
 * Overview tab. Binds the structured sections to existing guidebook columns
 * where available; sections without a backing column show a professional empty
 * state. No medical content is ever generated.
 */
export default function GuidebookOverview({ detail }: GuidebookOverviewProps) {
  return (
    <div className="gb-overview">
      <TextSection label="Summary" value={detail.summary} />
      <TextSection label="Clinical Objective" value={null} />
      <TextSection label="Target Population" value={null} />
      <TextSection label="Evidence Source" value={detail.evidenceSource} />
      <ListSection label="Key Recommendations" items={detail.keyRecommendations} />
      <ListSection label="Referral Criteria" items={detail.referralCriteria} />
      <TextSection label="Expected Outcomes" value={null} />
    </div>
  );
}
