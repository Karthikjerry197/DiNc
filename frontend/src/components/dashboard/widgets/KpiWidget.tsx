'use client';

import type { AdminDashboardSummary } from '@/lib/api';

interface Props {
  stats: AdminDashboardSummary['stats'] | undefined;
}

interface CardDef {
  label: string;
  value: number | null;
  hint?: string;
  accent: string;
  icon: string;
}

function statValue(v: number | null): string {
  return v === null ? '—' : v.toLocaleString();
}

/** 8 KPI stat cards in a 4-column grid. */
export default function KpiWidget({ stats }: Props) {
  const cards: CardDef[] = [
    { label: 'Registered Citizens',     value: stats?.registeredCitizens    ?? null, accent: '#24a148', icon: '👥' },
    { label: 'Active Enrollments',      value: stats?.activeEnrollments     ?? null,
      hint: stats?.totalEnrollments != null ? `${stats.totalEnrollments.toLocaleString()} total` : undefined,
      accent: '#0284c7', icon: '📋' },
    { label: 'Programs',                value: stats?.programs               ?? null, accent: '#7c3aed', icon: '🗂' },
    { label: 'Sub Programs',            value: stats?.subPrograms            ?? null, accent: '#db2777', icon: '🔖' },
    { label: 'Knowledge Assets',        value: stats?.knowledgeAssets        ?? null, accent: '#d97706', icon: '📚' },
    { label: 'CPHC Services',           value: stats?.cphcServices           ?? null, accent: '#059669', icon: '🩺' },
    { label: 'Pending Notifications',   value: stats?.pendingNotifications   ?? null, accent: '#0891b2', icon: '🔔' },
    { label: 'Pending Tasks',           value: stats?.pendingTasks           ?? null,
      hint: stats?.overdueTasks != null ? `${stats.overdueTasks.toLocaleString()} overdue` : undefined,
      accent: '#dc2626', icon: '⏱' },
  ];

  return (
    <div className="stat-grid">
      {cards.map((card) => (
        <div key={card.label} className="stat-card">
          <div className="stat-card-top">
            <span
              className="stat-card-icon"
              style={{ background: `${card.accent}1a`, color: card.accent }}
            >
              {card.icon}
            </span>
            {card.hint && <span className="stat-card-hint">{card.hint}</span>}
          </div>
          <div className="stat-card-value">{statValue(card.value)}</div>
          <div className="stat-card-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
