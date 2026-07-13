-- =====================================================================
-- DiNC Migration Step 4 — DEV FIXTURES (idempotent, dev/test only)
-- Extends the Step 3 fixtures so worklist READ derivations are testable:
--   • an OVERDUE ACTIVE event_instance (due in the past), assigned to a user
--   • activity_instance rows (one COMPLETED, one PENDING → "current activity")
--   • a call_log + OPEN followup_task (surfaces as a FOLLOW_UP worklist item)
-- NOT for production. Never touches dinc_metadata.
-- =====================================================================

BEGIN;

-- Overdue ACTIVE event instance on Anup's PRG-002 enrolment, assigned to caremanager2.
INSERT INTO dinc_runtime.event_instance
  (event_instance_id, enrolment_id, event_id, occurrence_number, status, due_date, activated_at, priority, assigned_to)
SELECT '33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222202',
       e.event_id, 1, 'ACTIVE', CURRENT_DATE - 5, now() - interval '10 days', 'NORMAL',
       (SELECT user_id FROM dinc_security.app_user WHERE username = 'caremanager2')
FROM dinc_metadata.event e
JOIN dinc_metadata.programme p ON p.programme_id = e.programme_id
WHERE p.programme_code = 'PRG-002'
ORDER BY e.display_order LIMIT 1
ON CONFLICT (event_instance_id) DO NOTHING;

-- Activity instances for Rina's ACTIVE "ANC 2" event instance:
-- first metadata activity COMPLETED, second PENDING (the derived current activity).
INSERT INTO dinc_runtime.activity_instance
  (activity_instance_id, event_instance_id, activity_id, status, completed_at)
SELECT '55555555-5555-5555-5555-555555555501', '33333333-3333-3333-3333-333333333302',
       a.activity_id, 'COMPLETED', now() - interval '1 day'
FROM dinc_metadata.activity a
JOIN dinc_runtime.event_instance ei ON ei.event_id = a.event_id
WHERE ei.event_instance_id = '33333333-3333-3333-3333-333333333302'
ORDER BY a.display_order LIMIT 1
ON CONFLICT (activity_instance_id) DO NOTHING;

INSERT INTO dinc_runtime.activity_instance
  (activity_instance_id, event_instance_id, activity_id, status)
SELECT '55555555-5555-5555-5555-555555555502', '33333333-3333-3333-3333-333333333302',
       a.activity_id, 'PENDING'
FROM dinc_metadata.activity a
JOIN dinc_runtime.event_instance ei ON ei.event_id = a.event_id
WHERE ei.event_instance_id = '33333333-3333-3333-3333-333333333302'
ORDER BY a.display_order OFFSET 1 LIMIT 1
ON CONFLICT (activity_instance_id) DO NOTHING;

-- A call with a CALLBACK outcome and its OPEN follow-up task (due tomorrow).
INSERT INTO dinc_runtime.call_log
  (call_log_id, enrolment_id, event_instance_id, outcome_code, called_at, notes)
VALUES
  ('66666666-6666-6666-6666-666666666601', '22222222-2222-2222-2222-222222222201',
   '33333333-3333-3333-3333-333333333302', 'CALLBACK', now() - interval '2 hours', 'DEV FIXTURE call')
ON CONFLICT (call_log_id) DO NOTHING;

INSERT INTO dinc_runtime.followup_task
  (followup_task_id, call_log_id, enrolment_id, due_date, priority, status, assigned_to)
VALUES
  ('77777777-7777-7777-7777-777777777701', '66666666-6666-6666-6666-666666666601',
   '22222222-2222-2222-2222-222222222201', CURRENT_DATE + 1, 'HIGH', 'OPEN',
   (SELECT user_id FROM dinc_security.app_user WHERE username = 'caremanager2'))
ON CONFLICT (followup_task_id) DO NOTHING;

COMMIT;
