-- ============================================================================
-- DiNC Platform — PostgreSQL Implementation
-- File 05: Resolver views (dinc_metadata) — the canonical resolution layer
-- Approved design : DiNC_PostgreSQL_Database_Design.md (Task 4: "resolver views
--                   live in dinc_metadata so every consumer reads one canonical
--                   resolution instead of re-implementing precedence")
-- Idempotent      : yes (CREATE OR REPLACE)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5.1 Effective schedule rule = base ⊕ override (coalesce semantics).
--     One row per (event, condition-context):
--       * condition_context NULL        -> the DEFAULT (base) rule
--       * condition_context = 'X'       -> the rule effective when condition X is live
--     README §10 step 4: non-null override columns substitute the base value.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW dinc_metadata.v_schedule_rule_effective AS
SELECT
    sr.event_code,
    sr.event_id,
    NULL::text                 AS condition_context,
    'BASE'::text               AS resolution_source,
    sr.schedule_type,
    sr.anchor_type,
    sr.offset_days,
    sr.repeat_interval_days,
    sr.repeat_count,
    sr.repeat_until_event_code,
    sr.dependency_event_code,
    sr.condition_code          AS existence_condition,
    sr.reference_source
FROM dinc_metadata.schedule_rule sr
UNION ALL
SELECT
    sr.event_code,
    sr.event_id,
    o.condition_code           AS condition_context,
    'OVERRIDE'::text           AS resolution_source,
    sr.schedule_type,                                   -- structural columns never overridden
    sr.anchor_type,
    COALESCE(o.offset_days,             sr.offset_days)             AS offset_days,
    COALESCE(o.repeat_interval_days,    sr.repeat_interval_days)    AS repeat_interval_days,
    COALESCE(o.repeat_count,            sr.repeat_count)            AS repeat_count,
    COALESCE(o.repeat_until_event_code, sr.repeat_until_event_code) AS repeat_until_event_code,
    sr.dependency_event_code,
    sr.condition_code          AS existence_condition,
    sr.reference_source
FROM dinc_metadata.schedule_rule sr
JOIN dinc_metadata.schedule_rule_override o
  ON o.event_id = sr.event_id AND o.is_active;
COMMENT ON VIEW dinc_metadata.v_schedule_rule_effective IS
  'Engine contract: pick the row whose condition_context matches a LIVE patient condition; else the condition_context IS NULL (BASE) row. v1.8 guarantees at most one override per event+condition.';

-- ----------------------------------------------------------------------------
-- 5.2 Event call outcomes resolved: specific rows override the ALL default
--     (Design Review K-2). One row per real event per offered outcome.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW dinc_metadata.v_event_call_outcome_resolved AS
SELECT
    ev.event_code,
    eco.outcome_code,
    eco.display_order,
    CASE WHEN eco.event_code = 'ALL' THEN 'DEFAULT' ELSE 'SPECIFIC' END AS resolution_source
FROM dinc_metadata.event ev
JOIN dinc_metadata.event_call_outcome eco
  ON eco.is_active
 AND (   eco.event_code = ev.event_code                       -- specific rows for this event
      OR (eco.event_code = 'ALL'                              -- else the ALL default set
          AND NOT EXISTS (SELECT 1 FROM dinc_metadata.event_call_outcome s
                          WHERE s.event_code = ev.event_code AND s.is_active)));

-- ----------------------------------------------------------------------------
-- 5.3 Call outcome rule resolved per programme: specific overrides ALL
--     (Design Review L-4). One row per programme per outcome.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW dinc_metadata.v_call_outcome_rule_resolved AS
SELECT
    p.programme_code,
    cor.outcome_code,
    cor.next_action,
    cor.followup_delay_days,
    cor.priority,
    CASE WHEN cor.programme_code = 'ALL' THEN 'DEFAULT' ELSE 'SPECIFIC' END AS resolution_source
FROM dinc_metadata.programme p
JOIN dinc_metadata.call_outcome_rule cor
  ON cor.is_active
 AND (   cor.programme_code = p.programme_code
      OR (cor.programme_code = 'ALL'
          AND NOT EXISTS (SELECT 1 FROM dinc_metadata.call_outcome_rule s
                          WHERE s.programme_code = p.programme_code
                            AND s.outcome_code  = cor.outcome_code
                            AND s.is_active)));

-- ----------------------------------------------------------------------------
-- 5.4–5.7 Knowledge placement per programme: PROGRAMME-scoped rows plus the
--     GLOBAL set applied to every programme (Runtime Design §10–12 resolution
--     rule). EVENT/ACTIVITY scopes are reserved and unused in v1.8; they join
--     through the same pattern when first authored.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW dinc_metadata.v_guidebook_placement AS
SELECT p.programme_code, g.guidebook_code, g.title, g.category, m.display_order, m.scope_level
FROM dinc_metadata.programme p
JOIN dinc_metadata.guidebook_mapping m
  ON m.is_active
 AND (   (m.scope_level = 'PROGRAMME' AND m.scope_code = p.programme_code)
      OR  m.scope_level = 'GLOBAL')
JOIN dinc_metadata.guidebook g
  ON g.guidebook_code = m.guidebook_code AND g.is_active;

CREATE OR REPLACE VIEW dinc_metadata.v_faq_placement AS
SELECT p.programme_code, f.faq_code, f.category, f.question, f.answer, m.display_order, m.scope_level
FROM dinc_metadata.programme p
JOIN dinc_metadata.faq_mapping m
  ON m.is_active
 AND (   (m.scope_level = 'PROGRAMME' AND m.scope_code = p.programme_code)
      OR  m.scope_level = 'GLOBAL')
JOIN dinc_metadata.faq f
  ON f.faq_code = m.faq_code AND f.is_active;

CREATE OR REPLACE VIEW dinc_metadata.v_nutrition_advice_placement AS
SELECT p.programme_code, n.advice_code, n.category, n.advice_text, m.display_order, m.scope_level
FROM dinc_metadata.programme p
JOIN dinc_metadata.nutrition_advice_mapping m
  ON m.is_active
 AND (   (m.scope_level = 'PROGRAMME' AND m.scope_code = p.programme_code)
      OR  m.scope_level = 'GLOBAL')
JOIN dinc_metadata.nutrition_advice n
  ON n.advice_code = m.advice_code AND n.is_active;

CREATE OR REPLACE VIEW dinc_metadata.v_training_module_placement AS
SELECT p.programme_code, t.module_code, t.title, t.category, t.duration_minutes, m.display_order, m.scope_level
FROM dinc_metadata.programme p
JOIN dinc_metadata.training_module_mapping m
  ON m.is_active
 AND (   (m.scope_level = 'PROGRAMME' AND m.scope_code = p.programme_code)
      OR  m.scope_level = 'GLOBAL')
JOIN dinc_metadata.training_module t
  ON t.module_code = m.module_code AND t.is_active;
