-- ─────────────────────────────────────────────────────────────────────────────
-- Workflow Rules Engine — seed / backfill (Milestone 11A)
--
-- The backend runs these idempotently on startup (WorkflowRepository.onModuleInit),
-- so applying this script manually is OPTIONAL. It is provided for teams that
-- manage schema/data out-of-band. Both statements are safe to run repeatedly.
--
-- Reuses the EXISTING `rules` and `retry_config` tables. No new tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Backfill workflow-action metadata into rules.conditions (only where NULL,
--    so administrator edits are never overwritten). Derived from outcome category.
UPDATE public.rules r
   SET conditions = jsonb_build_object(
         'action', CASE ot.category
            WHEN 'POSITIVE'   THEN 'COMPLETE_AND_ADVANCE'
            WHEN 'NEUTRAL'    THEN 'RETRY_ACTIVITY'
            WHEN 'NEGATIVE'   THEN 'RETRY_ACTIVITY'
            WHEN 'ESCALATION' THEN 'ESCALATE'
            ELSE 'CREATE_ACTIVITY' END,
         'retryPolicy', CASE WHEN ot.category IN ('NEUTRAL','NEGATIVE') THEN 'STANDARD' ELSE NULL END,
         'escalationRole', CASE WHEN ot.category IN ('NEGATIVE','ESCALATION') THEN 'CLINICIAN' ELSE NULL END,
         'notificationRole', CASE WHEN ot.category = 'ESCALATION' THEN 'CLINICIAN' ELSE NULL END
       ),
       updated_at = now()
  FROM public.outcome_types ot
 WHERE ot.id = r.outcome_type_id
   AND r.conditions IS NULL;

-- 2) Populate the (empty) retry_config with one policy per (program, disease).
--    Acute programs → Urgent (5 / 4h / escalate after 2); others → Standard
--    (3 / 24h / escalate after 3). Runs only when the table is empty.
INSERT INTO public.retry_config
   (program_id, disease_id, max_attempts, retry_interval_hours,
    escalation_after_attempts, escalation_role, is_active)
SELECT p.id, d.id,
       CASE WHEN p.code IN ('CARDIAC','COMMUNICABLE','ONCOLOGY','RENAL','MATERNAL') THEN 5 ELSE 3 END,
       CASE WHEN p.code IN ('CARDIAC','COMMUNICABLE','ONCOLOGY','RENAL','MATERNAL') THEN 4 ELSE 24 END,
       CASE WHEN p.code IN ('CARDIAC','COMMUNICABLE','ONCOLOGY','RENAL','MATERNAL') THEN 2 ELSE 3 END,
       'CLINICIAN', true
  FROM public.programs p
  JOIN public.sub_programs sp ON sp.program_id = p.id
  JOIN public.diseases d ON d.sub_program_id = sp.id
 WHERE NOT EXISTS (SELECT 1 FROM public.retry_config);
