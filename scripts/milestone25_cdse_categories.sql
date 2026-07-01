-- Milestone 25: CDSE Risk Classification
-- These statements are run automatically by CdseRepository.onModuleInit().
-- This file is for reference and manual DB administration only.

-- 1. Add category column to counselling_items
ALTER TABLE public.counselling_items
  ADD COLUMN IF NOT EXISTS category VARCHAR(25)
    CHECK (category IN ('DANGER_SIGN','REFERRAL_CRITERIA','MEDICATION_ADHERENCE','LIFESTYLE'));

-- 2. Create clinical_alerts table
CREATE TABLE IF NOT EXISTS public.clinical_alerts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_id    UUID        NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
  activity_id   UUID        REFERENCES public.worklist_items(id) ON DELETE SET NULL,
  disease       TEXT,
  risk_level    VARCHAR(10) NOT NULL CHECK (risk_level IN ('MODERATE','SEVERE')),
  status        VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','RESOLVED')),
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT
);

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_clinical_alerts_citizen_status
  ON public.clinical_alerts(citizen_id, status);

-- 4. Auto-categorize items based on their parent section name
-- (Idempotent: only updates rows where category IS NULL)
UPDATE public.counselling_items ci
SET category = CASE
  WHEN cs.name ILIKE '%danger%sign%' OR cs.name ILIKE '%warning%sign%'
    THEN 'DANGER_SIGN'
  WHEN cs.name ILIKE '%referral%'
    THEN 'REFERRAL_CRITERIA'
  WHEN cs.name ILIKE '%medication%adherence%'
    OR cs.name ILIKE '%treatment%adherence%'
    OR cs.name ILIKE '%medication%safety%'
    OR cs.name ILIKE '%drug%adherence%'
    THEN 'MEDICATION_ADHERENCE'
  WHEN cs.name ILIKE '%lifestyle%'
    OR cs.name ILIKE '%healthy%lifestyle%'
    OR cs.name ILIKE '%diet%'
    OR cs.name ILIKE '%nutrition%'
    OR cs.name ILIKE '%physical%activity%'
    THEN 'LIFESTYLE'
END
FROM public.counselling_sections cs
WHERE ci.section_id = cs.id
  AND ci.category IS NULL
  AND ci.is_active = true
  AND (
    cs.name ILIKE '%danger%sign%' OR cs.name ILIKE '%warning%sign%'
    OR cs.name ILIKE '%referral%'
    OR cs.name ILIKE '%medication%adherence%'
    OR cs.name ILIKE '%treatment%adherence%'
    OR cs.name ILIKE '%medication%safety%'
    OR cs.name ILIKE '%drug%adherence%'
    OR cs.name ILIKE '%lifestyle%'
    OR cs.name ILIKE '%diet%'
    OR cs.name ILIKE '%nutrition%'
    OR cs.name ILIKE '%physical%activity%'
  );
