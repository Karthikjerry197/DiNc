'use client';

import { getCurrentUser } from '@/lib/session';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import ComingSoon from '@/components/shell/ComingSoon';

/**
 * Dashboard entry point. The shell is role-ready: each role can render its own
 * dashboard here. This milestone implements only the Administrator dashboard;
 * other roles see a placeholder until their dashboard ships.
 */
export default function DashboardPage() {
  const user = getCurrentUser();

  if (user?.role === 'ADMIN') {
    return <AdminDashboard />;
  }

  return (
    <ComingSoon
      title="Dashboard"
      description="A dashboard for your role is coming in a future milestone."
    />
  );
}
