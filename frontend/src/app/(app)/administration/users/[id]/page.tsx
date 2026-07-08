import UserWorkspace from '@/components/admin/UserWorkspace';

/** Edit User / Modify Access — opens the User Workspace for an existing account. */
export default function EditUserPage({ params }: { params: { id: string } }) {
  return <UserWorkspace mode="edit" userId={params.id} />;
}
