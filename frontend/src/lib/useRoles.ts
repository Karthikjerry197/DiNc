'use client';

import { useEffect, useState } from 'react';
import { fetchRbacRoles } from '@/lib/api';
import { getToken } from '@/lib/session';

/** A role option resolved from the `rbac_roles` single source of truth. */
export interface RoleOption {
  key: string;
  name: string;
}

/**
 * Offline fallback (used only if the RBAC roles API is unavailable). Not an
 * authoritative source — `rbac_roles` is. Kept minimal so a momentary API blip
 * never leaves a role picker empty.
 */
const ROLE_FALLBACK: RoleOption[] = [
  { key: 'ADMIN', name: 'Admin' },
  { key: 'CLINICIAN', name: 'Clinician' },
  { key: 'CARE_ASSISTANT', name: 'Care Assistant' },
  { key: 'ANM', name: 'ANM' },
];

// Session-lived cache: rbac_roles change rarely, so a role picker used in many
// places fetches once. Shared across every hook instance.
let cache: RoleOption[] | null = null;
let inflight: Promise<RoleOption[]> | null = null;

function load(): Promise<RoleOption[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  const token = getToken();
  if (!token) return Promise.resolve(ROLE_FALLBACK);
  inflight = fetchRbacRoles(token)
    .then((roles) => {
      cache = roles.filter((r) => r.isActive).map((r) => ({ key: r.key, name: r.name }));
      inflight = null;
      return cache;
    })
    .catch(() => {
      inflight = null;
      return ROLE_FALLBACK;
    });
  return inflight;
}

/**
 * Loads the role vocabulary from `rbac_roles` (M40 single source of truth), with
 * a shared cache and an offline fallback. `labelFor` maps a role key to its
 * display name for tables and badges.
 */
export function useRoles(): {
  roles: RoleOption[];
  loading: boolean;
  labelFor: (key: string) => string;
} {
  const [roles, setRoles] = useState<RoleOption[]>(cache ?? ROLE_FALLBACK);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    load().then((r) => {
      if (!alive) return;
      setRoles(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const labelFor = (key: string) => roles.find((r) => r.key === key)?.name ?? key;
  return { roles, loading, labelFor };
}
