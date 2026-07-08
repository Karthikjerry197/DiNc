'use client';

import type { ReactNode } from 'react';
import { Bell, Stethoscope } from 'lucide-react';
import type { AdminDashboardSummary } from '@/lib/api';
import Panel from '@/components/workspace/Panel';
import PanelContent from '@/components/workspace/PanelContent';
import ActivityWidget from './widgets/ActivityWidget';
import ServicesWidget from './widgets/ServicesWidget';

interface Props {
  data: AdminDashboardSummary | null;
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
 * sections (Recent Notifications · CPHC Services). Programme Summary now lives
 * in its own full-width strip above the worklist, so the inspector focuses on
 * the live notification feed and the CPHC service reference. These are inspector
 * sections, not independent Studio widgets; they reuse the existing widget
 * rendering + APIs.
 */
export default function DashboardInspector({ data }: Props) {
  return (
    <Panel variant="default" aria-label="Overview">
      <PanelContent>
        <Section icon={<Bell size={15} aria-hidden="true" />} title="Recent Notifications">
          <ActivityWidget activity={data?.recentActivity ?? []} />
        </Section>
        <Section icon={<Stethoscope size={15} aria-hidden="true" />} title="CPHC Services">
          <ServicesWidget services={data?.services ?? []} />
        </Section>
      </PanelContent>
    </Panel>
  );
}
