-- ─────────────────────────────────────────────────────────────────────────────
-- Milestone 16E — Normalized Clinical Counselling Engine
--
-- ARCHITECTURAL CHANGE:
--   Introduces the counselling_protocols table as the bridge between guidebooks
--   and their sections, establishing the full normalized hierarchy:
--
--     Guidebook → Counselling Protocol → Counselling Sections → Counselling Items
--
-- Each guidebook now has exactly one default counselling protocol. The protocol
-- contains clinically meaningful sections (Lifestyle, Nutrition, Medication,
-- Danger Signs, Referral, Follow-up, etc.) drawn from NHM standard protocols
-- for each programme, replacing the generic "Assessment Checklist" and
-- "Referral Guidance" sections seeded in Milestone 16D.
--
-- CONTENT SUMMARY (all 15 guidebooks):
--   GB001 Eligible Couple                 6 sections, 25 items
--   GB002 ANC First Trimester             7 sections, 28 items
--   GB003 Postnatal Care                  7 sections, 30 items
--   GB004 Newborn and Infant              7 sections, 30 items
--   GB005 TB and DOTS                     7 sections, 31 items
--   GB006 Malaria                         6 sections, 26 items
--   GB007 Hypertension                    7 sections, 33 items
--   GB008 Diabetes                        8 sections, 35 items
--   GB009 Chronic Kidney Disease          7 sections, 31 items
--   GB010 Mental Health                   7 sections, 31 items
--   GB011 Substance Use                   7 sections, 29 items
--   GB012 Emergency and First Aid         5 sections, 21 items
--   GB013 Elderly Care                    8 sections, 35 items
--   GB014 Government Schemes              6 sections, 24 items
--   GB015 Clinical FAQ                    4 sections, 14 items
--
-- TOTAL: 15 protocols, 101 sections, ~424 items
--
-- IDEMPOTENCY:
--   All INSERTs use ON CONFLICT DO NOTHING. This script is safe to run
--   multiple times on any database — existing content is never overwritten,
--   admin-created protocols/sections/items are preserved.
--
-- BACKWARD COMPATIBILITY:
--   The counselling_sections.guidebook_id column is kept (nullable in the new
--   schema). The findCounsellingSections() query prefers the protocol path
--   and falls back to the legacy direct-on-guidebook path, ensuring no data
--   loss from 16D content during incremental migration.
--
-- PREREQUISITE:
--   Run after milestone16a_consultation_foundation.sql and the 16D seed.
--   Runs automatically on every server start via ConsultationRepository.onModuleInit().
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Schema extensions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.counselling_protocols (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  guidebook_id UUID        NOT NULL REFERENCES public.guidebooks(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  sort_order   INT         NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_counselling_protocols_name
  ON public.counselling_protocols(guidebook_id, name);

CREATE INDEX IF NOT EXISTS idx_counselling_protocols_guidebook
  ON public.counselling_protocols(guidebook_id, sort_order)
  WHERE is_active = true;

ALTER TABLE public.counselling_sections
  ADD COLUMN IF NOT EXISTS protocol_id UUID
    REFERENCES public.counselling_protocols(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_counselling_sections_protocol
  ON public.counselling_sections(protocol_id, sort_order)
  WHERE protocol_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_counselling_sections_protocol_name
  ON public.counselling_sections(protocol_id, name)
  WHERE protocol_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_counselling_items_section_body
  ON public.counselling_items(section_id, body);

-- ── Step 2: Seed one protocol per guidebook ───────────────────────────────────

INSERT INTO public.counselling_protocols (guidebook_id, name, sort_order)
SELECT g.id, v.pname, 0
FROM (VALUES
  ('GB001', 'Eligible Couple Counselling Protocol'),
  ('GB002', 'ANC First Trimester Protocol'),
  ('GB003', 'Postnatal Care Counselling Protocol'),
  ('GB004', 'Newborn and Infant Counselling Protocol'),
  ('GB005', 'TB Counselling and DOTS Protocol'),
  ('GB006', 'Malaria Prevention and Treatment Protocol'),
  ('GB007', 'Hypertension Counselling Protocol'),
  ('GB008', 'Diabetes Counselling Protocol'),
  ('GB009', 'CKD Management Counselling Protocol'),
  ('GB010', 'Mental Health Counselling Protocol'),
  ('GB011', 'Substance Use De-addiction Protocol'),
  ('GB012', 'Emergency First Aid Counselling Protocol'),
  ('GB013', 'Elderly Care Counselling Protocol'),
  ('GB014', 'Government Schemes Counselling Protocol'),
  ('GB015', 'Clinical FAQ Reference Protocol')
) AS v(code, pname)
JOIN public.guidebooks g ON g.code = v.code AND g.is_active = true
ON CONFLICT (guidebook_id, name) DO NOTHING;

-- ── Step 3: Deactivate legacy JSONB-sourced generic sections (16D) ───────────
-- "Assessment Checklist" and "Referral Guidance" sections seeded from sparse
-- guidebook_sections JSONB are retired now that rich protocol-based sections exist.

UPDATE public.counselling_sections
SET    is_active = false
WHERE  protocol_id IS NULL
  AND  name IN ('Assessment Checklist', 'Referral Guidance')
  AND  guidebook_id IN (
         SELECT guidebook_id FROM public.counselling_protocols WHERE is_active = true
       )
  AND  is_active = true;

-- ── Step 4: Seed sections per protocol ────────────────────────────────────────

INSERT INTO public.counselling_sections (protocol_id, guidebook_id, name, sort_order)
SELECT cp.id, cp.guidebook_id, v.sname, v.sorder
FROM (VALUES
  ('GB001','Preconception Care',          1),('GB001','Family Planning',               2),
  ('GB001','Reproductive Health',         3),('GB001','Nutrition Before Pregnancy',    4),
  ('GB001','Referral Criteria',           5),('GB001','Follow-up',                     6),
  ('GB002','Nutrition and Supplements',   1),('GB002','Rest and Activity',             2),
  ('GB002','Antenatal Visits',            3),('GB002','Vaccinations',                  4),
  ('GB002','Danger Signs',                5),('GB002','Birth Preparedness',            6),
  ('GB002','Follow-up',                   7),
  ('GB003','Breastfeeding',               1),('GB003','Maternal Care',                 2),
  ('GB003','Newborn Care',               3),('GB003','Family Planning',               4),
  ('GB003','Danger Signs - Mother',       5),('GB003','Danger Signs - Baby',           6),
  ('GB003','Follow-up',                   7),
  ('GB004','Infant Feeding',              1),('GB004','Immunisation Schedule',         2),
  ('GB004','Growth Monitoring',           3),('GB004','Danger Signs',                  4),
  ('GB004','WASH and Hygiene',            5),('GB004','Caregiver Education',           6),
  ('GB004','Follow-up',                   7),
  ('GB005','Treatment Adherence',         1),('GB005','Cough Hygiene',                 2),
  ('GB005','Nutrition During TB',         3),('GB005','Side Effects to Report',        4),
  ('GB005','Contact Tracing',             5),('GB005','Referral Criteria',             6),
  ('GB005','Follow-up',                   7),
  ('GB006','Prevention',                  1),('GB006','Testing and Diagnosis',         2),
  ('GB006','Treatment',                   3),('GB006','Danger Signs',                  4),
  ('GB006','Special Populations',         5),('GB006','Follow-up',                     6),
  ('GB007','Lifestyle Modification',      1),('GB007','Diet and Nutrition',            2),
  ('GB007','Medication Adherence',        3),('GB007','Blood Pressure Monitoring',    4),
  ('GB007','Danger Signs',                5),('GB007','Referral Criteria',             6),
  ('GB007','Follow-up',                   7),
  ('GB008','Healthy Lifestyle',           1),('GB008','Diet and Nutrition',            2),
  ('GB008','Medication Adherence',        3),('GB008','Blood Sugar Monitoring',       4),
  ('GB008','Foot Care',                   5),('GB008','Danger Signs',                  6),
  ('GB008','Complications Screening',     7),('GB008','Follow-up',                     8),
  ('GB009','Blood Pressure Control',      1),('GB009','Kidney-Safe Diet',              2),
  ('GB009','Medication Safety',           3),('GB009','Monitoring Tests',              4),
  ('GB009','Danger Signs',                5),('GB009','Referral Criteria',             6),
  ('GB009','Follow-up',                   7),
  ('GB010','Emotional Wellbeing',         1),('GB010','Treatment Adherence',           2),
  ('GB010','Family and Caregiver Support',3),('GB010','Healthy Lifestyle',             4),
  ('GB010','Danger Signs',                5),('GB010','Referral Criteria',             6),
  ('GB010','Follow-up',                   7),
  ('GB011','Motivation and Readiness',    1),('GB011','Quitting Strategies',           2),
  ('GB011','Medical Treatment',           3),('GB011','Family Counselling',            4),
  ('GB011','Withdrawal Danger Signs',     5),('GB011','Referral Criteria',             6),
  ('GB011','Follow-up',                   7),
  ('GB012','Primary Assessment',          1),('GB012','Emergency Responses',           2),
  ('GB012','Ambulance Activation',        3),('GB012','Stabilisation',                 4),
  ('GB012','Documentation',               5),
  ('GB013','Fall Prevention',             1),('GB013','Medication Review',             2),
  ('GB013','Cognitive Health',            3),('GB013','Nutrition',                     4),
  ('GB013','Mental Wellbeing',            5),('GB013','Danger Signs',                  6),
  ('GB013','Referral Criteria',           7),('GB013','Follow-up',                     8),
  ('GB014','Eligibility Assessment',      1),('GB014','Scheme Benefits',               2),
  ('GB014','Enrolment Support',           3),('GB014','Utilisation Guidance',          4),
  ('GB014','Referral for Complex Queries',5),('GB014','Follow-up',                     6),
  ('GB015','Clinical Query Resolution',   1),('GB015','Health Myth Correction',        2),
  ('GB015','Escalation of Queries',       3),('GB015','Follow-up',                     4)
) AS v(code, sname, sorder)
JOIN public.guidebooks g ON g.code = v.code AND g.is_active = true
JOIN LATERAL (
  SELECT id, guidebook_id FROM public.counselling_protocols
  WHERE  guidebook_id = g.id AND is_active = true
  ORDER  BY sort_order ASC LIMIT 1
) cp ON true
ON CONFLICT DO NOTHING;

-- ── Step 5: Seed items via CTE ─────────────────────────────────────────────────

WITH sl AS (
  SELECT cs.id AS sid, g.code AS gcode, cs.name AS sname
  FROM   public.counselling_sections cs
  JOIN   public.counselling_protocols cp ON cp.id = cs.protocol_id AND cp.is_active = true
  JOIN   public.guidebooks g ON g.id = cp.guidebook_id
  WHERE  cs.is_active = true
)
INSERT INTO public.counselling_items (section_id, body, note_text, sort_order)
SELECT sl.sid, v.body, v.body, v.iord
FROM (VALUES
  -- See ConsultationRepository.migrateCounsellingContent() for the full
  -- 424-item seed. Run the backend to apply items automatically, or copy
  -- the VALUES block from the TypeScript source here for manual execution.
  ('__placeholder__'::text,'__placeholder__'::text,'__placeholder__'::text,0::int)
) AS v(code, sname, body, iord)
JOIN sl ON sl.gcode = v.code AND sl.sname = v.sname
ON CONFLICT DO NOTHING;

-- ── Verification ──────────────────────────────────────────────────────────────

SELECT
  g.code,
  g.title,
  cp.name                     AS protocol,
  COUNT(DISTINCT cs.id)       AS sections,
  COUNT(ci.id)                AS items
FROM   public.guidebooks g
JOIN   public.counselling_protocols cp ON cp.guidebook_id = g.id AND cp.is_active = true
LEFT   JOIN public.counselling_sections cs ON cs.protocol_id = cp.id AND cs.is_active = true
LEFT   JOIN public.counselling_items    ci ON ci.section_id  = cs.id AND ci.is_active = true
WHERE  g.is_active = true
GROUP  BY g.code, g.title, cp.name
ORDER  BY g.code;
