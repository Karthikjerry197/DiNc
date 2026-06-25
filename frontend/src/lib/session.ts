import type { AuthUser } from './api';

const TOKEN_KEY = 'dinc_token';
const USER_KEY = 'dinc_user';
const GUEST_KEY = 'dinc_guest';

function stores(): Storage[] {
  if (typeof window === 'undefined') return [];
  return [window.localStorage, window.sessionStorage];
}

export function saveSession(token: string, user: AuthUser, remember: boolean): void {
  clearSession();
  const store = remember ? window.localStorage : window.sessionStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  for (const store of stores()) {
    const value = store.getItem(TOKEN_KEY);
    if (value) return value;
  }
  return null;
}

export function getStoredUser(): AuthUser | null {
  for (const store of stores()) {
    const value = store.getItem(USER_KEY);
    if (value) {
      try {
        return JSON.parse(value) as AuthUser;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function startGuestSession(): void {
  clearSession();
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(GUEST_KEY, 'true');
  }
}

export function isGuest(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(GUEST_KEY) === 'true';
}

/** Static identity used to represent an unauthenticated guest session in the UI. */
export const GUEST_USER: AuthUser = {
  username: 'guest',
  full_name: 'Guest',
  role: 'Guest',
};

/**
 * The user to display in the application shell: the stored authenticated user,
 * or the guest identity when browsing as a guest, otherwise null.
 */
export function getCurrentUser(): AuthUser | null {
  if (isGuest()) return GUEST_USER;
  return getStoredUser();
}

export function clearSession(): void {
  for (const store of stores()) {
    store.removeItem(TOKEN_KEY);
    store.removeItem(USER_KEY);
    store.removeItem(GUEST_KEY);
  }
}
