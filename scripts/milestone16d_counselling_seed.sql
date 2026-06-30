-- ─────────────────────────────────────────────────────────────────────────────
-- Milestone 16D — Counselling Content Seed
--
-- ROOT CAUSE: counselling_sections and counselling_items were created by the
-- 16B startup migration but were never populated. All 15 guidebooks already
-- have structured content in the guidebook_sections JSONB column (backfilled
-- from key_steps / escalation_criteria by GuidebooksService.onModuleInit).
--
-- This script (and the equivalent ConsultationRepository.migrateCounsellingContent
-- that runs automatically on every startup) converts that JSONB data into the
-- section+item rows that the Consultation Workspace wizard reads.
--
-- TABLES USED:
--   public.guidebooks            (source: guidebook_sections JSONB — read-only)
--   public.counselling_sections  (destination — created in 16B)
--   public.counselling_items     (destination — created in 16B)
--
-- NO NEW TABLES. NO SCHEMA CHANGE. Fully additive + idempotent.
-- Safe to run on any database that has already run milestone16a_consultation_foundation.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Section 1: Assessment Checklist ──────────────────────────────────────────
-- Source: guidebook_sections -> 'checklist' (string array)
-- One section per guidebook that has checklist content and no checklist section yet.

INSERT INTO public.counselling_sections (guidebook_id, name, sort_order)
SELECT g.id, 'Assessment Checklist', 1
FROM   public.guidebooks g
WHERE  g.is_active = true
  AND  (g.guidebook_sections -> 'checklist') IS NOT NULL
  AND  jsonb_array_length(g.guidebook_sections -> 'checklist') > 0
  AND  NOT EXISTS (
         SELECT 1 FROM public.counselling_sections cs
         WHERE  cs.guidebook_id = g.id
           AND  cs.name = 'Assessment Checklist'
       );

-- Items for checklist sections
INSERT INTO public.counselling_items (section_id, body, note_text, sort_order)
SELECT cs.id,
       item.value,
       item.value,
       (item.ordinality - 1)::int
FROM   public.counselling_sections cs
JOIN   public.guidebooks g ON g.id = cs.guidebook_id
CROSS  JOIN jsonb_array_elements_text(g.guidebook_sections -> 'checklist')
            WITH ORDINALITY AS item(value, ordinality)
WHERE  cs.name = 'Assessment Checklist'
  AND  NOT EXISTS (
         SELECT 1 FROM public.counselling_items ci
         WHERE  ci.section_id = cs.id
       );

-- ── Section 2: Referral Guidance ─────────────────────────────────────────────
-- Source: guidebook_sections -> 'referralGuidance' (string array)

INSERT INTO public.counselling_sections (guidebook_id, name, sort_order)
SELECT g.id, 'Referral Guidance', 2
FROM   public.guidebooks g
WHERE  g.is_active = true
  AND  (g.guidebook_sections -> 'referralGuidance') IS NOT NULL
  AND  jsonb_array_length(g.guidebook_sections -> 'referralGuidance') > 0
  AND  NOT EXISTS (
         SELECT 1 FROM public.counselling_sections cs
         WHERE  cs.guidebook_id = g.id
           AND  cs.name = 'Referral Guidance'
       );

-- Items for referral sections
INSERT INTO public.counselling_items (section_id, body, note_text, sort_order)
SELECT cs.id,
       item.value,
       item.value,
       (item.ordinality - 1)::int
FROM   public.counselling_sections cs
JOIN   public.guidebooks g ON g.id = cs.guidebook_id
CROSS  JOIN jsonb_array_elements_text(g.guidebook_sections -> 'referralGuidance')
            WITH ORDINALITY AS item(value, ordinality)
WHERE  cs.name = 'Referral Guidance'
  AND  NOT EXISTS (
         SELECT 1 FROM public.counselling_items ci
         WHERE  ci.section_id = cs.id
       );

-- ── Verification ─────────────────────────────────────────────────────────────
SELECT
  g.code,
  g.title,
  COUNT(DISTINCT cs.id) AS sections,
  COUNT(ci.id)          AS items
FROM   public.guidebooks g
LEFT   JOIN public.counselling_sections cs ON cs.guidebook_id = g.id
LEFT   JOIN public.counselling_items    ci ON ci.section_id   = cs.id
WHERE  g.is_active = true
GROUP  BY g.code, g.title
ORDER  BY g.code;
