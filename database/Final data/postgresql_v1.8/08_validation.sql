-- ============================================================================
-- DiNC Platform — PostgreSQL Implementation
-- File 07: Validation suite (Design Task 6 / Blueprint §5 post-seed gate)
-- Idempotent: yes (CREATE OR REPLACE + read-only checks)
--
-- Usage:
--   SELECT * FROM dinc_metadata.fn_validate();                 -- full report
--   SELECT * FROM dinc_metadata.fn_validate() WHERE violations > 0;
-- The DO block at the end RAISES EXCEPTION if any check fails, so this file
-- doubles as a deployment gate: psql exits non-zero on violation.
-- ============================================================================

CREATE OR REPLACE FUNCTION dinc_metadata.fn_validate()
RETURNS TABLE (check_group text, check_name text, violations bigint)
LANGUAGE sql STABLE AS $$

-- ===================== A. FK / relationship integrity ========================
SELECT 'FK', 'event -> programme orphans',
       count(*) FROM dinc_metadata.event e
       WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.programme p WHERE p.programme_id = e.programme_id)
UNION ALL
SELECT 'FK', 'activity -> event orphans',
       count(*) FROM dinc_metadata.activity a
       WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.event e WHERE e.event_id = a.event_id)
UNION ALL
SELECT 'FK', 'schedule_rule dependency_event_code unresolved',
       count(*) FROM dinc_metadata.schedule_rule sr
       WHERE sr.dependency_event_code IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM dinc_metadata.event e WHERE e.event_code = sr.dependency_event_code)
UNION ALL
SELECT 'FK', 'schedule_rule repeat_until_event_code unresolved',
       count(*) FROM dinc_metadata.schedule_rule sr
       WHERE sr.repeat_until_event_code IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM dinc_metadata.event e WHERE e.event_code = sr.repeat_until_event_code)
UNION ALL
SELECT 'FK', 'discovery rule -> guidebook orphans',
       count(*) FROM dinc_metadata.guidebook_discovery_rule d
       WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.guidebook g WHERE g.guidebook_code = d.guidebook_code)

-- ===================== B. The audited 1:1 & pair consistency =================
UNION ALL
SELECT '1:1', 'events without a schedule_rule',
       count(*) FROM dinc_metadata.event e
       WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.schedule_rule sr WHERE sr.event_id = e.event_id)
UNION ALL
SELECT '1:1', 'schedule_rules without an event',
       count(*) FROM dinc_metadata.schedule_rule sr
       WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.event e WHERE e.event_id = sr.event_id)
UNION ALL
SELECT 'PAIR', 'schedule_rule event_code/event_id pair mismatch',
       count(*) FROM dinc_metadata.schedule_rule sr
       JOIN dinc_metadata.event e ON e.event_id = sr.event_id
       WHERE e.event_code <> sr.event_code
UNION ALL
SELECT 'PAIR', 'override event_code/event_id pair mismatch',
       count(*) FROM dinc_metadata.schedule_rule_override o
       JOIN dinc_metadata.event e ON e.event_id = o.event_id
       WHERE e.event_code <> o.event_code
UNION ALL
SELECT 'PAIR', 'outcome_template denormalized copies stale (activity_code/name)',
       count(*) FROM dinc_metadata.outcome_template t
       JOIN dinc_metadata.activity a ON a.activity_id = t.activity_id
       WHERE a.activity_code <> t.activity_code OR a.activity_name <> t.activity_name

-- ===================== C. Dependency-graph rules =============================
UNION ALL
SELECT 'GRAPH', 'cross-programme dependencies',
       count(*) FROM dinc_metadata.schedule_rule sr
       JOIN dinc_metadata.event child  ON child.event_id   = sr.event_id
       JOIN dinc_metadata.event parent ON parent.event_code = sr.dependency_event_code
       WHERE parent.programme_id <> child.programme_id
UNION ALL
SELECT 'GRAPH', 'dependency cycles',
       (WITH RECURSIVE walk (start_code, current_code, depth) AS (
            SELECT sr.event_code, sr.dependency_event_code, 1
            FROM dinc_metadata.schedule_rule sr
            WHERE sr.dependency_event_code IS NOT NULL
          UNION ALL
            SELECT w.start_code, sr.dependency_event_code, w.depth + 1
            FROM walk w
            JOIN dinc_metadata.schedule_rule sr ON sr.event_code = w.current_code
            WHERE sr.dependency_event_code IS NOT NULL AND w.depth < 100
        )
        SELECT count(*) FROM walk WHERE current_code = start_code)
UNION ALL
SELECT 'GRAPH', 'repeat_until on non-RECURRING, self-referencing, or cross-programme',
       count(*) FROM dinc_metadata.schedule_rule sr
       JOIN dinc_metadata.event child ON child.event_id = sr.event_id
       LEFT JOIN dinc_metadata.event term ON term.event_code = sr.repeat_until_event_code
       WHERE sr.repeat_until_event_code IS NOT NULL
         AND (sr.schedule_type <> 'RECURRING'
              OR sr.repeat_until_event_code = sr.event_code
              OR term.programme_id <> child.programme_id)

-- ===================== D. Override integrity =================================
UNION ALL
SELECT 'OVERRIDE', 'duplicate (event_code, condition_code) pairs',
       (SELECT coalesce(sum(c) - count(*), 0) FROM
          (SELECT count(*) AS c FROM dinc_metadata.schedule_rule_override
           GROUP BY event_code, condition_code) g)
UNION ALL
SELECT 'OVERRIDE', 'overrides without a base schedule_rule',
       count(*) FROM dinc_metadata.schedule_rule_override o
       WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.schedule_rule sr WHERE sr.event_id = o.event_id)
UNION ALL
SELECT 'OVERRIDE', 'overrides carrying no timing delta',
       count(*) FROM dinc_metadata.schedule_rule_override o
       WHERE o.offset_days IS NULL AND o.repeat_interval_days IS NULL
         AND o.repeat_count IS NULL AND o.repeat_until_event_code IS NULL
UNION ALL
SELECT 'OVERRIDE', 'override condition_code outside governed vocabulary',
       count(*) FROM dinc_metadata.schedule_rule_override o
       WHERE NOT dinc_metadata.fn_enum_ok('condition_code', o.condition_code)

-- ===================== E. Enum governance ====================================
UNION ALL
SELECT 'ENUM', 'schedule_rule coded values outside enum_reference',
       count(*) FROM dinc_metadata.schedule_rule sr
       WHERE NOT dinc_metadata.fn_enum_ok('schedule_type', sr.schedule_type)
          OR NOT dinc_metadata.fn_enum_ok('anchor_type',  sr.anchor_type)
          OR NOT dinc_metadata.fn_enum_ok('condition_code', sr.condition_code)
UNION ALL
SELECT 'ENUM', 'workflow_action / next_action / priority / scope_level drift',
       (SELECT count(*) FROM dinc_metadata.outcome_template_field f
         WHERE NOT dinc_metadata.fn_enum_ok('workflow_action', f.workflow_action))
     + (SELECT count(*) FROM dinc_metadata.call_outcome_rule r
         WHERE NOT dinc_metadata.fn_enum_ok('next_action', r.next_action)
            OR NOT dinc_metadata.fn_enum_ok('priority', r.priority))
     + (SELECT count(*) FROM (
           SELECT scope_level FROM dinc_metadata.guidebook_mapping
           UNION ALL SELECT scope_level FROM dinc_metadata.faq_mapping
           UNION ALL SELECT scope_level FROM dinc_metadata.nutrition_advice_mapping
           UNION ALL SELECT scope_level FROM dinc_metadata.training_module_mapping) s
         WHERE NOT dinc_metadata.fn_enum_ok('scope_level', s.scope_level))

-- ===================== F. Sentinel & mapping integrity =======================
UNION ALL
SELECT 'SENTINEL', 'event_call_outcome.event_code neither Event nor ALL',
       count(*) FROM dinc_metadata.event_call_outcome eco
       WHERE NOT dinc_metadata.fn_event_or_all(eco.event_code)
UNION ALL
SELECT 'SENTINEL', 'call_outcome_rule.programme_code neither Programme nor ALL',
       count(*) FROM dinc_metadata.call_outcome_rule cor
       WHERE NOT dinc_metadata.fn_programme_or_all(cor.programme_code)
UNION ALL
SELECT 'MAPPING', 'scope_code invalid for scope_level (all four mapping tables)',
       (SELECT count(*) FROM dinc_metadata.guidebook_mapping m        WHERE NOT dinc_metadata.fn_scope_ok(m.scope_level, m.scope_code))
     + (SELECT count(*) FROM dinc_metadata.faq_mapping m              WHERE NOT dinc_metadata.fn_scope_ok(m.scope_level, m.scope_code))
     + (SELECT count(*) FROM dinc_metadata.nutrition_advice_mapping m WHERE NOT dinc_metadata.fn_scope_ok(m.scope_level, m.scope_code))
     + (SELECT count(*) FROM dinc_metadata.training_module_mapping m  WHERE NOT dinc_metadata.fn_scope_ok(m.scope_level, m.scope_code))
UNION ALL
SELECT 'MAPPING', 'GLOBAL<->ALL biconditional broken',
       (SELECT count(*) FROM dinc_metadata.guidebook_mapping        WHERE (scope_level = 'GLOBAL') <> (scope_code = 'ALL'))
     + (SELECT count(*) FROM dinc_metadata.faq_mapping              WHERE (scope_level = 'GLOBAL') <> (scope_code = 'ALL'))
     + (SELECT count(*) FROM dinc_metadata.nutrition_advice_mapping WHERE (scope_level = 'GLOBAL') <> (scope_code = 'ALL'))
     + (SELECT count(*) FROM dinc_metadata.training_module_mapping  WHERE (scope_level = 'GLOBAL') <> (scope_code = 'ALL'))
UNION ALL
SELECT 'MAPPING', 'content without any mapping (coverage must stay 100%)',
       (SELECT count(*) FROM dinc_metadata.guidebook g
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.guidebook_mapping m WHERE m.guidebook_code = g.guidebook_code))
     + (SELECT count(*) FROM dinc_metadata.faq f
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.faq_mapping m WHERE m.faq_code = f.faq_code))
     + (SELECT count(*) FROM dinc_metadata.nutrition_advice n
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.nutrition_advice_mapping m WHERE m.advice_code = n.advice_code))
     + (SELECT count(*) FROM dinc_metadata.training_module t
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.training_module_mapping m WHERE m.module_code = t.module_code))
UNION ALL
SELECT 'MAPPING', 'mapping -> missing content orphans',
       (SELECT count(*) FROM dinc_metadata.guidebook_mapping m
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.guidebook g WHERE g.guidebook_code = m.guidebook_code))
     + (SELECT count(*) FROM dinc_metadata.faq_mapping m
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.faq f WHERE f.faq_code = m.faq_code))
     + (SELECT count(*) FROM dinc_metadata.nutrition_advice_mapping m
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.nutrition_advice n WHERE n.advice_code = m.advice_code))
     + (SELECT count(*) FROM dinc_metadata.training_module_mapping m
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.training_module t WHERE t.module_code = m.module_code))

-- ===================== G. Missing metadata (seed completeness vs v1.8) =======
UNION ALL SELECT 'SEED', 'programme rows <> 12',                abs(12  - (SELECT count(*) FROM dinc_metadata.programme))
UNION ALL SELECT 'SEED', 'event rows <> 65',                    abs(65  - (SELECT count(*) FROM dinc_metadata.event))
UNION ALL SELECT 'SEED', 'activity rows <> 193',                abs(193 - (SELECT count(*) FROM dinc_metadata.activity))
UNION ALL SELECT 'SEED', 'schedule_rule rows <> 65',            abs(65  - (SELECT count(*) FROM dinc_metadata.schedule_rule))
UNION ALL SELECT 'SEED', 'schedule_rule_override rows <> 3',    abs(3   - (SELECT count(*) FROM dinc_metadata.schedule_rule_override))
UNION ALL SELECT 'SEED', 'outcome_template rows <> 193',        abs(193 - (SELECT count(*) FROM dinc_metadata.outcome_template))
UNION ALL SELECT 'SEED', 'outcome_template_field rows <> 193',  abs(193 - (SELECT count(*) FROM dinc_metadata.outcome_template_field))
UNION ALL SELECT 'SEED', 'call_outcome rows <> 6',              abs(6   - (SELECT count(*) FROM dinc_metadata.call_outcome))
UNION ALL SELECT 'SEED', 'event_call_outcome rows <> 6',        abs(6   - (SELECT count(*) FROM dinc_metadata.event_call_outcome))
UNION ALL SELECT 'SEED', 'call_outcome_rule rows <> 6',         abs(6   - (SELECT count(*) FROM dinc_metadata.call_outcome_rule))
UNION ALL SELECT 'SEED', 'guidebook rows <> 15',                abs(15  - (SELECT count(*) FROM dinc_metadata.guidebook))
UNION ALL SELECT 'SEED', 'guidebook_section rows <> 45',        abs(45  - (SELECT count(*) FROM dinc_metadata.guidebook_section))
UNION ALL SELECT 'SEED', 'guidebook_discovery_rule rows <> 15', abs(15  - (SELECT count(*) FROM dinc_metadata.guidebook_discovery_rule))
UNION ALL SELECT 'SEED', 'guidebook_mapping rows <> 16',        abs(16  - (SELECT count(*) FROM dinc_metadata.guidebook_mapping))
UNION ALL SELECT 'SEED', 'faq rows <> 27',                      abs(27  - (SELECT count(*) FROM dinc_metadata.faq))
UNION ALL SELECT 'SEED', 'faq_mapping rows <> 27',              abs(27  - (SELECT count(*) FROM dinc_metadata.faq_mapping))
UNION ALL SELECT 'SEED', 'nutrition_advice rows <> 45',         abs(45  - (SELECT count(*) FROM dinc_metadata.nutrition_advice))
UNION ALL SELECT 'SEED', 'nutrition_advice_mapping rows <> 51', abs(51  - (SELECT count(*) FROM dinc_metadata.nutrition_advice_mapping))
UNION ALL SELECT 'SEED', 'training_module rows <> 6',           abs(6   - (SELECT count(*) FROM dinc_metadata.training_module))
UNION ALL SELECT 'SEED', 'training_module_mapping rows <> 7',   abs(7   - (SELECT count(*) FROM dinc_metadata.training_module_mapping))
UNION ALL SELECT 'SEED', 'enum_reference rows <> 21',           abs(21  - (SELECT count(*) FROM dinc_metadata.enum_reference))
UNION ALL SELECT 'SEED', 'metadata_release v1.8 row missing',
       CASE WHEN EXISTS (SELECT 1 FROM dinc_metadata.metadata_release WHERE release_version = 'v1.8') THEN 0 ELSE 1 END

-- ===================== H. Duplicate detection (beyond constraints) ===========
UNION ALL
SELECT 'DUP', 'duplicate mapping triples across all four mapping tables',
       (SELECT coalesce(sum(c) - count(*), 0) FROM (
           SELECT count(*) AS c FROM dinc_metadata.guidebook_mapping        GROUP BY guidebook_code, scope_level, scope_code
           UNION ALL SELECT count(*) FROM dinc_metadata.faq_mapping              GROUP BY faq_code, scope_level, scope_code
           UNION ALL SELECT count(*) FROM dinc_metadata.nutrition_advice_mapping GROUP BY advice_code, scope_level, scope_code
           UNION ALL SELECT count(*) FROM dinc_metadata.training_module_mapping  GROUP BY module_code, scope_level, scope_code) g)
UNION ALL
SELECT 'DUP', 'duplicate guidebook sections (guidebook, section_type)',
       (SELECT coalesce(sum(c) - count(*), 0) FROM
          (SELECT count(*) AS c FROM dinc_metadata.guidebook_section GROUP BY guidebook_code, section_type) g)

-- ===================== I. Orphan runtime records ==============================
UNION ALL
SELECT 'RUNTIME', 'event_instance -> metadata/enrolment orphans',
       (SELECT count(*) FROM dinc_runtime.event_instance ei
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.event e WHERE e.event_id = ei.event_id)
            OR NOT EXISTS (SELECT 1 FROM dinc_runtime.programme_enrolment pe WHERE pe.enrolment_id = ei.enrolment_id))
UNION ALL
SELECT 'RUNTIME', 'activity_instance orphans (event_instance or metadata activity)',
       (SELECT count(*) FROM dinc_runtime.activity_instance ai
         WHERE NOT EXISTS (SELECT 1 FROM dinc_runtime.event_instance ei WHERE ei.event_instance_id = ai.event_instance_id)
            OR NOT EXISTS (SELECT 1 FROM dinc_metadata.activity a WHERE a.activity_id = ai.activity_id))
UNION ALL
SELECT 'RUNTIME', 'outcome_response orphans (activity_instance or field)',
       (SELECT count(*) FROM dinc_runtime.outcome_response r
         WHERE NOT EXISTS (SELECT 1 FROM dinc_runtime.activity_instance ai WHERE ai.activity_instance_id = r.activity_instance_id)
            OR NOT EXISTS (SELECT 1 FROM dinc_metadata.outcome_template_field f WHERE f.field_id = r.field_id))
UNION ALL
SELECT 'RUNTIME', 'call_log / followup_task / notification orphans',
       (SELECT count(*) FROM dinc_runtime.call_log cl
         WHERE NOT EXISTS (SELECT 1 FROM dinc_metadata.call_outcome co WHERE co.code = cl.outcome_code)
            OR NOT EXISTS (SELECT 1 FROM dinc_runtime.programme_enrolment pe WHERE pe.enrolment_id = cl.enrolment_id))
     + (SELECT count(*) FROM dinc_runtime.followup_task ft
         WHERE NOT EXISTS (SELECT 1 FROM dinc_runtime.call_log cl WHERE cl.call_log_id = ft.call_log_id))
     + (SELECT count(*) FROM dinc_runtime.notification nt
         WHERE nt.event_instance_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM dinc_runtime.event_instance ei WHERE ei.event_instance_id = nt.event_instance_id))
UNION ALL
SELECT 'RUNTIME', 'patient_condition codes outside governed vocabulary',
       (SELECT count(*) FROM dinc_runtime.patient_condition pc
         WHERE NOT dinc_metadata.fn_enum_ok('condition_code', pc.condition_code));
$$;

-- Deployment gate: raise on ANY violation so psql/CI exits non-zero.
DO $$
DECLARE
    v_failed text;
BEGIN
    SELECT string_agg(format('%s / %s = %s', check_group, check_name, violations), E'\n')
      INTO v_failed
      FROM dinc_metadata.fn_validate()
     WHERE violations > 0;
    IF v_failed IS NOT NULL THEN
        RAISE EXCEPTION E'DiNC validation FAILED:\n%', v_failed;
    END IF;
    RAISE NOTICE 'DiNC validation PASSED: all checks returned zero violations.';
END $$;
