import RoleWorkspace from '@/components/admin/RoleWorkspace';

/** Modify Access — opens the Role Designer for an existing role (by key). */
export default function EditRolePage({ params }: { params: { key: string } }) {
  return <RoleWorkspace mode="edit" roleKey={decodeURIComponent(params.key)} />;
}
