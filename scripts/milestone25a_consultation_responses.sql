-- ============================================================================
-- Milestone 25A — Consultation Response Model
-- ============================================================================
-- These statements are executed automatically and idempotently by
-- CdseRepository.onModuleInit() → migrate(). This file is the human-readable
-- reference for the same schema, for manual DB administration.
--
-- Design principle: every counselling question DISPLAYED during a consultation
-- produces exactly one explicit consultation_responses row (including
-- NOT_ASSESSED). counselling_items OWNS its clinical metadata as columns; the
-- CDSE reads that metadata rather than inferring risk from section names.
--
-- This supersedes the runtime section-name inference from
-- scripts/milestone25_cdse_categories.sql (step 4 of that file is removed).
-- ============================================================================

-- ── 1. counselling_items owned metadata ────────────────────────────────────

-- Legacy column, deprecated. Retained for ONE release of dual-read backward
-- compatibility and kept in sync with risk_category by the seed below.
ALTER TABLE public.counselling_items
  ADD COLUMN IF NOT EXISTS category VARCHAR(25)
    CHECK (category IN ('DANGER_SIGN','REFERRAL_CRITERIA','MEDICATION_ADHERENCE','LIFESTYLE'));

-- Permanent authored business identity key (item_key). Created and authored in
-- the counselling item seed (Milestone 16E / ConsultationRepository) as CI_XXXXXX,
-- one per item. Pure identity: never derived from wording, section, guidebook,
-- display order, or risk category, and immutable for the item's lifetime. The
-- risk seed below keys on it. Shown here for reference; this migration does NOT
-- create or populate item_key.

-- How the worker answers this question.
ALTER TABLE public.counselling_items
  ADD COLUMN IF NOT EXISTS response_type VARCHAR(20) NOT NULL DEFAULT 'BOOLEAN'
    CHECK (response_type IN ('BOOLEAN','YES_NO_UNKNOWN','CHOICE','NUMBER','TEXT'));

-- Owned clinical risk category. NULL = not yet authored (the seed sets an
-- explicit value, including 'NONE'). Once set it is item-owned and editable.
ALTER TABLE public.counselling_items
  ADD COLUMN IF NOT EXISTS risk_category VARCHAR(25)
    CHECK (risk_category IN ('NONE','DANGER_SIGN','REFERRAL_CRITERIA','MEDICATION_ADHERENCE','LIFESTYLE'));

-- Allowed answer values for CHOICE / YES_NO_UNKNOWN (JSON array). NULL for
-- BOOLEAN / NUMBER / TEXT.
ALTER TABLE public.counselling_items
  ADD COLUMN IF NOT EXISTS response_options JSONB;

-- Answer values that trigger CDSE risk (JSON array). NULL / [] = never triggers.
-- NOT_ASSESSED can never appear here, so NOT_ASSESSED can never trigger risk.
ALTER TABLE public.counselling_items
  ADD COLUMN IF NOT EXISTS risk_trigger_values JSONB;

-- Cleanup: drop the deprecated order-derived structural identifier item_code and
-- its unique index. Fully superseded by the permanent authored item_key, which is
-- now the ONLY permanent business identifier. Idempotent; no-op where absent.
DROP INDEX IF EXISTS public.idx_counselling_items_code;
ALTER TABLE public.counselling_items
  DROP COLUMN IF EXISTS item_code;

-- ── 2. clinical_alerts — base table + 25A columns ──────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_clinical_alerts_citizen_status
  ON public.clinical_alerts(citizen_id, status);

-- Link the alert to the consultation (outcome_record) that produced it.
ALTER TABLE public.clinical_alerts
  ADD COLUMN IF NOT EXISTS outcome_record_id UUID
    REFERENCES public.outcome_records(id) ON DELETE SET NULL;

-- Exact counselling questions that produced the classification
-- (JSON array of { itemId, question, category, responseValue }).
ALTER TABLE public.clinical_alerts
  ADD COLUMN IF NOT EXISTS trigger_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── 3. consultation_responses — single source of truth ─────────────────────
-- Exactly one row per counselling question DISPLAYED in a consultation.
-- Snapshots question_text / response_type / response_options / risk_category so
-- the record stays fully reproducible even if the item's metadata is later
-- edited or the item is removed.
-- response_status: ANSWERED | NOT_ASSESSED | NOT_PRESENTED (last reserved for
-- future conditional questionnaires).

CREATE TABLE IF NOT EXISTS public.consultation_responses (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_record_id   UUID        NOT NULL
                        REFERENCES public.outcome_records(id) ON DELETE CASCADE,
  worklist_item_id    UUID        NOT NULL
                        REFERENCES public.worklist_items(id) ON DELETE CASCADE,
  citizen_id          UUID        NOT NULL
                        REFERENCES public.citizens(id) ON DELETE CASCADE,
  counselling_item_id UUID
                        REFERENCES public.counselling_items(id) ON DELETE SET NULL,
  question_text       TEXT        NOT NULL,
  response_type       VARCHAR(20) NOT NULL,
  response_options    JSONB,
  response_status     VARCHAR(15) NOT NULL
                        CHECK (response_status IN ('ANSWERED','NOT_ASSESSED','NOT_PRESENTED')),
  response_value      TEXT,
  risk_category       VARCHAR(25),
  triggered_risk      BOOLEAN     NOT NULL DEFAULT false,
  recorded_by         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Column upgrades for pre-existing partial tables (CREATE TABLE IF NOT EXISTS
-- never alters an existing table). Idempotent; adds any missing column.
ALTER TABLE public.consultation_responses ADD COLUMN IF NOT EXISTS response_options JSONB;
ALTER TABLE public.consultation_responses ADD COLUMN IF NOT EXISTS risk_category VARCHAR(25);
ALTER TABLE public.consultation_responses ADD COLUMN IF NOT EXISTS triggered_risk BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.consultation_responses ADD COLUMN IF NOT EXISTS recorded_by TEXT;

-- One response per question per consultation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_responses_record_item
  ON public.consultation_responses(outcome_record_id, counselling_item_id);

-- Population-health / patient history reads.
CREATE INDEX IF NOT EXISTS idx_consultation_responses_citizen
  ON public.consultation_responses(citizen_id, created_at DESC);

-- Per-question analytics.
CREATE INDEX IF NOT EXISTS idx_consultation_responses_item
  ON public.consultation_responses(counselling_item_id);

-- Activity-scoped lookups.
CREATE INDEX IF NOT EXISTS idx_consultation_responses_worklist
  ON public.consultation_responses(worklist_item_id);

-- ── 4. Curated metadata seed (explicit; permanent item_key; NO wording) ─────
-- Every step is idempotent and only fills unauthored values. This section is
-- the CANONICAL curated mapping — a fresh database is fully reproducible from
-- this file alone. (backend/src/cdse/cdse.repository.ts keeps an identical copy
-- that runs on startup.)

-- A. item_key is authored inline in the Milestone 16E item seed (CI_XXXXXX) and
--    is immutable. There is deliberately NO backfill here: the identifier is
--    never generated or derived from order/wording at migration time.

-- B. Canonical curated risk categories, keyed by the permanent item_key.
--    Items not listed default to NONE in step C.
UPDATE public.counselling_items ci
SET    risk_category = m.cat
FROM   (VALUES
        ('CI_000015','LIFESTYLE'), -- GB001-S04-I01 GB001/Nutrition Before Pregnancy/I1
        ('CI_000016','LIFESTYLE'), -- GB001-S04-I02 GB001/Nutrition Before Pregnancy/I2
        ('CI_000017','LIFESTYLE'), -- GB001-S04-I03 GB001/Nutrition Before Pregnancy/I3
        ('CI_000018','LIFESTYLE'), -- GB001-S04-I04 GB001/Nutrition Before Pregnancy/I4
        ('CI_000019','REFERRAL_CRITERIA'), -- GB001-S05-I01 GB001/Referral Criteria/I1
        ('CI_000020','REFERRAL_CRITERIA'), -- GB001-S05-I02 GB001/Referral Criteria/I2
        ('CI_000021','REFERRAL_CRITERIA'), -- GB001-S05-I03 GB001/Referral Criteria/I3
        ('CI_000022','REFERRAL_CRITERIA'), -- GB001-S05-I04 GB001/Referral Criteria/I4
        ('CI_000026','LIFESTYLE'), -- GB002-S01-I01 GB002/Nutrition and Supplements/I1
        ('CI_000027','LIFESTYLE'), -- GB002-S01-I02 GB002/Nutrition and Supplements/I2
        ('CI_000028','LIFESTYLE'), -- GB002-S01-I03 GB002/Nutrition and Supplements/I3
        ('CI_000029','LIFESTYLE'), -- GB002-S01-I04 GB002/Nutrition and Supplements/I4
        ('CI_000030','LIFESTYLE'), -- GB002-S01-I05 GB002/Nutrition and Supplements/I5
        ('CI_000042','DANGER_SIGN'), -- GB002-S05-I01 GB002/Danger Signs/I1
        ('CI_000043','DANGER_SIGN'), -- GB002-S05-I02 GB002/Danger Signs/I2
        ('CI_000044','DANGER_SIGN'), -- GB002-S05-I03 GB002/Danger Signs/I3
        ('CI_000045','DANGER_SIGN'), -- GB002-S05-I04 GB002/Danger Signs/I4
        ('CI_000046','DANGER_SIGN'), -- GB002-S05-I05 GB002/Danger Signs/I5
        ('CI_000071','DANGER_SIGN'), -- GB003-S05-I01 GB003/Danger Signs - Mother/I1
        ('CI_000072','DANGER_SIGN'), -- GB003-S05-I02 GB003/Danger Signs - Mother/I2
        ('CI_000073','DANGER_SIGN'), -- GB003-S05-I03 GB003/Danger Signs - Mother/I3
        ('CI_000074','DANGER_SIGN'), -- GB003-S05-I04 GB003/Danger Signs - Mother/I4
        ('CI_000075','DANGER_SIGN'), -- GB003-S05-I05 GB003/Danger Signs - Mother/I5
        ('CI_000076','DANGER_SIGN'), -- GB003-S06-I01 GB003/Danger Signs - Baby/I1
        ('CI_000077','DANGER_SIGN'), -- GB003-S06-I02 GB003/Danger Signs - Baby/I2
        ('CI_000078','DANGER_SIGN'), -- GB003-S06-I03 GB003/Danger Signs - Baby/I3
        ('CI_000079','DANGER_SIGN'), -- GB003-S06-I04 GB003/Danger Signs - Baby/I4
        ('CI_000080','DANGER_SIGN'), -- GB003-S06-I05 GB003/Danger Signs - Baby/I5
        ('CI_000098','DANGER_SIGN'), -- GB004-S04-I01 GB004/Danger Signs/I1
        ('CI_000099','DANGER_SIGN'), -- GB004-S04-I02 GB004/Danger Signs/I2
        ('CI_000100','DANGER_SIGN'), -- GB004-S04-I03 GB004/Danger Signs/I3
        ('CI_000101','DANGER_SIGN'), -- GB004-S04-I04 GB004/Danger Signs/I4
        ('CI_000102','DANGER_SIGN'), -- GB004-S04-I05 GB004/Danger Signs/I5
        ('CI_000114','MEDICATION_ADHERENCE'), -- GB005-S01-I01 GB005/Treatment Adherence/I1
        ('CI_000115','MEDICATION_ADHERENCE'), -- GB005-S01-I02 GB005/Treatment Adherence/I2
        ('CI_000116','MEDICATION_ADHERENCE'), -- GB005-S01-I03 GB005/Treatment Adherence/I3
        ('CI_000117','MEDICATION_ADHERENCE'), -- GB005-S01-I04 GB005/Treatment Adherence/I4
        ('CI_000118','MEDICATION_ADHERENCE'), -- GB005-S01-I05 GB005/Treatment Adherence/I5
        ('CI_000124','LIFESTYLE'), -- GB005-S03-I01 GB005/Nutrition During TB/I1
        ('CI_000125','LIFESTYLE'), -- GB005-S03-I02 GB005/Nutrition During TB/I2
        ('CI_000126','LIFESTYLE'), -- GB005-S03-I03 GB005/Nutrition During TB/I3
        ('CI_000127','LIFESTYLE'), -- GB005-S03-I04 GB005/Nutrition During TB/I4
        ('CI_000137','REFERRAL_CRITERIA'), -- GB005-S06-I01 GB005/Referral Criteria/I1
        ('CI_000138','REFERRAL_CRITERIA'), -- GB005-S06-I02 GB005/Referral Criteria/I2
        ('CI_000139','REFERRAL_CRITERIA'), -- GB005-S06-I03 GB005/Referral Criteria/I3
        ('CI_000140','REFERRAL_CRITERIA'), -- GB005-S06-I04 GB005/Referral Criteria/I4
        ('CI_000159','DANGER_SIGN'), -- GB006-S04-I01 GB006/Danger Signs/I1
        ('CI_000160','DANGER_SIGN'), -- GB006-S04-I02 GB006/Danger Signs/I2
        ('CI_000161','DANGER_SIGN'), -- GB006-S04-I03 GB006/Danger Signs/I3
        ('CI_000162','DANGER_SIGN'), -- GB006-S04-I04 GB006/Danger Signs/I4
        ('CI_000163','DANGER_SIGN'), -- GB006-S04-I05 GB006/Danger Signs/I5
        ('CI_000171','LIFESTYLE'), -- GB007-S01-I01 GB007/Lifestyle Modification/I1
        ('CI_000172','LIFESTYLE'), -- GB007-S01-I02 GB007/Lifestyle Modification/I2
        ('CI_000173','LIFESTYLE'), -- GB007-S01-I03 GB007/Lifestyle Modification/I3
        ('CI_000174','LIFESTYLE'), -- GB007-S01-I04 GB007/Lifestyle Modification/I4
        ('CI_000175','LIFESTYLE'), -- GB007-S01-I05 GB007/Lifestyle Modification/I5
        ('CI_000176','LIFESTYLE'), -- GB007-S02-I01 GB007/Diet and Nutrition/I1
        ('CI_000177','LIFESTYLE'), -- GB007-S02-I02 GB007/Diet and Nutrition/I2
        ('CI_000178','LIFESTYLE'), -- GB007-S02-I03 GB007/Diet and Nutrition/I3
        ('CI_000179','LIFESTYLE'), -- GB007-S02-I04 GB007/Diet and Nutrition/I4
        ('CI_000180','LIFESTYLE'), -- GB007-S02-I05 GB007/Diet and Nutrition/I5
        ('CI_000181','MEDICATION_ADHERENCE'), -- GB007-S03-I01 GB007/Medication Adherence/I1
        ('CI_000182','MEDICATION_ADHERENCE'), -- GB007-S03-I02 GB007/Medication Adherence/I2
        ('CI_000183','MEDICATION_ADHERENCE'), -- GB007-S03-I03 GB007/Medication Adherence/I3
        ('CI_000184','MEDICATION_ADHERENCE'), -- GB007-S03-I04 GB007/Medication Adherence/I4
        ('CI_000185','MEDICATION_ADHERENCE'), -- GB007-S03-I05 GB007/Medication Adherence/I5
        ('CI_000190','DANGER_SIGN'), -- GB007-S05-I01 GB007/Danger Signs/I1
        ('CI_000191','DANGER_SIGN'), -- GB007-S05-I02 GB007/Danger Signs/I2
        ('CI_000192','DANGER_SIGN'), -- GB007-S05-I03 GB007/Danger Signs/I3
        ('CI_000193','DANGER_SIGN'), -- GB007-S05-I04 GB007/Danger Signs/I4
        ('CI_000194','DANGER_SIGN'), -- GB007-S05-I05 GB007/Danger Signs/I5
        ('CI_000195','REFERRAL_CRITERIA'), -- GB007-S06-I01 GB007/Referral Criteria/I1
        ('CI_000196','REFERRAL_CRITERIA'), -- GB007-S06-I02 GB007/Referral Criteria/I2
        ('CI_000197','REFERRAL_CRITERIA'), -- GB007-S06-I03 GB007/Referral Criteria/I3
        ('CI_000198','REFERRAL_CRITERIA'), -- GB007-S06-I04 GB007/Referral Criteria/I4
        ('CI_000199','REFERRAL_CRITERIA'), -- GB007-S06-I05 GB007/Referral Criteria/I5
        ('CI_000204','LIFESTYLE'), -- GB008-S01-I01 GB008/Healthy Lifestyle/I1
        ('CI_000205','LIFESTYLE'), -- GB008-S01-I02 GB008/Healthy Lifestyle/I2
        ('CI_000206','LIFESTYLE'), -- GB008-S01-I03 GB008/Healthy Lifestyle/I3
        ('CI_000207','LIFESTYLE'), -- GB008-S01-I04 GB008/Healthy Lifestyle/I4
        ('CI_000208','LIFESTYLE'), -- GB008-S01-I05 GB008/Healthy Lifestyle/I5
        ('CI_000209','LIFESTYLE'), -- GB008-S02-I01 GB008/Diet and Nutrition/I1
        ('CI_000210','LIFESTYLE'), -- GB008-S02-I02 GB008/Diet and Nutrition/I2
        ('CI_000211','LIFESTYLE'), -- GB008-S02-I03 GB008/Diet and Nutrition/I3
        ('CI_000212','LIFESTYLE'), -- GB008-S02-I04 GB008/Diet and Nutrition/I4
        ('CI_000213','LIFESTYLE'), -- GB008-S02-I05 GB008/Diet and Nutrition/I5
        ('CI_000214','MEDICATION_ADHERENCE'), -- GB008-S03-I01 GB008/Medication Adherence/I1
        ('CI_000215','MEDICATION_ADHERENCE'), -- GB008-S03-I02 GB008/Medication Adherence/I2
        ('CI_000216','MEDICATION_ADHERENCE'), -- GB008-S03-I03 GB008/Medication Adherence/I3
        ('CI_000217','MEDICATION_ADHERENCE'), -- GB008-S03-I04 GB008/Medication Adherence/I4
        ('CI_000218','MEDICATION_ADHERENCE'), -- GB008-S03-I05 GB008/Medication Adherence/I5
        ('CI_000227','DANGER_SIGN'), -- GB008-S06-I01 GB008/Danger Signs/I1
        ('CI_000228','DANGER_SIGN'), -- GB008-S06-I02 GB008/Danger Signs/I2
        ('CI_000229','DANGER_SIGN'), -- GB008-S06-I03 GB008/Danger Signs/I3
        ('CI_000230','DANGER_SIGN'), -- GB008-S06-I04 GB008/Danger Signs/I4
        ('CI_000231','DANGER_SIGN'), -- GB008-S06-I05 GB008/Danger Signs/I5
        ('CI_000244','LIFESTYLE'), -- GB009-S02-I01 GB009/Kidney-Safe Diet/I1
        ('CI_000245','LIFESTYLE'), -- GB009-S02-I02 GB009/Kidney-Safe Diet/I2
        ('CI_000246','LIFESTYLE'), -- GB009-S02-I03 GB009/Kidney-Safe Diet/I3
        ('CI_000247','LIFESTYLE'), -- GB009-S02-I04 GB009/Kidney-Safe Diet/I4
        ('CI_000248','LIFESTYLE'), -- GB009-S02-I05 GB009/Kidney-Safe Diet/I5
        ('CI_000249','MEDICATION_ADHERENCE'), -- GB009-S03-I01 GB009/Medication Safety/I1
        ('CI_000250','MEDICATION_ADHERENCE'), -- GB009-S03-I02 GB009/Medication Safety/I2
        ('CI_000251','MEDICATION_ADHERENCE'), -- GB009-S03-I03 GB009/Medication Safety/I3
        ('CI_000252','MEDICATION_ADHERENCE'), -- GB009-S03-I04 GB009/Medication Safety/I4
        ('CI_000257','DANGER_SIGN'), -- GB009-S05-I01 GB009/Danger Signs/I1
        ('CI_000258','DANGER_SIGN'), -- GB009-S05-I02 GB009/Danger Signs/I2
        ('CI_000259','DANGER_SIGN'), -- GB009-S05-I03 GB009/Danger Signs/I3
        ('CI_000260','DANGER_SIGN'), -- GB009-S05-I04 GB009/Danger Signs/I4
        ('CI_000261','DANGER_SIGN'), -- GB009-S05-I05 GB009/Danger Signs/I5
        ('CI_000262','REFERRAL_CRITERIA'), -- GB009-S06-I01 GB009/Referral Criteria/I1
        ('CI_000263','REFERRAL_CRITERIA'), -- GB009-S06-I02 GB009/Referral Criteria/I2
        ('CI_000264','REFERRAL_CRITERIA'), -- GB009-S06-I03 GB009/Referral Criteria/I3
        ('CI_000265','REFERRAL_CRITERIA'), -- GB009-S06-I04 GB009/Referral Criteria/I4
        ('CI_000275','MEDICATION_ADHERENCE'), -- GB010-S02-I01 GB010/Treatment Adherence/I1
        ('CI_000276','MEDICATION_ADHERENCE'), -- GB010-S02-I02 GB010/Treatment Adherence/I2
        ('CI_000277','MEDICATION_ADHERENCE'), -- GB010-S02-I03 GB010/Treatment Adherence/I3
        ('CI_000278','MEDICATION_ADHERENCE'), -- GB010-S02-I04 GB010/Treatment Adherence/I4
        ('CI_000279','MEDICATION_ADHERENCE'), -- GB010-S02-I05 GB010/Treatment Adherence/I5
        ('CI_000284','LIFESTYLE'), -- GB010-S04-I01 GB010/Healthy Lifestyle/I1
        ('CI_000285','LIFESTYLE'), -- GB010-S04-I02 GB010/Healthy Lifestyle/I2
        ('CI_000286','LIFESTYLE'), -- GB010-S04-I03 GB010/Healthy Lifestyle/I3
        ('CI_000287','LIFESTYLE'), -- GB010-S04-I04 GB010/Healthy Lifestyle/I4
        ('CI_000288','DANGER_SIGN'), -- GB010-S05-I01 GB010/Danger Signs/I1
        ('CI_000289','DANGER_SIGN'), -- GB010-S05-I02 GB010/Danger Signs/I2
        ('CI_000290','DANGER_SIGN'), -- GB010-S05-I03 GB010/Danger Signs/I3
        ('CI_000291','DANGER_SIGN'), -- GB010-S05-I04 GB010/Danger Signs/I4
        ('CI_000292','DANGER_SIGN'), -- GB010-S05-I05 GB010/Danger Signs/I5
        ('CI_000293','REFERRAL_CRITERIA'), -- GB010-S06-I01 GB010/Referral Criteria/I1
        ('CI_000294','REFERRAL_CRITERIA'), -- GB010-S06-I02 GB010/Referral Criteria/I2
        ('CI_000295','REFERRAL_CRITERIA'), -- GB010-S06-I03 GB010/Referral Criteria/I3
        ('CI_000296','REFERRAL_CRITERIA'), -- GB010-S06-I04 GB010/Referral Criteria/I4
        ('CI_000297','REFERRAL_CRITERIA'), -- GB010-S06-I05 GB010/Referral Criteria/I5
        ('CI_000319','DANGER_SIGN'), -- GB011-S05-I01 GB011/Withdrawal Danger Signs/I1
        ('CI_000320','DANGER_SIGN'), -- GB011-S05-I02 GB011/Withdrawal Danger Signs/I2
        ('CI_000321','DANGER_SIGN'), -- GB011-S05-I03 GB011/Withdrawal Danger Signs/I3
        ('CI_000322','DANGER_SIGN'), -- GB011-S05-I04 GB011/Withdrawal Danger Signs/I4
        ('CI_000323','REFERRAL_CRITERIA'), -- GB011-S06-I01 GB011/Referral Criteria/I1
        ('CI_000324','REFERRAL_CRITERIA'), -- GB011-S06-I02 GB011/Referral Criteria/I2
        ('CI_000325','REFERRAL_CRITERIA'), -- GB011-S06-I03 GB011/Referral Criteria/I3
        ('CI_000326','REFERRAL_CRITERIA'), -- GB011-S06-I04 GB011/Referral Criteria/I4
        ('CI_000365','LIFESTYLE'), -- GB013-S04-I01 GB013/Nutrition/I1
        ('CI_000366','LIFESTYLE'), -- GB013-S04-I02 GB013/Nutrition/I2
        ('CI_000367','LIFESTYLE'), -- GB013-S04-I03 GB013/Nutrition/I3
        ('CI_000368','LIFESTYLE'), -- GB013-S04-I04 GB013/Nutrition/I4
        ('CI_000369','LIFESTYLE'), -- GB013-S04-I05 GB013/Nutrition/I5
        ('CI_000374','DANGER_SIGN'), -- GB013-S06-I01 GB013/Danger Signs/I1
        ('CI_000375','DANGER_SIGN'), -- GB013-S06-I02 GB013/Danger Signs/I2
        ('CI_000376','DANGER_SIGN'), -- GB013-S06-I03 GB013/Danger Signs/I3
        ('CI_000377','DANGER_SIGN'), -- GB013-S06-I04 GB013/Danger Signs/I4
        ('CI_000378','DANGER_SIGN'), -- GB013-S06-I05 GB013/Danger Signs/I5
        ('CI_000379','REFERRAL_CRITERIA'), -- GB013-S07-I01 GB013/Referral Criteria/I1
        ('CI_000380','REFERRAL_CRITERIA'), -- GB013-S07-I02 GB013/Referral Criteria/I2
        ('CI_000381','REFERRAL_CRITERIA'), -- GB013-S07-I03 GB013/Referral Criteria/I3
        ('CI_000382','REFERRAL_CRITERIA'), -- GB013-S07-I04 GB013/Referral Criteria/I4
        ('CI_000404','REFERRAL_CRITERIA'), -- GB014-S05-I01 GB014/Referral for Complex Queries/I1
        ('CI_000405','REFERRAL_CRITERIA'), -- GB014-S05-I02 GB014/Referral for Complex Queries/I2
        ('CI_000406','REFERRAL_CRITERIA')  -- GB014-S05-I03 GB014/Referral for Complex Queries/I3
       ) AS m(item_key, cat)
WHERE  ci.item_key = m.item_key
  AND  ci.risk_category IS NULL;

-- C. Everything still unauthored is explicitly NONE.
UPDATE public.counselling_items
SET risk_category = 'NONE'
WHERE risk_category IS NULL
  AND item_key IS NOT NULL;

-- D. Baseline trigger for BOOLEAN risk-bearing items: checked = YES = present.
UPDATE public.counselling_items
SET risk_trigger_values = '["YES"]'::jsonb
WHERE risk_trigger_values IS NULL
  AND response_type = 'BOOLEAN'
  AND risk_category IS NOT NULL
  AND risk_category <> 'NONE';

-- E. Keep deprecated legacy category in sync for one-release dual-read.
UPDATE public.counselling_items
SET category = NULLIF(risk_category, 'NONE')
WHERE category IS DISTINCT FROM NULLIF(risk_category, 'NONE');
