'use client';

import Link from 'next/link';
import { getCurrentUser } from '@/lib/session';
import ComingSoon from '@/components/shell/ComingSoon';

interface AdminTile {
  label: string;
  description: string;
  href: string;
  icon: string;
  enabled: boolean;
}

const TILES: AdminTile[] = [
  {
    label: 'Data Quality',
    description: 'Review and resolve duplicate patient requests submitted by workers.',
    href: '/administration/data-quality',
    icon: '🧹',
    enabled: true,
  },
  {
    label: 'Workflow Rules',
    description: 'Configure what happens after each consultation outcome — no code changes.',
    href: '/administration/workflow-rules',
    icon: '🔀',
    enabled: true,
  },
  {
    label: 'Scheduler',
    description: 'Automation engine — runs due follow-ups, retries and escalations on a timer.',
    href: '/administration/scheduler',
    icon: '⏱',
    enabled: true,
  },
  {
    label: 'Users & Roles',
    description: 'Manage healthcare workers, administrators and access.',
    href: '/administration',
    icon: '👥',
    enabled: false,
  },
  {
    label: 'System Settings',
    description: 'Configure programs, services and operational parameters.',
    href: '/administration',
    icon: '⚙',
    enabled: false,
  },
];

/**
 * Administration hub. Restricted to administrators; healthcare workers and guests
 * see a professional access notice rather than the management surfaces.
 */
export default function AdministrationPage() {
  const user = getCurrentUser();

  if (user?.role !== 'ADMIN') {
    return (
      <ComingSoon
        title="Administration"
        description="Administration tools are available to administrators only."
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Administration</h1>
          <p className="page-subtitle">System management &amp; data governance</p>
        </div>
      </div>

      <section className="admin-tile-grid">
        {TILES.map((tile) =>
          tile.enabled ? (
            <Link key={tile.label} href={tile.href} className="admin-tile">
              <span className="admin-tile-icon" aria-hidden="true">{tile.icon}</span>
              <div className="admin-tile-body">
                <div className="admin-tile-label">{tile.label}</div>
                <div className="admin-tile-desc">{tile.description}</div>
              </div>
              <span className="admin-tile-go" aria-hidden="true">→</span>
            </Link>
          ) : (
            <div key={tile.label} className="admin-tile admin-tile-disabled" aria-disabled="true">
              <span className="admin-tile-icon" aria-hidden="true">{tile.icon}</span>
              <div className="admin-tile-body">
                <div className="admin-tile-label">
                  {tile.label} <span className="admin-tile-soon">Soon</span>
                </div>
                <div className="admin-tile-desc">{tile.description}</div>
              </div>
            </div>
          ),
        )}
      </section>
    </div>
  );
}
