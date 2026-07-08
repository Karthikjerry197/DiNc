import RoleWorkspace from '@/components/admin/RoleWorkspace';

/** Role Workspace — opens with a specific role preselected (by key). */
export default function EditRolePage({ params }: { params: { key: string } }) {
  return <RoleWorkspace initialMode="edit" initialRoleKey={decodeURIComponent(params.key)} />;
}
