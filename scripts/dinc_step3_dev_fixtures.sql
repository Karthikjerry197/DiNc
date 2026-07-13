-- =====================================================================
-- DiNC Migration Step 3 — DEV FIXTURES (idempotent, dev/test only)
-- Seeds a few patients / programme enrolments / event instances /
-- patient conditions into dinc_runtime so read APIs can be verified.
-- NOT for production. Never touches dinc_metadata.
-- Fixed UUIDs + ON CONFLICT DO NOTHING → safe to re-run.
-- =====================================================================

BEGIN;

INSERT INTO dinc_runtime.patient
  (patient_id, external_id, full_name, sex, birth_date, phone, address, district, village, aadhaar, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111101', 'ASSAM-2026-00001', 'Rina Das',    'FEMALE', DATE '1996-04-12', '9101000001', 'Ward 3, Guwahati',  'Kamrup Metro', 'Beltola',   '123412341234', true),
  ('11111111-1111-1111-1111-111111111102', 'ASSAM-2026-00002', 'Anup Bora',   'MALE',   DATE '1968-11-02', '9101000002', 'Nagaon town',       'Nagaon',       NULL,        NULL,           true),
  ('11111111-1111-1111-1111-111111111103', 'ASSAM-2026-00003', 'Mala Devi',   'FEMALE', DATE '1989-01-25', '9101000003', NULL,                'Dibrugarh',    'Chabua',    NULL,           true)
ON CONFLICT (patient_id) DO NOTHING;

INSERT INTO dinc_runtime.programme_enrolment
  (enrolment_id, patient_id, programme_id, registration_date, status)
VALUES
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101',
   (SELECT programme_id FROM dinc_metadata.programme WHERE programme_code = 'PRG-001'), DATE '2026-06-01', 'ACTIVE'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111102',
   (SELECT programme_id FROM dinc_metadata.programme WHERE programme_code = 'PRG-002'), DATE '2026-05-15', 'ACTIVE'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111103',
   (SELECT programme_id FROM dinc_metadata.programme WHERE programme_code = 'PRG-001'), DATE '2026-03-10', 'COMPLETED')
ON CONFLICT (enrolment_id) DO NOTHING;

-- Event instances for Rina's PRG-001 enrolment: first event completed,
-- second event active and due — exercises the "current event" derivation.
INSERT INTO dinc_runtime.event_instance
  (event_instance_id, enrolment_id, event_id, occurrence_number, status, due_date, activated_at, completed_at, priority)
SELECT '33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201',
       e.event_id, 1, 'COMPLETED', DATE '2026-06-08', TIMESTAMPTZ '2026-06-01 10:00+05:30', TIMESTAMPTZ '2026-06-08 11:00+05:30', NULL
FROM dinc_metadata.event e
JOIN dinc_metadata.programme p ON p.programme_id = e.programme_id
WHERE p.programme_code = 'PRG-001'
ORDER BY e.display_order LIMIT 1
ON CONFLICT (event_instance_id) DO NOTHING;

INSERT INTO dinc_runtime.event_instance
  (event_instance_id, enrolment_id, event_id, occurrence_number, status, due_date, activated_at, priority)
SELECT '33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222201',
       e.event_id, 1, 'ACTIVE', CURRENT_DATE + 7, now(), 'HIGH'
FROM dinc_metadata.event e
JOIN dinc_metadata.programme p ON p.programme_id = e.programme_id
WHERE p.programme_code = 'PRG-001'
ORDER BY e.display_order OFFSET 1 LIMIT 1
ON CONFLICT (event_instance_id) DO NOTHING;

-- A flagged high-risk condition on Rina's enrolment.
INSERT INTO dinc_runtime.patient_condition
  (condition_id, patient_id, enrolment_id, condition_code, flagged_at, source)
VALUES
  ('44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111101',
   '22222222-2222-2222-2222-222222222201', 'HIGH_RISK', now(), 'DEV_FIXTURE')
ON CONFLICT (condition_id) DO NOTHING;

COMMIT;
