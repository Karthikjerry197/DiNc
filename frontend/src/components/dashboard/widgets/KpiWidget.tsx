'use client';

import type { ReactNode } from 'react';
import {
  Bell,
  BookOpen,
  ClipboardCheck,
  Layers,
  ListChecks,
  Stethoscope,
  Tag,
  UsersRound,
} from 'lucide-react';
import type { AdminDashboardSummary } from '@/lib/api';

interface Props {
  stats: AdminDashboardSummary['stats'] | undefined;
}

interface CardDef {
  label: string;
  value: number | null;
  hint?: string;
  accent: string;
  icon: ReactNode;
}

function statValue(v: number | null): string {
  return v === null ? '—' : v.toLocaleString();
}

/** 8 KPI stat cards in a 4-column grid. */
export default function KpiWidget({ stats }: Props) {
  const ICON = 16;
  const cards: CardDef[] = [
    { label: 'Registered Citizens',     value: stats?.registeredCitizens    ?? null, accent: '#24a148', icon: <UsersRound size={ICON} /> },
    { label: 'Active Enrollments',      value: stats?.activeEnrollments     ?? null,
      hint: stats?.totalEnrollments != null ? `${stats.totalEnrollments.toLocaleString()} total` : undefined,
      accent: '#0284c7', icon: <ClipboardCheck size={ICON} /> },
    { label: 'Programs',                value: stats?.programs               ?? null, accent: '#7c3aed', icon: <Layers size={ICON} /> },
    { label: 'Sub Programs',            value: stats?.subPrograms            ?? null, accent: '#db2777', icon: <Tag size={ICON} /> },
    { label: 'Knowledge Assets',        value: stats?.knowledgeAssets        ?? null, accent: '#d97706', icon: <BookOpen size={ICON} /> },
    { label: 'CPHC Services',           value: stats?.cphcServices           ?? null, accent: '#059669', icon: <Stethoscope size={ICON} /> },
    { label: 'Pending Notifications',   value: stats?.pendingNotifications   ?? null, accent: '#0891b2', icon: <Bell size={ICON} /> },
    { label: 'Pending Tasks',           value: stats?.pendingTasks           ?? null,
      hint: stats?.overdueTasks != null ? `${stats.overdueTasks.toLocaleString()} overdue` : undefined,
      accent: '#dc2626', icon: <ListChecks size={ICON} /> },
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
