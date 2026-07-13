-- ============================================================================
-- DiNC Platform — PostgreSQL Implementation
-- File 03: Runtime tables (dinc_runtime) — R1..R9
-- Approved design : DiNC_PostgreSQL_Database_Design.md (Task 2)
-- Idempotent      : yes
-- DEPLOY ORDER    : runs AFTER 02_metadata_tables.sql and 04_security_tables.sql
--                   (FKs point at both); 09_deploy.sql executes in dependency
--                   order, not filename order. R10 audit_log lives in File 05.
--
-- Exactly the approved runtime tables — no inventions.
-- Conventions from the approved design:
--   * Runtime PKs are database-generated UUIDs (gen_random_uuid()).
--   * Runtime references metadata ONLY by frozen stable keys; never copies it.
--   * Runtime status vocabularies are runtime-owned CHECKs, deliberately NOT
--     rows in dinc_metadata.enum_reference (metadata holds no runtime state).
--   * Overdue is DERIVED (now > due_date AND not completed), never stored.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- R1. patient
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_runtime.patient (
    patient_id  uuid        NOT NULL DEFAULT gen_random_uuid(),
    external_id text,                              -- e.g. RCH ID; attribute, not the PK
    full_name   text        NOT NULL,
    sex         text        NOT NULL,
    birth_date  date,                              -- required only for BIRTH_DATE-anchored programmes (BD-2)
    phone       text,
    address     text,
    is_active   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_patient PRIMARY KEY (patient_id),
    CONSTRAINT uq_patient_external_id UNIQUE (external_id),
    CONSTRAINT ck_patient_sex CHECK (sex IN ('FEMALE', 'MALE', 'OTHER'))  -- feeds FEMALE_ONLY condition evaluation
);

-- ----------------------------------------------------------------------------
-- R2. programme_enrolment — holds the PROGRAMME_REGISTRATION anchor
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_runtime.programme_enrolment (
    enrolment_id      uuid        NOT NULL DEFAULT gen_random_uuid(),
    patient_id        uuid        NOT NULL,
    programme_id      uuid        NOT NULL,
    registration_date date        NOT NULL,        -- the anchor for 36 of 65 events
    status            text        NOT NULL DEFAULT 'ACTIVE',
    exit_reason       text,                        -- BD-7
    exited_at         timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_programme_enrolment PRIMARY KEY (enrolment_id),
    CONSTRAINT fk_enrolment_patient   FOREIGN KEY (patient_id)   REFERENCES dinc_runtime.patient (patient_id),
    CONSTRAINT fk_enrolment_programme FOREIGN KEY (programme_id) REFERENCES dinc_metadata.programme (programme_id),
    CONSTRAINT ck_enrolment_status    CHECK (status IN ('ACTIVE', 'COMPLETED', 'EXITED')),
    CONSTRAINT ck_enrolment_exit      CHECK ((status = 'EXITED') = (exited_at IS NOT NULL))
);
-- One LIVE enrolment per programme per patient; history of re-enrolments allowed (BD-1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrolment_active_once
    ON dinc_runtime.programme_enrolment (patient_id, programme_id)
    WHERE status = 'ACTIVE';

-- ----------------------------------------------------------------------------
-- R3. patient_condition — runtime input that evaluates condition_code (BD-5).
--     Every insert/clear must trigger schedule re-resolution (README §10 step 6).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_runtime.patient_condition (
    condition_id   uuid        NOT NULL DEFAULT gen_random_uuid(),
    patient_id     uuid        NOT NULL,
    enrolment_id   uuid,                           -- scope flag to an enrolment (HIGH_RISK is pregnancy-specific)
    condition_code text        NOT NULL,
    flagged_at     timestamptz NOT NULL DEFAULT now(),
    flagged_by     uuid,
    cleared_at     timestamptz,                    -- NULL = live flag
    cleared_by     uuid,
    source         text,
    CONSTRAINT pk_patient_condition PRIMARY KEY (condition_id),
    CONSTRAINT fk_pcond_patient     FOREIGN KEY (patient_id)   REFERENCES dinc_runtime.patient (patient_id),
    CONSTRAINT fk_pcond_enrolment   FOREIGN KEY (enrolment_id) REFERENCES dinc_runtime.programme_enrolment (enrolment_id),
    CONSTRAINT fk_pcond_flagged_by  FOREIGN KEY (flagged_by)   REFERENCES dinc_security.app_user (user_id),
    CONSTRAINT fk_pcond_cleared_by  FOREIGN KEY (cleared_by)   REFERENCES dinc_security.app_user (user_id),
    -- vocabulary enforcement: condition tokens must stay inside the governed set
    CONSTRAINT ck_pcond_vocabulary  CHECK (dinc_metadata.fn_enum_ok('condition_code', condition_code)),
    CONSTRAINT ck_pcond_clear_pair  CHECK (cleared_by IS NULL OR cleared_at IS NOT NULL)
);
-- One live flag per condition per enrolment (and per patient for unscoped flags).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pcond_live_enrolment
    ON dinc_runtime.patient_condition (enrolment_id, condition_code)
    WHERE cleared_at IS NULL AND enrolment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pcond_live_patient
    ON dinc_runtime.patient_condition (patient_id, condition_code)
    WHERE cleared_at IS NULL AND enrolment_id IS NULL;

-- ----------------------------------------------------------------------------
-- R4. event_instance — occurrence_number absorbs RECURRING streams
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_runtime.event_instance (
    event_instance_id uuid        NOT NULL DEFAULT gen_random_uuid(),
    enrolment_id      uuid        NOT NULL,
    event_id          uuid        NOT NULL,
    occurrence_number integer     NOT NULL DEFAULT 1,
    status            text        NOT NULL DEFAULT 'LOCKED',
    due_date          date,                        -- computed from the EFFECTIVE rule (base ⊕ override)
    condition_context text,                        -- which condition variant priced the due date (audit trail)
    activated_at      timestamptz,
    completed_at      timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_event_instance   PRIMARY KEY (event_instance_id),
    CONSTRAINT fk_ei_enrolment     FOREIGN KEY (enrolment_id) REFERENCES dinc_runtime.programme_enrolment (enrolment_id),
    CONSTRAINT fk_ei_event         FOREIGN KEY (event_id)     REFERENCES dinc_metadata.event (event_id),
    CONSTRAINT uq_ei_occurrence    UNIQUE (enrolment_id, event_id, occurrence_number),  -- "no duplicate events", structural
    CONSTRAINT ck_ei_status        CHECK (status IN ('LOCKED', 'ACTIVE', 'COMPLETED')), -- Overdue is derived, never stored
    CONSTRAINT ck_ei_occurrence    CHECK (occurrence_number > 0),
    CONSTRAINT ck_ei_completed_at  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

-- ----------------------------------------------------------------------------
-- R5. activity_instance
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_runtime.activity_instance (
    activity_instance_id uuid        NOT NULL DEFAULT gen_random_uuid(),
    event_instance_id    uuid        NOT NULL,
    activity_id          uuid        NOT NULL,
    status               text        NOT NULL DEFAULT 'LOCKED',
    completed_at         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_activity_instance PRIMARY KEY (activity_instance_id),
    CONSTRAINT fk_ai_event_instance FOREIGN KEY (event_instance_id) REFERENCES dinc_runtime.event_instance (event_instance_id),
    CONSTRAINT fk_ai_activity       FOREIGN KEY (activity_id)       REFERENCES dinc_metadata.activity (activity_id),
    CONSTRAINT uq_ai_once           UNIQUE (event_instance_id, activity_id),
    CONSTRAINT ck_ai_status         CHECK (status IN ('LOCKED', 'PENDING', 'COMPLETED')),
    CONSTRAINT ck_ai_completed_at   CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

-- ----------------------------------------------------------------------------
-- R6. outcome_response — multiple attempts by design (BD-6); no unique on
--     (instance, field): latest-wins is a query rule.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_runtime.outcome_response (
    response_id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    activity_instance_id uuid        NOT NULL,
    field_id             uuid        NOT NULL,
    response_value       text        NOT NULL,
    recorded_at          timestamptz NOT NULL DEFAULT now(),
    recorded_by          uuid,
    CONSTRAINT pk_outcome_response PRIMARY KEY (response_id),
    CONSTRAINT fk_or_activity_inst FOREIGN KEY (activity_instance_id) REFERENCES dinc_runtime.activity_instance (activity_instance_id),
    CONSTRAINT fk_or_field         FOREIGN KEY (field_id)             REFERENCES dinc_metadata.outcome_template_field (field_id),
    CONSTRAINT fk_or_recorded_by   FOREIGN KEY (recorded_by)          REFERENCES dinc_security.app_user (user_id)
);

-- ----------------------------------------------------------------------------
-- R7. call_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_runtime.call_log (
    call_log_id       uuid        NOT NULL DEFAULT gen_random_uuid(),
    enrolment_id      uuid        NOT NULL,
    event_instance_id uuid,                        -- nullable: a call may be general
    outcome_code      text        NOT NULL,
    called_at         timestamptz NOT NULL DEFAULT now(),
    called_by         uuid,
    notes             text,
    CONSTRAINT pk_call_log        PRIMARY KEY (call_log_id),
    CONSTRAINT fk_cl_enrolment    FOREIGN KEY (enrolment_id)      REFERENCES dinc_runtime.programme_enrolment (enrolment_id),
    CONSTRAINT fk_cl_event_inst   FOREIGN KEY (event_instance_id) REFERENCES dinc_runtime.event_instance (event_instance_id),
    CONSTRAINT fk_cl_outcome      FOREIGN KEY (outcome_code)      REFERENCES dinc_metadata.call_outcome (code),
    CONSTRAINT fk_cl_called_by    FOREIGN KEY (called_by)         REFERENCES dinc_security.app_user (user_id)
);

-- ----------------------------------------------------------------------------
-- R8. followup_task — raised by a CREATE_FOLLOWUP rule (BD-9); 1:0..1 from call_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_runtime.followup_task (
    followup_task_id uuid        NOT NULL DEFAULT gen_random_uuid(),
    call_log_id      uuid        NOT NULL,
    enrolment_id     uuid        NOT NULL,
    due_date         date        NOT NULL,         -- call date + followup_delay_days, a fact AT CREATION (not a metadata copy)
    priority         text        NOT NULL,
    status           text        NOT NULL DEFAULT 'OPEN',
    assigned_to      uuid,
    completed_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_followup_task    PRIMARY KEY (followup_task_id),
    CONSTRAINT uq_ft_call_log      UNIQUE (call_log_id),          -- the 1:0..1
    CONSTRAINT fk_ft_call_log      FOREIGN KEY (call_log_id)  REFERENCES dinc_runtime.call_log (call_log_id),
    CONSTRAINT fk_ft_enrolment     FOREIGN KEY (enrolment_id) REFERENCES dinc_runtime.programme_enrolment (enrolment_id),
    CONSTRAINT fk_ft_assigned_to   FOREIGN KEY (assigned_to)  REFERENCES dinc_security.app_user (user_id),
    CONSTRAINT ck_ft_status        CHECK (status IN ('OPEN', 'DONE', 'CANCELLED')),
    CONSTRAINT ck_ft_priority      CHECK (dinc_metadata.fn_enum_ok('priority', priority)),  -- same governed vocabulary the rule resolved from
    CONSTRAINT ck_ft_completed_at  CHECK ((status = 'DONE') = (completed_at IS NOT NULL))
);

-- ----------------------------------------------------------------------------
-- R9. notification — machine delivery ledger (distinct from followup_task)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dinc_runtime.notification (
    notification_id   uuid        NOT NULL DEFAULT gen_random_uuid(),
    patient_id        uuid        NOT NULL,
    event_instance_id uuid,
    followup_task_id  uuid,
    channel           text        NOT NULL,
    message_body      text        NOT NULL,
    scheduled_for     timestamptz NOT NULL,
    sent_at           timestamptz,
    status            text        NOT NULL DEFAULT 'SCHEDULED',
    failure_detail    text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_notification    PRIMARY KEY (notification_id),
    CONSTRAINT fk_nt_patient      FOREIGN KEY (patient_id)        REFERENCES dinc_runtime.patient (patient_id),
    CONSTRAINT fk_nt_event_inst   FOREIGN KEY (event_instance_id) REFERENCES dinc_runtime.event_instance (event_instance_id),
    CONSTRAINT fk_nt_followup     FOREIGN KEY (followup_task_id)  REFERENCES dinc_runtime.followup_task (followup_task_id),
    CONSTRAINT ck_nt_about_one    CHECK (num_nonnulls(event_instance_id, followup_task_id) = 1),  -- exactly one subject
    CONSTRAINT ck_nt_status       CHECK (status IN ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED')),
    CONSTRAINT ck_nt_sent_pair    CHECK (status <> 'SENT' OR sent_at IS NOT NULL)
);

-- ============================================================================
-- Runtime secondary indexes — exactly as approved (Design Task 2 / Task 6).
-- The three product hot paths: worklist, follow-up queue, dispatcher.
-- ============================================================================

-- patient lookup paths
CREATE INDEX IF NOT EXISTS ix_patient_full_name      ON dinc_runtime.patient (full_name);
CREATE INDEX IF NOT EXISTS ix_patient_phone          ON dinc_runtime.patient (phone);

-- enrolment navigation + cohort queries
CREATE INDEX IF NOT EXISTS ix_enrolment_patient      ON dinc_runtime.programme_enrolment (patient_id);
CREATE INDEX IF NOT EXISTS ix_enrolment_prog_status  ON dinc_runtime.programme_enrolment (programme_id, status);

-- condition evaluation & re-resolution trigger path
CREATE INDEX IF NOT EXISTS ix_pcond_enrolment_code   ON dinc_runtime.patient_condition (enrolment_id, condition_code);

-- HOT PATH 1: care-manager worklist
CREATE INDEX IF NOT EXISTS ix_ei_status_due          ON dinc_runtime.event_instance (status, due_date);
CREATE INDEX IF NOT EXISTS ix_ei_enrolment           ON dinc_runtime.event_instance (enrolment_id);

-- pending activities (worklist detail)
CREATE INDEX IF NOT EXISTS ix_ai_pending             ON dinc_runtime.activity_instance (event_instance_id) WHERE status = 'PENDING';

-- latest-wins response reads
CREATE INDEX IF NOT EXISTS ix_or_instance_field_time ON dinc_runtime.outcome_response (activity_instance_id, field_id, recorded_at);

-- call history per enrolment
CREATE INDEX IF NOT EXISTS ix_cl_enrolment_time      ON dinc_runtime.call_log (enrolment_id, called_at);

-- HOT PATH 2: follow-up queue
CREATE INDEX IF NOT EXISTS ix_ft_assigned_status_due ON dinc_runtime.followup_task (assigned_to, status, due_date);
CREATE INDEX IF NOT EXISTS ix_ft_enrolment           ON dinc_runtime.followup_task (enrolment_id);

-- HOT PATH 3: notification dispatcher
CREATE INDEX IF NOT EXISTS ix_nt_status_scheduled    ON dinc_runtime.notification (status, scheduled_for);
