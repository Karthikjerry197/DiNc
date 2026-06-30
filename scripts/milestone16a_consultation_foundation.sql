-- Milestone 16A: Clinical Consultation Engine — Foundation Schema
-- Run once against the target database. All statements are additive (IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS). Safe to re-run.

-- 1. Structured guidebook content ─────────────────────────────────────────────
--    Single JSONB column replaces the previous plan for 5 separate TEXT columns.
--    Shape: { summary?, checklist?, counsellingPoints?, referralGuidance?,
--             clinicalPearls?, contraindications? }
--    Each list field is a string[]. All fields are optional so existing rows are
--    unaffected. Administrators populate via direct SQL or a future admin UI.
ALTER TABLE public.guidebooks
  ADD COLUMN IF NOT EXISTS guidebook_sections JSONB;

-- 2a. Backfill guidebook_sections from legacy text columns.
--     Only touches rows where guidebook_sections is still NULL — never overwrites
--     any value an administrator has already set.
--     Column mapping:
--       summary            → sections.summary          (string)
--       key_steps          → sections.checklist        (array, split on ; or newline)
--       escalation_criteria → sections.referralGuidance (array, split on ; or newline)
--     The 'source' column is surfaced as evidenceSource in the API, not as a section.
UPDATE public.guidebooks
SET guidebook_sections = jsonb_strip_nulls(jsonb_build_object(
  'summary',
    CASE WHEN trim(coalesce(summary, '')) <> ''
         THEN to_jsonb(trim(summary))
         ELSE NULL::jsonb END,
  'checklist',
    CASE WHEN trim(coalesce(key_steps, '')) <> ''
         THEN (
           SELECT to_jsonb(array_agg(s ORDER BY ord))
           FROM (
             SELECT trim(e) AS s, row_number() OVER () AS ord
             FROM regexp_split_to_table(key_steps, E'[;\n]+') e
             WHERE trim(e) <> ''
           ) t
         )
         ELSE NULL::jsonb END,
  'referralGuidance',
    CASE WHEN trim(coalesce(escalation_criteria, '')) <> ''
         THEN (
           SELECT to_jsonb(array_agg(s ORDER BY ord))
           FROM (
             SELECT trim(e) AS s, row_number() OVER () AS ord
             FROM regexp_split_to_table(escalation_criteria, E'[;\n]+') e
             WHERE trim(e) <> ''
           ) t
         )
         ELSE NULL::jsonb END
))
WHERE guidebook_sections IS NULL;

-- 3. Consultation notes ────────────────────────────────────────────────────────
--    Stores the auto-generated (and optionally edited) consultation note.
--    DRAFT: auto-saved while the worker fills in the form (one per activity).
--    FINAL: persisted when the consultation outcome is saved (multiple allowed,
--           one per consultation session).
CREATE TABLE IF NOT EXISTS public.consultation_notes (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worklist_item_id   UUID        NOT NULL
                       REFERENCES public.worklist_items(id) ON DELETE CASCADE,
  outcome_record_id  UUID
                       REFERENCES public.outcome_records(id) ON DELETE SET NULL,
  generated_note     TEXT        NOT NULL,
  note_version       INT         NOT NULL DEFAULT 1,
  status             VARCHAR(10) NOT NULL DEFAULT 'DRAFT'
                       CHECK (status IN ('DRAFT', 'FINAL')),
  recorded_by        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One DRAFT note per activity at a time (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_notes_draft
  ON public.consultation_notes(worklist_item_id)
  WHERE status = 'DRAFT';

-- Fast lookup for an activity's notes.
CREATE INDEX IF NOT EXISTS idx_consultation_notes_worklist
  ON public.consultation_notes(worklist_item_id, created_at DESC);
