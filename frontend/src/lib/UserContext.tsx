'use client';

import { createContext, useContext } from 'react';
import type { AuthUser } from './api';

export interface UserContextValue {
  user: AuthUser;
  /** Returns true when the current authenticated user holds the given permission. */
  can: (permission: string) => boolean;
}

/**
 * Provides the authenticated user and a permission checker to all descendants.
 * Provided by (app)/layout.tsx — always present on every authenticated page.
 */
export const UserContext = createContext<UserContextValue | null>(null);

/**
 * Returns the current authenticated user and bound permission checker.
 * Re-renders the calling component whenever the user switches (e.g., via Switch User).
 * Throws if called outside a <UserContext.Provider>.
 */
export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error(
      'useUser() must be called inside a component rendered under the (app) layout.',
    );
  }
  return ctx;
}
