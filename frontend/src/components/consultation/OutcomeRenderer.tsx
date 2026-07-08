'use client';

import { Fragment, useMemo } from 'react';
import type { ClinicalFieldDef, FieldCondition } from '@/lib/api';

interface OutcomeRendererProps {
  /** Field definitions from the event's outcome template (metadata only). */
  fields: ClinicalFieldDef[];
  /** Current values, keyed by field key (falls back to label). */
  values: Record<string, unknown>;
  disabled?: boolean;
  onChange: (key: string, value: unknown) => void;
}

/** The value-map key for a field: its stable `key`, or its label as a fallback. */
export function fieldKey(field: ClinicalFieldDef): string {
  return field.key?.trim() ? field.key.trim() : field.label;
}

function isTruthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'boolean') return v;
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/** Evaluate a metadata condition against the current values. Pure, no disease logic. */
export function matchCondition(
  cond: FieldCondition,
  values: Record<string, unknown>,
): boolean {
  const v = values[cond.field];
  if (cond.truthy !== undefined) return cond.truthy ? isTruthy(v) : !isTruthy(v);
  if (cond.in) return cond.in.includes(String(v ?? ''));
  if (cond.equals !== undefined) return String(v ?? '') === cond.equals;
  return isTruthy(v);
}

/** A field is shown unless its `visibleWhen` condition fails. */
export function isFieldVisible(
  field: ClinicalFieldDef,
  values: Record<string, unknown>,
): boolean {
  return !field.visibleWhen || matchCondition(field.visibleWhen, values);
}

/** A field is mandatory when statically required, or when `requiredWhen` holds. */
export function isFieldRequired(
  field: ClinicalFieldDef,
  values: Record<string, unknown>,
): boolean {
  if (field.required) return true;
  return !!field.requiredWhen && matchCondition(field.requiredWhen, values);
}

/** Seed values from each field's configured default (called once on mount). */
export function initialValues(fields: ClinicalFieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined && f.defaultValue !== null) {
      out[fieldKey(f)] = f.defaultValue;
    }
  }
  return out;
}

const DEFAULT_SECTION = 'Clinical Assessment';

/**
 * The single, reusable, metadata-driven outcome form renderer (M37J). It renders
 * whatever field definitions it receives — grouped into sections, in configured
 * order, with per-field type, placeholder, help text, default value, conditional
 * visibility and conditional-mandatory rules — and contains NO disease-specific
 * branches or components. Any programme's outcome form is rendered here purely
 * from the metadata the backend returns; adding a new programme requires only
 * database configuration, never a code change.
 */
export default function OutcomeRenderer({
  fields,
  values,
  disabled,
  onChange,
}: OutcomeRendererProps) {
  // Group into sections, preserving configured section order then field order.
  const sections = useMemo(() => {
    const order: string[] = [];
    const bySection = new Map<string, ClinicalFieldDef[]>();
    const sectionRank = new Map<string, number>();
    for (const f of fields) {
      const name = f.section?.trim() || DEFAULT_SECTION;
      if (!bySection.has(name)) {
        bySection.set(name, []);
        order.push(name);
        sectionRank.set(name, f.sectionOrder ?? Number.MAX_SAFE_INTEGER);
      }
      bySection.get(name)!.push(f);
    }
    return order
      .sort((a, b) => (sectionRank.get(a)! - sectionRank.get(b)!))
      .map((name) => ({ name, fields: bySection.get(name)! }));
  }, [fields]);

  if (fields.length === 0) {
    return (
      <p className="tc-form-empty">
        No structured outcome fields are configured for this activity.
      </p>
    );
  }

  // A single section with the default name is unlabelled — it is just "the form".
  const showSectionHeadings =
    sections.length > 1 || sections[0]?.name !== DEFAULT_SECTION;

  return (
    <>
      {sections.map((section) => (
        <Fragment key={section.name}>
          {showSectionHeadings && (
            <div className="cw3-group-label">{section.name}</div>
          )}
          {section.fields
            .filter((field) => isFieldVisible(field, values))
            .map((field) => (
              <FieldControl
                key={fieldKey(field)}
                field={field}
                value={values[fieldKey(field)]}
                required={isFieldRequired(field, values)}
                disabled={disabled}
                onChange={onChange}
              />
            ))}
        </Fragment>
      ))}
    </>
  );
}

interface FieldControlProps {
  field: ClinicalFieldDef;
  value: unknown;
  required: boolean;
  disabled?: boolean;
  onChange: (key: string, value: unknown) => void;
}

/** Renders one field by its metadata type. Unknown types degrade to text. */
function FieldControl({ field, value, required, disabled, onChange }: FieldControlProps) {
  const key = fieldKey(field);
  const id = `cf-${key.replace(/\s+/g, '-').toLowerCase()}`;
  const strValue = (value ?? '') as string;
  const set = (v: unknown) => onChange(key, v);

  const label = (
    <label className="fl" htmlFor={id}>
      {field.label}
      {required && ' *'}
    </label>
  );
  const help = field.helpText ? (
    <span className="cw3-field-help">{field.helpText}</span>
  ) : null;

  const common = {
    id,
    className: 'fc',
    value: strValue,
    placeholder: field.placeholder,
    disabled,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => set(e.target.value),
  };

  let control: React.ReactNode;
  switch (field.type) {
    case 'longtext':
      control = <textarea {...common} className="fc modal-textarea" maxLength={2000} />;
      break;
    case 'number':
      control = <input {...common} type="number" inputMode="decimal" />;
      break;
    case 'date':
      control = <input {...common} type="date" />;
      break;
    case 'datetime':
      control = <input {...common} type="datetime-local" />;
      break;
    case 'dropdown':
    case 'select':
      control = (
        <select {...common}>
          <option value="">{field.placeholder ?? 'Select…'}</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
      break;
    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div className="tc-checkbox-group" role="group" aria-labelledby={id}>
          {field.options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label key={opt} className="tc-check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() =>
                    set(
                      checked
                        ? selected.filter((o) => o !== opt)
                        : [...selected, opt],
                    )
                  }
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      );
      break;
    }
    case 'radio':
      control = (
        <div className="tc-radio-group">
          {field.options.map((opt) => (
            <label key={opt} className="tc-radio">
              <input
                type="radio"
                name={id}
                value={opt}
                checked={strValue === opt}
                disabled={disabled}
                onChange={() => set(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      );
      break;
    case 'checkbox':
    case 'boolean': {
      const on = value === true || value === 'true';
      control = (
        <label className={`cw3-switch${on ? ' cw3-switch-on' : ''}`}>
          <input
            type="checkbox"
            checked={on}
            disabled={disabled}
            onChange={(e) => set(e.target.checked)}
          />
          <span className="cw3-switch-track" aria-hidden="true" />
          <span className="cw3-switch-text">{on ? 'Yes' : 'No'}</span>
        </label>
      );
      break;
    }
    default:
      control = <input {...common} type="text" maxLength={255} />;
  }

  // Boolean/checkbox renders its own inline label text; keep the field label above.
  return (
    <div className="fg" key={key}>
      {label}
      {control}
      {help}
    </div>
  );
}
