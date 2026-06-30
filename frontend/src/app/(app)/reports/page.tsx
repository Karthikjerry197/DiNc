'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCurrentUser, getToken } from '@/lib/session';
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

type Tab = 'operations' | 'executive' | 'programs' | 'worklist' | 'workers' | 'registrations' | 'scheduler' | 'workflow' | 'knowledge';

const TABS: { key: Tab; label: string }[] = [
  { key: 'operations', label: 'Operations' },
  { key: 'executive', label: 'Executive' },
  { key: 'programs', label: 'Programs' },
  { key: 'worklist', label: 'Worklist' },
  { key: 'workers', label: 'Workers' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'scheduler', label: 'Scheduler' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'knowledge', label: 'Knowledge' },
];

const EMPTY_PARAMS: AnalyticsQueryParams = {};

const FILTER_TABS: Tab[] = ['operations', 'executive', 'programs', 'worklist', 'workers', 'registrations', 'workflow'];

export default function ReportsPage() {
  const user = getCurrentUser();
  const isAdmin = user?.role === 'ADMIN';
  const token = getToken() ?? '';

  const [tab, setTab] = useState<Tab>('operations');
  const [params, setParams] = useState<AnalyticsQueryParams>(EMPTY_PARAMS);
  const [options, setOptions] = useState<AnalyticsFilterOptions | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchAnalyticsFilterOptions(token)
      .then(setOptions)
      .catch(() => { /* filter options are non-critical */ });
  }, [token]);

  const handleReset = useCallback(() => setParams(EMPTY_PARAMS), []);

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
    </div>
  );
}
