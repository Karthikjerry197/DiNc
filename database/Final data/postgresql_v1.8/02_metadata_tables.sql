-- ============================================================================
-- DiNC Platform — PostgreSQL Implementation
-- File 02: Metadata tables (21 tables + release provenance)
-- Source of truth : DiNC_Metadata_Master_v1.8.xlsx (frozen)
-- Approved design : DiNC_PostgreSQL_Database_Design.md (Task 1)
-- Idempotent      : yes
--
-- Conventions implemented from the approved design:
--   * Deterministic UUIDv5 primary keys are loaded verbatim from the workbook.
--   * NULL is semantically meaningful in configuration columns; no NOT NULL
--     defaults are added where the design marks a column nullable.
--   * Enum-governed columns are enforced by LOOKUP against enum_reference via
--     helper functions (drift-resistant; Audit D2-2). Function-based CHECKs are
--     appropriate here because metadata is written only during seeding and is
--     re-verified by 07_validation.sql.
--   * FK-or-sentinel columns ('ALL') use helper-function CHECKs, never naive
--     FKs (Design Review K-4 / L-4).
-- ============================================================================

-- Helper-function bodies reference tables created later in this file; defer
-- body validation exactly as pg_dump does. Bodies are exercised immediately by
-- the CHECK constraints during seeding (06) and by validation (08).
SET check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- 21. enum_reference  (Reference)  — created first: it governs coded columns
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.enum_reference (
    enum_column   text NOT NULL,
    allowed_value text NOT NULL,
    meaning       text NOT NULL,
    CONSTRAINT pk_enum_reference PRIMARY KEY (enum_column, allowed_value)
);
COMMENT ON TABLE dinc_metadata.enum_reference IS
  'Controlled vocabulary for governed coded columns (7 enum groups, 21 loaded values). The workbook''s "condition_code | (null)" documentation row is intentionally NOT loaded: NULL condition_code means "unconditional" (documented NULL semantics).';

-- ------------------------- helper functions (enforcement) -------------------
CREATE OR REPLACE FUNCTION dinc_metadata.fn_enum_ok(p_column text, p_value text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_value IS NULL
        OR EXISTS (SELECT 1 FROM dinc_metadata.enum_reference e
                   WHERE e.enum_column = p_column AND e.allowed_value = p_value);
$$;
COMMENT ON FUNCTION dinc_metadata.fn_enum_ok(text, text) IS
  'Lookup enforcement for enum-governed columns (Audit D2-2). NULL passes: NULL semantics are column-specific and documented.';

CREATE OR REPLACE FUNCTION dinc_metadata.fn_event_or_all(p_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_code = 'ALL'
        OR EXISTS (SELECT 1 FROM dinc_metadata.event ev WHERE ev.event_code = p_code);
$$;

CREATE OR REPLACE FUNCTION dinc_metadata.fn_programme_or_all(p_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p_code = 'ALL'
        OR EXISTS (SELECT 1 FROM dinc_metadata.programme p WHERE p.programme_code = p_code);
$$;

CREATE OR REPLACE FUNCTION dinc_metadata.fn_scope_ok(p_level text, p_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT CASE p_level
        WHEN 'GLOBAL'    THEN p_code = 'ALL'
        WHEN 'PROGRAMME' THEN EXISTS (SELECT 1 FROM dinc_metadata.programme p WHERE p.programme_code = p_code)
        WHEN 'EVENT'     THEN EXISTS (SELECT 1 FROM dinc_metadata.event ev   WHERE ev.event_code    = p_code)
        WHEN 'ACTIVITY'  THEN EXISTS (SELECT 1 FROM dinc_metadata.activity a WHERE a.activity_code  = p_code)
        ELSE false END;
$$;
COMMENT ON FUNCTION dinc_metadata.fn_scope_ok(text, text) IS
  'Conditional scope_code validation for the four *_mapping tables: GLOBAL<->ALL biconditional; PROGRAMME/EVENT/ACTIVITY resolve to real codes.';

-- ----------------------------------------------------------------------------
-- 1. programme  (Metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.programme (
    programme_id   uuid    NOT NULL,
    programme_code text    NOT NULL,
    programme_name text    NOT NULL,
    display_order  integer NOT NULL,
    CONSTRAINT pk_programme            PRIMARY KEY (programme_id),
    CONSTRAINT uq_programme_code       UNIQUE (programme_code),
    CONSTRAINT uq_programme_name       UNIQUE (programme_name),
    CONSTRAINT ck_programme_disp_order CHECK (display_order > 0)
);

-- ----------------------------------------------------------------------------
-- 2. event  (Metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.event (
    event_id      uuid    NOT NULL,
    event_code    text    NOT NULL,
    programme_id  uuid    NOT NULL,
    event_name    text    NOT NULL,
    display_order integer NOT NULL,
    CONSTRAINT pk_event            PRIMARY KEY (event_id),
    CONSTRAINT uq_event_code       UNIQUE (event_code),
    CONSTRAINT uq_event_prog_name  UNIQUE (programme_id, event_name),
    CONSTRAINT fk_event_programme  FOREIGN KEY (programme_id) REFERENCES dinc_metadata.programme (programme_id),
    CONSTRAINT ck_event_disp_order CHECK (display_order > 0)
);

-- ----------------------------------------------------------------------------
-- 3. activity  (Metadata) — no programme_id by design (3NF; README section 4)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.activity (
    activity_id   uuid    NOT NULL,
    activity_code text    NOT NULL,
    event_id      uuid    NOT NULL,
    activity_name text    NOT NULL,
    display_order integer NOT NULL,
    CONSTRAINT pk_activity            PRIMARY KEY (activity_id),
    CONSTRAINT uq_activity_code       UNIQUE (activity_code),
    CONSTRAINT uq_activity_event_name UNIQUE (event_id, activity_name),
    CONSTRAINT fk_activity_event      FOREIGN KEY (event_id) REFERENCES dinc_metadata.event (event_id),
    CONSTRAINT ck_activity_disp_order CHECK (display_order > 0)
);

-- ----------------------------------------------------------------------------
-- 4. schedule_rule  (Configuration) — exactly one rule per Event
--    The UNIQUE constraints on event_id and event_code ARE the audited 1:1.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.schedule_rule (
    rule_id                 uuid    NOT NULL,
    event_code              text    NOT NULL,
    event_id                uuid    NOT NULL,
    schedule_type           text    NOT NULL,
    anchor_type             text    NOT NULL,
    offset_days             integer,          -- NULL = no engine-computed due date (EVT-005/038/040)
    repeat_interval_days    integer,          -- NULL for non-recurring rules
    repeat_count            integer,          -- NULL = open-ended / indefinite
    repeat_until_event_code text,             -- NULL = no event-based terminator (v1.8; stop gate)
    dependency_event_code   text,             -- NULL = no predecessor gate (start gate)
    condition_code          text,             -- NULL = unconditional
    reference_source        text,             -- NULL = internally defined rule
    rule_description        text,             -- prose only where structured columns cannot express the rule
    CONSTRAINT pk_schedule_rule            PRIMARY KEY (rule_id),
    CONSTRAINT uq_schedule_rule_event_id   UNIQUE (event_id),
    CONSTRAINT uq_schedule_rule_event_code UNIQUE (event_code),
    CONSTRAINT fk_schedrule_event          FOREIGN KEY (event_id)                REFERENCES dinc_metadata.event (event_id),
    CONSTRAINT fk_schedrule_event_code     FOREIGN KEY (event_code)              REFERENCES dinc_metadata.event (event_code),
    CONSTRAINT fk_schedrule_dependency     FOREIGN KEY (dependency_event_code)   REFERENCES dinc_metadata.event (event_code),
    CONSTRAINT fk_schedrule_repeat_until   FOREIGN KEY (repeat_until_event_code) REFERENCES dinc_metadata.event (event_code),
    -- audited invariants, made permanent (Design Review A-8 + v1.8 additions)
    CONSTRAINT ck_schedrule_recurring_interval  CHECK (schedule_type <> 'RECURRING'       OR repeat_interval_days IS NOT NULL),
    CONSTRAINT ck_schedrule_driven_source       CHECK (schedule_type <> 'SCHEDULE_DRIVEN' OR reference_source IS NOT NULL),
    CONSTRAINT ck_schedrule_prev_needs_dep      CHECK (anchor_type <> 'PREVIOUS_EVENT_COMPLETION' OR dependency_event_code IS NOT NULL),
    CONSTRAINT ck_schedrule_offset_nonneg       CHECK (offset_days IS NULL OR offset_days >= 0),
    CONSTRAINT ck_schedrule_interval_positive   CHECK (repeat_interval_days IS NULL OR repeat_interval_days > 0),
    CONSTRAINT ck_schedrule_count_positive      CHECK (repeat_count IS NULL OR repeat_count > 0),
    CONSTRAINT ck_schedrule_until_not_self      CHECK (repeat_until_event_code IS NULL OR repeat_until_event_code <> event_code),
    -- governed vocabularies (lookup enforcement)
    CONSTRAINT ck_schedrule_enum_schedule_type  CHECK (dinc_metadata.fn_enum_ok('schedule_type', schedule_type)),
    CONSTRAINT ck_schedrule_enum_anchor_type    CHECK (dinc_metadata.fn_enum_ok('anchor_type', anchor_type)),
    CONSTRAINT ck_schedrule_enum_condition      CHECK (dinc_metadata.fn_enum_ok('condition_code', condition_code))
);
COMMENT ON COLUMN dinc_metadata.schedule_rule.condition_code IS
  'NULL = unconditional (governed vocabulary; the workbook documents NULL semantics in Enum_Reference).';
COMMENT ON COLUMN dinc_metadata.schedule_rule.repeat_until_event_code IS
  'v1.8: event-based terminator for RECURRING rules; recurrence stops when the referenced Event is Completed. Mirror image of dependency_event_code.';

-- ----------------------------------------------------------------------------
-- 5. schedule_rule_override  (Configuration) — conditional TIMING deltas only.
--    Structural columns (schedule_type / anchor_type / dependency) are
--    deliberately absent: overrides adjust WHEN, never topology.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.schedule_rule_override (
    override_id             uuid    NOT NULL,
    event_code              text    NOT NULL,
    event_id                uuid    NOT NULL,
    condition_code          text    NOT NULL,
    offset_days             integer,          -- non-null replaces base; NULL inherits
    repeat_interval_days    integer,
    repeat_count            integer,
    repeat_until_event_code text,
    is_active               boolean NOT NULL,
    rule_description        text,
    CONSTRAINT pk_schedule_rule_override PRIMARY KEY (override_id),
    CONSTRAINT uq_override_code_cond     UNIQUE (event_code, condition_code),
    CONSTRAINT uq_override_id_cond       UNIQUE (event_id, condition_code),
    CONSTRAINT fk_override_event         FOREIGN KEY (event_id)   REFERENCES dinc_metadata.event (event_id),
    CONSTRAINT fk_override_event_code    FOREIGN KEY (event_code) REFERENCES dinc_metadata.event (event_code),
    CONSTRAINT fk_override_base_rule     FOREIGN KEY (event_id)   REFERENCES dinc_metadata.schedule_rule (event_id),
    CONSTRAINT fk_override_repeat_until  FOREIGN KEY (repeat_until_event_code) REFERENCES dinc_metadata.event (event_code),
    CONSTRAINT ck_override_has_delta     CHECK (offset_days IS NOT NULL OR repeat_interval_days IS NOT NULL
                                             OR repeat_count IS NOT NULL OR repeat_until_event_code IS NOT NULL),
    CONSTRAINT ck_override_offset_nonneg CHECK (offset_days IS NULL OR offset_days >= 0),
    CONSTRAINT ck_override_interval_pos  CHECK (repeat_interval_days IS NULL OR repeat_interval_days > 0),
    CONSTRAINT ck_override_count_pos     CHECK (repeat_count IS NULL OR repeat_count > 0),
    CONSTRAINT ck_override_enum_cond     CHECK (dinc_metadata.fn_enum_ok('condition_code', condition_code))
);
COMMENT ON TABLE dinc_metadata.schedule_rule_override IS
  'v1.8 conditional scheduling. Resolver: effective rule = base schedule_rule with each NON-NULL override column substituted (coalesce). See v_schedule_rule_effective.';

-- ----------------------------------------------------------------------------
-- 6. outcome_template  (Metadata) — 1:1 with activity in v1 (unique FK)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.outcome_template (
    template_id   uuid    NOT NULL,
    activity_id   uuid    NOT NULL,
    activity_code text    NOT NULL,   -- deliberate non-authoritative copy (validated at seed)
    activity_name text    NOT NULL,   -- deliberate non-authoritative copy (validated at seed)
    template_name text    NOT NULL,
    display_order integer NOT NULL,
    CONSTRAINT pk_outcome_template       PRIMARY KEY (template_id),
    CONSTRAINT uq_template_activity_id   UNIQUE (activity_id),
    CONSTRAINT uq_template_activity_code UNIQUE (activity_code),
    CONSTRAINT fk_template_activity      FOREIGN KEY (activity_id) REFERENCES dinc_metadata.activity (activity_id),
    CONSTRAINT ck_template_disp_order    CHECK (display_order > 0)
);
COMMENT ON COLUMN dinc_metadata.outcome_template.activity_name IS
  'Non-authoritative denormalized label (Design Review H-3). Never join on this; 07_validation.sql asserts consistency with activity.';

-- ----------------------------------------------------------------------------
-- 7. outcome_template_field  (Metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.outcome_template_field (
    field_id        uuid    NOT NULL,
    template_id     uuid    NOT NULL,
    field_name      text    NOT NULL,
    field_label     text    NOT NULL,
    field_type      text    NOT NULL,
    required        boolean NOT NULL,
    display_order   integer NOT NULL,
    default_value   text,             -- 100% NULL in v1.8 by design ("no default")
    workflow_action text    NOT NULL,
    CONSTRAINT pk_otf                 PRIMARY KEY (field_id),
    CONSTRAINT uq_otf_template_field  UNIQUE (template_id, field_name),
    CONSTRAINT fk_otf_template        FOREIGN KEY (template_id) REFERENCES dinc_metadata.outcome_template (template_id),
    CONSTRAINT ck_otf_field_type      CHECK (field_type IN ('BOOLEAN')),  -- v1 vocabulary; new types arrive via release migration (Audit D2-2)
    CONSTRAINT ck_otf_disp_order      CHECK (display_order > 0),
    CONSTRAINT ck_otf_enum_workflow   CHECK (dinc_metadata.fn_enum_ok('workflow_action', workflow_action))
);

-- ----------------------------------------------------------------------------
-- 8. call_outcome  (Reference) — standalone vocabulary by design (DR J-3)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.call_outcome (
    code          text    NOT NULL,
    name          text    NOT NULL,
    category      text    NOT NULL,
    is_active     boolean NOT NULL,
    display_order integer NOT NULL,
    CONSTRAINT pk_call_outcome       PRIMARY KEY (code),
    CONSTRAINT uq_call_outcome_name  UNIQUE (name),
    CONSTRAINT ck_call_outcome_order CHECK (display_order > 0)
);

-- ----------------------------------------------------------------------------
-- 9. event_call_outcome  (Mapping) — ALL-sentinel junction; composite natural PK
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.event_call_outcome (
    event_code    text    NOT NULL,   -- real event_code OR the reserved literal 'ALL'
    outcome_code  text    NOT NULL,
    display_order integer NOT NULL,
    is_active     boolean NOT NULL,
    CONSTRAINT pk_event_call_outcome  PRIMARY KEY (event_code, outcome_code),
    CONSTRAINT fk_eco_outcome         FOREIGN KEY (outcome_code) REFERENCES dinc_metadata.call_outcome (code),
    CONSTRAINT ck_eco_event_or_all    CHECK (dinc_metadata.fn_event_or_all(event_code)),  -- never a naive FK (DR K-4)
    CONSTRAINT ck_eco_disp_order      CHECK (display_order > 0)
);

-- ----------------------------------------------------------------------------
-- 10. call_outcome_rule  (Configuration) — decision table; composite natural PK
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.call_outcome_rule (
    outcome_code        text    NOT NULL,
    programme_code      text    NOT NULL,  -- real programme_code OR 'ALL'
    next_action         text    NOT NULL,
    followup_delay_days integer,           -- NULL exactly when FOLLOW_PROGRAM_SCHEDULE
    priority            text    NOT NULL,
    is_active           boolean NOT NULL,
    CONSTRAINT pk_call_outcome_rule    PRIMARY KEY (outcome_code, programme_code),
    CONSTRAINT fk_cor_outcome          FOREIGN KEY (outcome_code) REFERENCES dinc_metadata.call_outcome (code),
    CONSTRAINT ck_cor_prog_or_all      CHECK (dinc_metadata.fn_programme_or_all(programme_code)),
    CONSTRAINT ck_cor_delay_pairing    CHECK ((next_action = 'CREATE_FOLLOWUP') = (followup_delay_days IS NOT NULL)),
    CONSTRAINT ck_cor_delay_nonneg     CHECK (followup_delay_days IS NULL OR followup_delay_days >= 0),
    CONSTRAINT ck_cor_enum_next_action CHECK (dinc_metadata.fn_enum_ok('next_action', next_action)),
    CONSTRAINT ck_cor_enum_priority    CHECK (dinc_metadata.fn_enum_ok('priority', priority))
);

-- ----------------------------------------------------------------------------
-- 11. guidebook  (Metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.guidebook (
    guidebook_code text    NOT NULL,
    title          text    NOT NULL,
    category       text    NOT NULL,
    source         text    NOT NULL,
    is_active      boolean NOT NULL,
    CONSTRAINT pk_guidebook       PRIMARY KEY (guidebook_code),
    CONSTRAINT uq_guidebook_title UNIQUE (title)
);

-- ----------------------------------------------------------------------------
-- 12. guidebook_section  (Metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.guidebook_section (
    section_id     uuid    NOT NULL,
    guidebook_code text    NOT NULL,
    section_type   text    NOT NULL,
    section_title  text    NOT NULL,
    content        text    NOT NULL,
    display_order  integer NOT NULL,
    CONSTRAINT pk_guidebook_section PRIMARY KEY (section_id),
    CONSTRAINT uq_gbsection_type    UNIQUE (guidebook_code, section_type),
    CONSTRAINT fk_gbsection_gb      FOREIGN KEY (guidebook_code) REFERENCES dinc_metadata.guidebook (guidebook_code),
    CONSTRAINT ck_gbsection_order   CHECK (display_order > 0)
);

-- ----------------------------------------------------------------------------
-- 13. guidebook_discovery_rule  (Configuration) — textual discovery path
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.guidebook_discovery_rule (
    rule_id        uuid    NOT NULL,
    pattern        text    NOT NULL,
    guidebook_code text    NOT NULL,
    sort_order     integer NOT NULL,
    is_active      boolean NOT NULL,
    CONSTRAINT pk_gb_discovery_rule PRIMARY KEY (rule_id),
    CONSTRAINT fk_gbdiscovery_gb    FOREIGN KEY (guidebook_code) REFERENCES dinc_metadata.guidebook (guidebook_code),
    CONSTRAINT ck_gbdiscovery_sort  CHECK (sort_order >= 0)   -- data starts at 0
);
COMMENT ON COLUMN dinc_metadata.guidebook_discovery_rule.pattern IS
  'Regex signal -> guidebook. Compilability is asserted by the seed validator, not a CHECK.';

-- ----------------------------------------------------------------------------
-- 14/16/18/20. The four content mapping tables  (Mapping — identical shape)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.guidebook_mapping (
    mapping_id     uuid    NOT NULL,
    guidebook_code text    NOT NULL,
    scope_level    text    NOT NULL,
    scope_code     text    NOT NULL,
    display_order  integer NOT NULL,
    is_active      boolean NOT NULL,
    CONSTRAINT pk_guidebook_mapping  PRIMARY KEY (mapping_id),
    CONSTRAINT uq_gbmap_triple       UNIQUE (guidebook_code, scope_level, scope_code),
    CONSTRAINT fk_gbmap_gb           FOREIGN KEY (guidebook_code) REFERENCES dinc_metadata.guidebook (guidebook_code),
    CONSTRAINT ck_gbmap_enum_scope   CHECK (dinc_metadata.fn_enum_ok('scope_level', scope_level)),
    CONSTRAINT ck_gbmap_scope_valid  CHECK (dinc_metadata.fn_scope_ok(scope_level, scope_code)),
    CONSTRAINT ck_gbmap_global_all   CHECK ((scope_level = 'GLOBAL') = (scope_code = 'ALL')),
    CONSTRAINT ck_gbmap_disp_order   CHECK (display_order > 0)
);

CREATE TABLE IF NOT EXISTS dinc_metadata.faq (
    faq_code  text    NOT NULL,
    category  text    NOT NULL,
    question  text    NOT NULL,
    answer    text    NOT NULL,
    is_active boolean NOT NULL,
    CONSTRAINT pk_faq PRIMARY KEY (faq_code)
);

CREATE TABLE IF NOT EXISTS dinc_metadata.faq_mapping (
    mapping_id    uuid    NOT NULL,
    faq_code      text    NOT NULL,
    scope_level   text    NOT NULL,
    scope_code    text    NOT NULL,
    display_order integer NOT NULL,
    is_active     boolean NOT NULL,
    CONSTRAINT pk_faq_mapping       PRIMARY KEY (mapping_id),
    CONSTRAINT uq_faqmap_triple     UNIQUE (faq_code, scope_level, scope_code),
    CONSTRAINT fk_faqmap_faq        FOREIGN KEY (faq_code) REFERENCES dinc_metadata.faq (faq_code),
    CONSTRAINT ck_faqmap_enum_scope CHECK (dinc_metadata.fn_enum_ok('scope_level', scope_level)),
    CONSTRAINT ck_faqmap_scope_ok   CHECK (dinc_metadata.fn_scope_ok(scope_level, scope_code)),
    CONSTRAINT ck_faqmap_global_all CHECK ((scope_level = 'GLOBAL') = (scope_code = 'ALL')),
    CONSTRAINT ck_faqmap_disp_order CHECK (display_order > 0)
);

CREATE TABLE IF NOT EXISTS dinc_metadata.nutrition_advice (
    advice_id   uuid    NOT NULL,
    advice_code text    NOT NULL,
    category    text    NOT NULL,
    advice_text text    NOT NULL,
    is_active   boolean NOT NULL,
    CONSTRAINT pk_nutrition_advice PRIMARY KEY (advice_id),
    CONSTRAINT uq_nutrition_code   UNIQUE (advice_code)
);

CREATE TABLE IF NOT EXISTS dinc_metadata.nutrition_advice_mapping (
    mapping_id    uuid    NOT NULL,
    advice_code   text    NOT NULL,
    scope_level   text    NOT NULL,
    scope_code    text    NOT NULL,
    display_order integer NOT NULL,
    is_active     boolean NOT NULL,
    CONSTRAINT pk_nutrition_mapping PRIMARY KEY (mapping_id),
    CONSTRAINT uq_nutmap_triple     UNIQUE (advice_code, scope_level, scope_code),
    CONSTRAINT fk_nutmap_advice     FOREIGN KEY (advice_code) REFERENCES dinc_metadata.nutrition_advice (advice_code),
    CONSTRAINT ck_nutmap_enum_scope CHECK (dinc_metadata.fn_enum_ok('scope_level', scope_level)),
    CONSTRAINT ck_nutmap_scope_ok   CHECK (dinc_metadata.fn_scope_ok(scope_level, scope_code)),
    CONSTRAINT ck_nutmap_global_all CHECK ((scope_level = 'GLOBAL') = (scope_code = 'ALL')),
    CONSTRAINT ck_nutmap_disp_order CHECK (display_order > 0)
);

CREATE TABLE IF NOT EXISTS dinc_metadata.training_module (
    module_code      text    NOT NULL,
    title            text    NOT NULL,
    category         text    NOT NULL,
    description      text    NOT NULL,
    duration_minutes integer NOT NULL,
    content          text    NOT NULL,
    is_active        boolean NOT NULL,
    CONSTRAINT pk_training_module PRIMARY KEY (module_code),
    CONSTRAINT ck_tm_duration     CHECK (duration_minutes > 0)
);

CREATE TABLE IF NOT EXISTS dinc_metadata.training_module_mapping (
    mapping_id    uuid    NOT NULL,
    module_code   text    NOT NULL,
    scope_level   text    NOT NULL,
    scope_code    text    NOT NULL,
    display_order integer NOT NULL,
    is_active     boolean NOT NULL,
    CONSTRAINT pk_tm_mapping       PRIMARY KEY (mapping_id),
    CONSTRAINT uq_tmmap_triple     UNIQUE (module_code, scope_level, scope_code),
    CONSTRAINT fk_tmmap_module     FOREIGN KEY (module_code) REFERENCES dinc_metadata.training_module (module_code),
    CONSTRAINT ck_tmmap_enum_scope CHECK (dinc_metadata.fn_enum_ok('scope_level', scope_level)),
    CONSTRAINT ck_tmmap_scope_ok   CHECK (dinc_metadata.fn_scope_ok(scope_level, scope_code)),
    CONSTRAINT ck_tmmap_global_all CHECK ((scope_level = 'GLOBAL') = (scope_code = 'ALL')),
    CONSTRAINT ck_tmmap_disp_order CHECK (display_order > 0)
);

-- ----------------------------------------------------------------------------
-- Release provenance (Blueprint section 5 / Design Task 5): which frozen
-- specification this database embodies.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_metadata.metadata_release (
    release_version text        NOT NULL,
    workbook_file   text        NOT NULL,
    workbook_sha256 text        NOT NULL,
    loaded_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_metadata_release PRIMARY KEY (release_version)
);

-- ============================================================================
-- Metadata secondary indexes — exactly as approved (Design Task 1).
-- PK/UNIQUE constraint indexes already exist implicitly and are not duplicated.
-- At metadata volume (max 193 rows) these back FK lookups, not performance.
-- ============================================================================

-- FK expansion paths
CREATE INDEX IF NOT EXISTS ix_event_programme_id        ON dinc_metadata.event (programme_id);
CREATE INDEX IF NOT EXISTS ix_activity_event_id         ON dinc_metadata.activity (event_id);
CREATE INDEX IF NOT EXISTS ix_otf_template_id           ON dinc_metadata.outcome_template_field (template_id);
CREATE INDEX IF NOT EXISTS ix_gbsection_guidebook       ON dinc_metadata.guidebook_section (guidebook_code);
CREATE INDEX IF NOT EXISTS ix_gbdiscovery_guidebook     ON dinc_metadata.guidebook_discovery_rule (guidebook_code);
CREATE INDEX IF NOT EXISTS ix_eco_outcome_code          ON dinc_metadata.event_call_outcome (outcome_code);

-- Schedule Engine lookups: "which events depend on the one just completed"
-- and "which recurrences stop at this event" (Design Task 1.4)
CREATE INDEX IF NOT EXISTS ix_schedrule_dependency      ON dinc_metadata.schedule_rule (dependency_event_code);
CREATE INDEX IF NOT EXISTS ix_schedrule_repeat_until    ON dinc_metadata.schedule_rule (repeat_until_event_code);

-- Knowledge Engine resolution is BY SCOPE: "everything for PRG-xxx + GLOBAL"
CREATE INDEX IF NOT EXISTS ix_gbmap_scope               ON dinc_metadata.guidebook_mapping (scope_level, scope_code);
CREATE INDEX IF NOT EXISTS ix_faqmap_scope              ON dinc_metadata.faq_mapping (scope_level, scope_code);
CREATE INDEX IF NOT EXISTS ix_nutmap_scope              ON dinc_metadata.nutrition_advice_mapping (scope_level, scope_code);
CREATE INDEX IF NOT EXISTS ix_tmmap_scope               ON dinc_metadata.training_module_mapping (scope_level, scope_code);

RESET check_function_bodies;
