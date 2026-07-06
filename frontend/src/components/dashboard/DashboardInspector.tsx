'use client';

import type { ReactNode } from 'react';
import { TriangleAlert, History, Layers, Stethoscope } from 'lucide-react';
import type { AdminDashboardSummary, AlertWithCitizen } from '@/lib/api';
import Panel from '@/components/workspace/Panel';
import PanelContent from '@/components/workspace/PanelContent';
import PriorityAlertsWidget from './widgets/PriorityAlertsWidget';
import ActivityWidget from './widgets/ActivityWidget';
import ProgramsWidget from './widgets/ProgramsWidget';
import ServicesWidget from './widgets/ServicesWidget';

interface Props {
  data: AdminDashboardSummary | null;
  alerts: AlertWithCitizen[];
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

/**
 * The Dashboard's single inspector — a purpose-built panel composed of fixed
 * sections (Priority Alerts · Recent Activity · Programme Summary · CPHC
 * Services), ordered critical → summary. These are inspector sections, not
 * independent Studio widgets; they reuse the existing widget rendering + APIs.
 */
export default function DashboardInspector({ data, alerts }: Props) {
  return (
    <Panel variant="default" aria-label="Overview">
      <PanelContent>
        <Section icon={<TriangleAlert size={15} color="#b45309" aria-hidden="true" />} title="Priority Alerts">
          <PriorityAlertsWidget alerts={alerts} />
        </Section>
        <Section icon={<History size={15} aria-hidden="true" />} title="Recent Activity">
          <ActivityWidget activity={data?.recentActivity ?? []} />
        </Section>
        <Section icon={<Layers size={15} aria-hidden="true" />} title="Programme Summary">
          <ProgramsWidget programs={data?.programs ?? []} />
        </Section>
        <Section icon={<Stethoscope size={15} aria-hidden="true" />} title="CPHC Services">
          <ServicesWidget services={data?.services ?? []} />
        </Section>
      </PanelContent>
    </Panel>
  );
}
