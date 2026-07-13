'use client';

import { useReferenceData, type ReferenceOption } from '@/lib/useReferenceData';

interface ReferenceSelectProps {
  /** Reference category key, e.g. 'gender', 'priority'. */
  category: string;
  value: string;
  onChange: (code: string) => void;
  /** Hardcoded options used only if the API is unavailable (backward compat). */
  fallback?: ReferenceOption[];
  id?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  /** Adds a leading empty option (e.g. "Select…"). */
  placeholder?: string;
}

/**
 * API-driven `<select>` bound to a reference-data category. Replaces bespoke,
 * duplicated dropdown JSX across the app: options, labels and ordering all come
 * from PostgreSQL, with an optional `fallback` for graceful degradation.
 */
export default function ReferenceSelect({
  category,
  value,
  onChange,
  fallback,
  id,
  className = 'fc',
  disabled,
  required,
  placeholder,
}: ReferenceSelectProps) {
  const { values, loading } = useReferenceData(category, fallback);

  return (
    <select
      id={id}
      className={className}
      value={value}
      required={required}
      disabled={disabled || loading}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {/* Keep a stored value visible even if it was later deactivated. */}
      {value && !values.some((v) => v.code === value) && (
        <option value={value}>{value}</option>
      )}
      {values.map((v) => (
        <option key={v.code} value={v.code}>{v.displayName}</option>
      ))}
    </select>
  );
}
