'use client';

import PatientActions from '@/components/patients/PatientActions';

interface Props {
  onChanged: () => void;
  onToast: (msg: string) => void;
}

/** Compact Quick Actions widget — slim horizontal bar replacing the tall card grid. */
export default function QuickActionsWidget({ onChanged, onToast }: Props) {
  return (
    <PatientActions
      variant="compact"
      includeNavShortcuts
      onChanged={onChanged}
      onToast={onToast}
    />
  );
}
