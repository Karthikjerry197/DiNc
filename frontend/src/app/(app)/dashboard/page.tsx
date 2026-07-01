'use client';

import { useUser } from '@/lib/UserContext';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import ComingSoon from '@/components/shell/ComingSoon';

export default function DashboardPage() {
  const { user } = useUser();

  if (user.role === 'ADMIN') {
    return <AdminDashboard />;
  }

  return (
    <ComingSoon
      title="Dashboard"
      description="A role-specific dashboard for your account is coming in a future milestone."
    />
  );
}
