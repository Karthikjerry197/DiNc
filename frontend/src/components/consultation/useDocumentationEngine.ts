'use client';

import { useMemo } from 'react';
import type { ConsultationContext } from '@/lib/api';
import { generateConsultationNote, type NoteInput } from './DocumentationEngine';

/**
 * React wrapper around the pure DocumentationEngine.
 *
 * Accepts the full ConsultationContext plus current form/selection state and
 * returns the auto-generated note string. The note is recomputed only when
 * values actually change (serialised deps to avoid object-reference churn).
 *
 * 16B: pass `selectedIds` (Set of selected counselling item IDs) to generate a
 * COUNSELLING PROVIDED note block. When omitted the engine falls back to the
 * legacy STRUCTURED ASSESSMENT (clinicalData form fields) path.
 */
export function useDocumentationEngine(
  ctx: ConsultationContext | null,
  clinicalData: Record<string, unknown>,
  outcomeTypeId: string,
  clinicalNotes: string,
  remarks: string,
  selectedIds?: Set<string>,
): string {
  // Serialise the selection set so useMemo can detect changes without a deep
  // comparison — Set reference changes every toggle even when contents are equal.
  const selectedKey = selectedIds ? [...selectedIds].sort().join(',') : '';

  return useMemo((): string => {
    if (!ctx) return '';

    const outcome = ctx.outcomeOptions.find((o) => o.id === outcomeTypeId) ?? null;

    // Build counselling sections with only the selected items' note texts.
    const counsellingSections =
      ctx.counsellingSections?.length && selectedIds
        ? ctx.counsellingSections
            .map((section) => ({
              name: section.name,
              selectedItems: section.items
                .filter((item) => selectedIds.has(item.id))
                .map((item) => item.noteText),
            }))
            .filter((s) => s.selectedItems.length > 0)
        : undefined;

    const input: NoteInput = {
      patient: {
        fullName: ctx.patient.fullName,
        uhid: ctx.patient.uhid,
        age: ctx.patient.age,
        gender: ctx.patient.gender,
        phone: ctx.patient.phone,
        assignedWorker: ctx.patient.assignedWorker,
      },
      clinicalContext: {
        program: ctx.clinicalContext.program,
        condition: ctx.clinicalContext.condition,
        activity: ctx.clinicalContext.activity,
        enrollmentStatus: ctx.clinicalContext.enrollmentStatus,
      },
      outcome: outcome ? { name: outcome.name, category: outcome.category } : null,
      clinicalData,
      clinicalNotes,
      remarks,
      counsellingSections,
    };

    return generateConsultationNote(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, JSON.stringify(clinicalData), outcomeTypeId, clinicalNotes, remarks, selectedKey]);
}
