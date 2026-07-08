'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BookOpen,
  ClipboardList,
  ListTodo,
  Phone,
  Search,
  Zap,
} from 'lucide-react';
import type { AlertWithCitizen } from '@/lib/api';
import Panel from '@/components/workspace/Panel';
import PanelContent from '@/components/workspace/PanelContent';
import PriorityAlertsWidget from './widgets/PriorityAlertsWidget';

export interface CarePriorities {
  severePatients: number;
  overdueActivities: number;
  callbackRequests: number;
  newAssignments: number;
}

interface Props {
  alerts: AlertWithCitizen[];
  priorities: CarePriorities;
  /** The most urgent actionable activity — Start Consultation deep-links to it. */
  topActivityId: string | null;
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="dash-insp-section">
      <h3 className="dash-insp-title">
        {icon}
        {title}
      </h3>
      <div className="dash-insp-body">{children}</div>
    </section>
  );
}

function PriorityRow({
  label,
  count,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  tone: 'danger' | 'warn' | 'neutral';
  onClick: () => void;
}) {
  // A zero count renders neutral — a red "0" signals false urgency.
  const toneCls = count > 0 && tone !== 'neutral' ? ` care-pri-count--${tone}` : '';
  return (
    <li>
      <button type="button" className="care-pri-row" onClick={onClick}>
        <span className="care-pri-label">{label}</span>
        <span className={`care-pri-count${toneCls}`}>{count.toLocaleString()}</span>
      </button>
    </li>
  );
}

/**
 * The Care Dashboard's inspector (M36): worker-focused widgets only — Today's
 * Priorities · Recent Notifications (the existing alert feed) · Quick Actions
 * (existing navigation). Management widgets (programmes, services, population
 * metrics) intentionally do not appear here; they live on the Admin dashboard.
 */
export default function CareInspector({ alerts, priorities, topActivityId }: Props) {
  const router = useRouter();

  return (
    <Panel variant="default" aria-label="Today's priorities and quick actions">
      <PanelContent>
        <Section icon={<ListTodo size={15} aria-hidden="true" />} title="Today's Priorities">
          <ul className="care-pri-list">
            <PriorityRow
              label="Severe Patients"
              count={priorities.severePatients}
              tone="danger"
              onClick={() => router.push('/notifications')}
            />
            <PriorityRow
              label="Overdue Activities"
              count={priorities.overdueActivities}
              tone="danger"
              onClick={() => router.push('/worklist')}
            />
            <PriorityRow
              label="Callback Requests"
              count={priorities.callbackRequests}
              tone="warn"
              onClick={() => router.push('/worklist')}
            />
            <PriorityRow
              label="New Assignments"
              count={priorities.newAssignments}
              tone="neutral"
              onClick={() => router.push('/worklist')}
            />
          </ul>
        </Section>

        <Section icon={<Bell size={15} aria-hidden="true" />} title="Recent Notifications">
          <PriorityAlertsWidget alerts={alerts} />
        </Section>

        <Section icon={<Zap size={15} aria-hidden="true" />} title="Quick Actions">
          <div className="care-qa-list">
            <Link
              href={
                topActivityId
                  ? `/worklist/${topActivityId}/consult?returnUrl=${encodeURIComponent('/dashboard')}`
                  : '/worklist'
              }
              className="qa-compact-btn qa-compact-btn--primary"
            >
              <span className="qa-compact-icon" aria-hidden="true"><Phone size={16} /></span>
              Start Call
            </Link>
            <Link href="/worklist" className="qa-compact-btn">
              <span className="qa-compact-icon" aria-hidden="true"><ClipboardList size={16} /></span>
              Open Worklist
            </Link>
            <Link href="/citizens" className="qa-compact-btn">
              <span className="qa-compact-icon" aria-hidden="true"><Search size={16} /></span>
              Search Citizen
            </Link>
            <Link href="/guidebooks" className="qa-compact-btn">
              <span className="qa-compact-icon" aria-hidden="true"><BookOpen size={16} /></span>
              Guidebooks
            </Link>
            <Link href="/notifications" className="qa-compact-btn">
              <span className="qa-compact-icon" aria-hidden="true"><Bell size={16} /></span>
              Notifications
            </Link>
          </div>
        </Section>
      </PanelContent>
    </Panel>
  );
}
