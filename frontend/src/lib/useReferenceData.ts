'use client';

import { useEffect, useState } from 'react';
import { fetchReferenceValues, type ReferenceValue } from '@/lib/api';
import { getToken } from '@/lib/session';

/** A minimal option shape a caller can supply as an offline fallback. */
export interface ReferenceOption {
  code: string;
  displayName: string;
  colour?: string | null;
  metadata?: Record<string, unknown>;
}

interface UseReferenceDataResult {
  values: ReferenceOption[];
  loading: boolean;
  /** True when the API failed and the supplied fallback is being used. */
  usingFallback: boolean;
  error: string | null;
}

// Module-level cache shared across every component/hook instance, so a category
// used by many dropdowns is fetched once. Cleared on reload; short-lived enough
// that admin edits appear on the next mount.
const cache = new Map<string, ReferenceValue[]>();
const inflight = new Map<string, Promise<ReferenceValue[]>>();

/** Clears the client cache (e.g. after an admin edits reference data). */
export function invalidateReferenceCache(category?: string): void {
  if (category) {
    cache.delete(category);
    inflight.delete(category);
  } else {
    cache.clear();
    inflight.clear();
  }
}

function load(category: string): Promise<ReferenceValue[]> {
  const cached = cache.get(category);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(category);
  if (existing) return existing;

  const token = getToken();
  if (!token) return Promise.reject(new Error('Not authenticated'));

  const promise = fetchReferenceValues(token, category, true)
    .then((values) => {
      cache.set(category, values);
      inflight.delete(category);
      return values;
    })
    .catch((err) => {
      inflight.delete(category);
      throw err;
    });
  inflight.set(category, promise);
  return promise;
}

/**
 * Loads a reference-data category's active values from PostgreSQL, with a shared
 * cache and an optional `fallback` (the previous hardcoded constant) used only
 * when the API is unavailable — so migrating a dropdown never breaks the page.
 */
export function useReferenceData(
  category: string,
  fallback: ReferenceOption[] = [],
): UseReferenceDataResult {
  const [values, setValues] = useState<ReferenceOption[]>(() => cache.get(category) ?? fallback);
  const [loading, setLoading] = useState(!cache.has(category));
  const [usingFallback, setUsingFallback] = useState(!cache.has(category) && fallback.length > 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const cached = cache.get(category);
    if (cached) {
      setValues(cached);
      setLoading(false);
      setUsingFallback(false);
      return;
    }
    setLoading(true);
    load(category)
      .then((list) => {
        if (!active) return;
        setValues(list);
        setUsingFallback(false);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        // Degrade gracefully to the supplied fallback (backward compatibility).
        setValues(fallback);
        setUsingFallback(fallback.length > 0);
        setError(err instanceof Error ? err.message : 'Unable to load reference data.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
    // fallback is intentionally excluded — callers pass a stable literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return { values, loading, usingFallback, error };
}
