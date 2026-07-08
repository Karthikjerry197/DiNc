'use client';

import Link from 'next/link';
import { useUser } from '@/lib/UserContext';
import ComingSoon from '@/components/shell/ComingSoon';
import type { ReactNode } from 'react';
import { Settings, ShieldCheck, Timer, UserRound, UsersRound, Workflow } from 'lucide-react';

interface AdminTile {
  label: string;
  description: string;
  href: string;
  icon: ReactNode;
}

const TILES: AdminTile[] = [
  {
    label: 'Data Quality',
    description: 'Review and resolve duplicate patient requests submitted by workers.',
    href: '/administration/data-quality',
    icon: <ShieldCheck size={20} />,
  },
  {
    label: 'Workflow Rules',
    description: 'Configure what happens after each care outcome — no code changes.',
    href: '/administration/workflow-rules',
    icon: <Workflow size={20} />,
  },
  {
    label: 'Scheduler',
    description: 'Automation engine — runs due follow-ups, retries and escalations on a timer.',
    href: '/administration/scheduler',
    icon: <Timer size={20} />,
  },
  {
    label: 'Account Settings',
    description: 'Manage your profile, security, dashboard layout, and personal preferences.',
    href: '/administration/account-settings',
    icon: <UserRound size={20} />,
  },
  {
    label: 'Users & Roles',
    description: 'Manage healthcare workers, administrators and access.',
    href: '/administration/users',
    icon: <UsersRound size={20} />,
  },
  {
    label: 'System Settings',
    description: 'Organization details, application info, security and scheduler at a glance.',
    href: '/administration/system-settings',
    icon: <Settings size={20} />,
  },
];

/**
 * Administration hub. Restricted to administrators; healthcare workers and guests
 * see a professional access notice rather than the management surfaces.
 */
export default function AdministrationPage() {
  const { can } = useUser();

  if (!can('admin.pages')) {
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
        {TILES.map((tile) => (
          <Link key={tile.label} href={tile.href} className="admin-tile">
            <span className="admin-tile-icon" aria-hidden="true">{tile.icon}</span>
            <div className="admin-tile-body">
              <div className="admin-tile-label">{tile.label}</div>
              <div className="admin-tile-desc">{tile.description}</div>
            </div>
            <span className="admin-tile-go" aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
