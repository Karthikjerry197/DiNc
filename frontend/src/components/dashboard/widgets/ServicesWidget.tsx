'use client';

import type { AdminDashboardSummary } from '@/lib/api';

interface Props {
  services: AdminDashboardSummary['services'];
}

/** CPHC service chip grid. */
export default function ServicesWidget({ services }: Props) {
  if (!services || services.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">∅</div>
        <div className="empty-state-text">No active services configured.</div>
      </div>
    );
  }

  return (
    <div className="service-grid">
      {services.map((service) => (
        <div key={service.name} className="service-chip">
          <span
            className="service-dot"
            style={{ background: service.color ?? '#24a148' }}
            aria-hidden="true"
          />
          <span className="service-name">{service.name}</span>
        </div>
      ))}
    </div>
  );
}
