/**
 * User-specific preferences and profile fields stored in localStorage.
 * These are per-user (keyed by username) and client-side only.
 * Future milestones can migrate them to a backend API without changing callers.
 */

export interface UserProfile {
  email: string;
  phone: string;
  designation: string;
  department: string;
  facility: string;
}

export interface UserPreferences {
  language: string;
  dateFormat: string;
  timeFormat: string;
}

const DEFAULT_PROFILE: UserProfile = {
  email: '',
  phone: '',
  designation: '',
  department: '',
  facility: '',
};

const DEFAULT_PREFS: UserPreferences = {
  language: 'English',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12-hour',
};

function profileKey(username: string): string {
  return `dinc_profile_${username}`;
}

function prefsKey(username: string): string {
  return `dinc_prefs_${username}`;
}

export function getProfile(username: string): UserProfile {
  if (typeof window === 'undefined') return { ...DEFAULT_PROFILE };
  try {
    const raw = window.localStorage.getItem(profileKey(username));
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<UserProfile>) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(username: string, profile: UserProfile): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(profileKey(username), JSON.stringify(profile));
  }
}

export function getPreferences(username: string): UserPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(prefsKey(username));
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<UserPreferences>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePreferences(username: string, prefs: UserPreferences): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(prefsKey(username), JSON.stringify(prefs));
  }
}
