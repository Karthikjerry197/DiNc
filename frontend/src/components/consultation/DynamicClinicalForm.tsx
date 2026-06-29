'use client';

import type { ClinicalFieldDef } from '@/lib/api';

interface DynamicClinicalFormProps {
  fields: ClinicalFieldDef[];
  values: Record<string, unknown>;
  disabled?: boolean;
  onChange: (label: string, value: unknown) => void;
}

/**
 * Renders a program-specific clinical form purely from data. The field
 * definitions come from the event's outcome template, so ANY CPHC program is
 * supported with no code change — this is the reusable clinical engine on the UI
 * side. Field types map to native controls; unknown types degrade to text.
 */
export default function DynamicClinicalForm({
  fields,
  values,
  disabled,
  onChange,
}: DynamicClinicalFormProps) {
  if (fields.length === 0) {
    return (
      <p className="tc-form-empty">
        No structured clinical fields are configured for this activity.
      </p>
    );
  }

  return (
    <>
      {fields.map((field) => {
        const id = `cf-${field.label.replace(/\s+/g, '-').toLowerCase()}`;
        const value = (values[field.label] ?? '') as string;
        const common = {
          id,
          className: 'fc',
          value,
          disabled,
          onChange: (
            e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
          ) => onChange(field.label, e.target.value),
        };

        return (
          <div className="fg" key={field.label}>
            <label className="fl" htmlFor={id}>
              {field.label}
              {field.required && ' *'}
            </label>

            {field.type === 'longtext' ? (
              <textarea {...common} className="fc modal-textarea" maxLength={2000} />
            ) : field.type === 'number' ? (
              <input {...common} type="number" inputMode="decimal" />
            ) : field.type === 'dropdown' ? (
              <select {...common}>
                <option value="">Select…</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === 'radio' ? (
              <div className="tc-radio-group">
                {field.options.map((opt) => (
                  <label key={opt} className="tc-radio">
                    <input
                      type="radio"
                      name={id}
                      value={opt}
                      checked={value === opt}
                      disabled={disabled}
                      onChange={() => onChange(field.label, opt)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            ) : (
              <input {...common} type="text" maxLength={255} />
            )}
          </div>
        );
      })}
    </>
  );
}
