'use client';

import { useUser } from '@/lib/UserContext';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import CareDashboard from '@/components/dashboard/CareDashboard';
import ComingSoon from '@/components/shell/ComingSoon';

export default function DashboardPage() {
  const { user, can } = useUser();

  // Guests have no session data to show.
  if (user.role === 'Guest') {
    return (
      <ComingSoon
        title="Dashboard"
        description="Sign in to see your personalised dashboard."
      />
    );
  }

  // Two workspaces, one route (M36). View-all holders (ADMIN) get the
  // operations command centre; frontline roles (CLINICIAN, ANM, CARE_ASSISTANT)
  // get the task-oriented Care workspace. The backend scopes activity data by
  // the same permission (M31), so the Care Dashboard only ever receives the
  // viewer's own assigned items.
  return can('dashboard.view.all') ? <AdminDashboard /> : <CareDashboard />;
}
