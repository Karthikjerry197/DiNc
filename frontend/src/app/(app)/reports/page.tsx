'use client';

import { useCallback, useEffect, useState } from 'react';
import { getToken } from '@/lib/session';
import { useUser } from '@/lib/UserContext';
import {
  fetchAnalyticsFilterOptions,
  type AnalyticsFilterOptions,
  type AnalyticsQueryParams,
} from '@/lib/api';
import FilterBar from '@/components/analytics/FilterBar';
import OperationsSection from '@/components/analytics/OperationsSection';
import ExecutiveSection from '@/components/analytics/ExecutiveSection';
import ProgramsSection from '@/components/analytics/ProgramsSection';
import WorklistSection from '@/components/analytics/WorklistSection';
import WorkersSection from '@/components/analytics/WorkersSection';
import RegistrationsSection from '@/components/analytics/RegistrationsSection';
import SchedulerSection from '@/components/analytics/SchedulerSection';
import WorkflowSection from '@/components/analytics/WorkflowSection';
import KnowledgeSection from '@/components/analytics/KnowledgeSection';
import RiskSection from '@/components/analytics/RiskSection';
import DiseasesSection from '@/components/analytics/DiseasesSection';

type Tab = 'operations' | 'executive' | 'programs' | 'worklist' | 'workers' | 'registrations' | 'scheduler' | 'workflow' | 'knowledge' | 'risk' | 'diseases';

const TABS: { key: Tab; label: string }[] = [
  { key: 'operations', label: 'Operations' },
  { key: 'executive', label: 'Executive' },
  { key: 'risk', label: 'Clinical Risk' },
  { key: 'diseases', label: 'Disease Analytics' },
  { key: 'programs', label: 'Programs' },
  { key: 'worklist', label: 'Worklist' },
  { key: 'workers', label: 'Workers' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'scheduler', label: 'Scheduler' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'knowledge', label: 'Knowledge' },
];

const EMPTY_PARAMS: AnalyticsQueryParams = {};

const FILTER_TABS: Tab[] = ['operations', 'executive', 'programs', 'worklist', 'workers', 'registrations', 'workflow', 'risk', 'diseases'];

export default function ReportsPage() {
  const { can } = useUser();
  const isAdmin = can('reports.admin');
  const token = getToken() ?? '';
  const allowed = can('reports.view');

  // Hooks must run unconditionally (before any early return) or React throws
  // when the permission result changes between renders (e.g. user switch).
  const [tab, setTab] = useState<Tab>('operations');
  const [params, setParams] = useState<AnalyticsQueryParams>(EMPTY_PARAMS);
  const [options, setOptions] = useState<AnalyticsFilterOptions | null>(null);

  // Allow deep links from KPI cards (e.g. /reports?tab=risk) to open a tab
  // directly. Read from window.location to avoid the useSearchParams Suspense
  // requirement; runs once on mount.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && TABS.some((t) => t.key === requested)) setTab(requested as Tab);
  }, []);

  useEffect(() => {
    if (!token || !allowed) return;
    fetchAnalyticsFilterOptions(token)
      .then(setOptions)
      .catch(() => { /* filter options are non-critical */ });
  }, [token, allowed]);

  const handleReset = useCallback(() => setParams(EMPTY_PARAMS), []);

  if (!allowed) {
    return (
      <div className="page">
        <div className="page-head"><div><h1 className="page-title">Reports &amp; Analytics</h1></div></div>
        <p style={{ padding: '2rem', color: '#6b7280' }}>Reports are not available for your role.</p>
      </div>
    );
  }

  const showFilters = FILTER_TABS.includes(tab);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Reports &amp; Analytics</h1>
          <p className="page-subtitle">
            Operational intelligence for PHC, district and NHM administrators
          </p>
        </div>
      </div>

      {showFilters && (
        <FilterBar
          params={params}
          options={options}
          isAdmin={isAdmin}
          onChange={setParams}
          onReset={handleReset}
        />
      )}

      <div className="rp-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`rp-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'operations' && (
        <OperationsSection token={token} params={params} isAdmin={isAdmin} />
      )}
      {tab === 'executive' && (
        <ExecutiveSection token={token} params={params} />
      )}
      {tab === 'programs' && (
        <ProgramsSection token={token} params={params} />
      )}
      {tab === 'worklist' && (
        <WorklistSection token={token} params={params} />
      )}
      {tab === 'workers' && (
        <WorkersSection token={token} params={params} isAdmin={isAdmin} />
      )}
      {tab === 'registrations' && (
        <RegistrationsSection token={token} params={params} />
      )}
      {tab === 'scheduler' && (
        <SchedulerSection token={token} />
      )}
      {tab === 'workflow' && (
        <WorkflowSection token={token} params={params} />
      )}
      {tab === 'knowledge' && (
        <KnowledgeSection token={token} />
      )}
      {tab === 'risk' && (
        <RiskSection token={token} params={params} />
      )}
      {tab === 'diseases' && (
        <DiseasesSection token={token} params={params} />
      )}
    </div>
  );
}
