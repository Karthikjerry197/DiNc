import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { ClinicalAlert, AlertWithCitizen } from './cdse.types';

/**
 * Explicit curated risk-category mapping for the seeded NHM counselling items,
 * keyed by the permanent authored business identity key (item_key, CI_XXXXXX)
 * — NOT by wording, section, guidebook, display order, or risk category.
 * item_key is authored in the item seed and immutable, so an item's clinical
 * meaning is preserved across edits and reordering. Unlisted items default to NONE.
 * Consumed once by seedCuratedMetadata(). Kept identical to the canonical list
 * in scripts/milestone25a_consultation_responses.sql.
 */
const EXPLICIT_RISK_CATEGORY_MAP = `
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
        ('CI_000406','REFERRAL_CRITERIA')  -- GB014-S05-I03 GB014/Referral for Complex Queries/I3`;

/**
 * CDSE repository: schema migrations and all DB operations for risk
 * classification and clinical alerts.
 *
 * Migrations run on module init — idempotent via IF NOT EXISTS / IF EXISTS guards.
 */
@Injectable()
export class CdseRepository implements OnModuleInit {
  private readonly logger = new Logger(CdseRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.migrate();
    } catch (err) {
      this.logger.error('CDSE migration failed', (err as Error).message);
    }
  }

  // ── Schema migrations (Milestone 25A) ───────────────────────────────────────
  //
  // Mirrors scripts/milestone25a_consultation_responses.sql. All statements are
  // idempotent (IF NOT EXISTS / IS NULL guards) so startup never overwrites data.

  private async migrate(): Promise<void> {
    await this.migrateCounsellingItemMetadata();
    await this.migrateClinicalAlerts();
    await this.migrateConsultationResponses();
    await this.seedCuratedMetadata();
    await this.dropLegacyItemCode();
    this.logger.log('CDSE schema migrations complete (Milestone 25A)');
  }

  /**
   * Milestone 25A cleanup — drop the deprecated `item_code` column and its index.
   *
   * item_code was the order-derived structural identifier
   * ('<guidebook>-S<sectionOrder>-I<itemOrder>'). It has been fully superseded by
   * the permanent authored business identity key `item_key` (CI_XXXXXX), which is
   * now the ONLY permanent business identifier for counselling items. Nothing in
   * the codebase references item_code any longer.
   *
   * Idempotent: DROP INDEX / DROP COLUMN IF EXISTS make this safe to re-run and a
   * no-op on databases that never had the column.
   */
  private async dropLegacyItemCode(): Promise<void> {
    // Drop the associated unique index first (DROP COLUMN would cascade it, but
    // being explicit documents intent and leaves no orphaned index if the column
    // was already removed by an earlier run).
    await this.db.query(`DROP INDEX IF EXISTS public.idx_counselling_items_code`);
    await this.db.query(`
      ALTER TABLE public.counselling_items
        DROP COLUMN IF EXISTS item_code
    `);
  }

  /**
   * counselling_items now OWNS its clinical metadata as explicit columns.
   * The old runtime section-name inference is removed (see seedCuratedMetadata):
   * risk meaning is no longer derived from section names at query time.
   *
   * Legacy `category` is retained (deprecated) for one release of dual-read
   * backward compatibility; it is kept in sync with `risk_category` by the seed.
   */
  private async migrateCounsellingItemMetadata(): Promise<void> {
    // Legacy column — deprecated, kept one release for dual-read compatibility.
    await this.db.query(`
      ALTER TABLE public.counselling_items
        ADD COLUMN IF NOT EXISTS category VARCHAR(25)
          CHECK (category IN ('DANGER_SIGN','REFERRAL_CRITERIA','MEDICATION_ADHERENCE','LIFESTYLE'))
    `);

    // The permanent business identity key (item_key) is authored inline in the
    // counselling item seed (ConsultationRepository.migrateCounsellingContent,
    // Milestone 16E) and its column + unique index are created there. CDSE only
    // READS item_key to attach clinical metadata; it never derives, generates, or
    // backfills an identifier. See EXPLICIT_RISK_CATEGORY_MAP.

    // How the question is answered by the worker.
    await this.db.query(`
      ALTER TABLE public.counselling_items
        ADD COLUMN IF NOT EXISTS response_type VARCHAR(20) NOT NULL DEFAULT 'BOOLEAN'
          CHECK (response_type IN ('BOOLEAN','YES_NO_UNKNOWN','CHOICE','NUMBER','TEXT'))
    `);

    // Owned clinical risk category. NULL = not yet authored (treated as NONE by
    // the seed, which sets an explicit value). After seeding, values are
    // item-owned and admin-editable; the seed never overwrites a set value.
    await this.db.query(`
      ALTER TABLE public.counselling_items
        ADD COLUMN IF NOT EXISTS risk_category VARCHAR(25)
          CHECK (risk_category IN ('NONE','DANGER_SIGN','REFERRAL_CRITERIA','MEDICATION_ADHERENCE','LIFESTYLE'))
    `);

    // Allowed answer values for CHOICE / YES_NO_UNKNOWN (JSON array). NULL for
    // BOOLEAN / NUMBER / TEXT.
    await this.db.query(`
      ALTER TABLE public.counselling_items
        ADD COLUMN IF NOT EXISTS response_options JSONB
    `);

    // Answer values that trigger CDSE risk (JSON array). NULL / [] = never
    // triggers. NOT_ASSESSED can never appear here, so it can never trigger.
    await this.db.query(`
      ALTER TABLE public.counselling_items
        ADD COLUMN IF NOT EXISTS risk_trigger_values JSONB
    `);
  }

  /**
   * clinical_alerts: unchanged base table plus two Milestone 25A columns —
   * a link to the originating consultation and the exact trigger reasons.
   */
  private async migrateClinicalAlerts(): Promise<void> {
    await this.db.query(`
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
      )
    `);

    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_clinical_alerts_citizen_status
        ON public.clinical_alerts(citizen_id, status)
    `);

    // Link the alert to the consultation (outcome_record) that produced it.
    await this.db.query(`
      ALTER TABLE public.clinical_alerts
        ADD COLUMN IF NOT EXISTS outcome_record_id UUID
          REFERENCES public.outcome_records(id) ON DELETE SET NULL
    `);

    // Exact counselling questions that produced the classification (JSON array
    // of { itemId, question, category, responseValue }).
    await this.db.query(`
      ALTER TABLE public.clinical_alerts
        ADD COLUMN IF NOT EXISTS trigger_reasons JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  /**
   * consultation_responses — the new single source of truth. Exactly one row
   * per counselling question DISPLAYED during a consultation (including an
   * explicit NOT_ASSESSED). Snapshots question_text / response_type /
   * response_options / risk_category so a historical consultation stays fully
   * reproducible even if the counselling item's metadata is later edited.
   *
   * response_status:
   *   ANSWERED       — the worker recorded a value.
   *   NOT_ASSESSED   — displayed but the worker did not answer.
   *   NOT_PRESENTED  — reserved for future conditional questionnaires (a
   *                    question skipped by branching logic yet still recorded).
   */
  private async migrateConsultationResponses(): Promise<void> {
    await this.db.query(`
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
      )
    `);

    // Column upgrades — CREATE TABLE IF NOT EXISTS never alters a pre-existing
    // table, so add any column an earlier partial version of this table may be
    // missing (idempotent). response_options in particular was added after the
    // table's first creation on some databases.
    await this.db.query(`
      ALTER TABLE public.consultation_responses
        ADD COLUMN IF NOT EXISTS response_options JSONB
    `);
    await this.db.query(`
      ALTER TABLE public.consultation_responses
        ADD COLUMN IF NOT EXISTS risk_category VARCHAR(25)
    `);
    await this.db.query(`
      ALTER TABLE public.consultation_responses
        ADD COLUMN IF NOT EXISTS triggered_risk BOOLEAN NOT NULL DEFAULT false
    `);
    await this.db.query(`
      ALTER TABLE public.consultation_responses
        ADD COLUMN IF NOT EXISTS recorded_by TEXT
    `);

    // One response per question per consultation.
    await this.db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_responses_record_item
        ON public.consultation_responses(outcome_record_id, counselling_item_id)
    `);

    // Population-health / patient history reads.
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_responses_citizen
        ON public.consultation_responses(citizen_id, created_at DESC)
    `);

    // Per-question analytics.
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_responses_item
        ON public.consultation_responses(counselling_item_id)
    `);

    // Activity-scoped lookups.
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_responses_worklist
        ON public.consultation_responses(worklist_item_id)
    `);
  }

  /**
   * One-time curated metadata seed. Risk categories come from an EXPLICIT
   * mapping keyed on the permanent authored item_key (CI_XXXXXX) — there is NO
   * section-name inference and NO dependency on question wording, section,
   * guidebook, display order, or risk category anywhere in the system.
   * Every step is idempotent and only fills unauthored values, so a future
   * Administration UI can edit the stored metadata and startup will never
   * overwrite those edits.
   */
  private async seedCuratedMetadata(): Promise<void> {
    // A. Ordering guard. item_key is authored (and its column created) by the
    //    counselling item seed (16E). If that has not run yet this cycle (the
    //    column is absent or unpopulated) skip, so we never prematurely default
    //    categories to NONE (steps B/C only ever fill NULLs, once). Checked in
    //    two steps: confirm the column exists (never throws) before referencing
    //    it, so this is safe on a fresh database and independent of the module
    //    init order between Consultation and CDSE.
    const hasColumn = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'counselling_items'
           AND column_name = 'item_key'
       ) AS exists`,
    );
    if (!hasColumn.rows[0]?.exists) {
      this.logger.warn('item_key column not present yet; skipping curated metadata seed this cycle');
      return;
    }
    const keyed = await this.db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM public.counselling_items WHERE item_key IS NOT NULL`,
    );
    if (Number(keyed.rows[0]?.n ?? 0) === 0) {
      this.logger.warn('item_key not yet populated; skipping curated metadata seed this cycle');
      return;
    }

    // B. Explicit curated risk categories, keyed by the permanent item_key.
    //    Items not listed here are non-clinical and default to NONE in step C.
    await this.db.query(`
      UPDATE public.counselling_items ci
      SET    risk_category = m.cat
      FROM   (VALUES
${EXPLICIT_RISK_CATEGORY_MAP}
      ) AS m(item_key, cat)
      WHERE  ci.item_key = m.item_key
        AND  ci.risk_category IS NULL
    `);

    // C. Everything still unauthored is explicitly NONE.
    await this.db.query(`
      UPDATE public.counselling_items
      SET risk_category = 'NONE'
      WHERE risk_category IS NULL
        AND item_key IS NOT NULL
    `);

    // D. Baseline trigger for BOOLEAN risk-bearing items: a checked box means
    //    the risk condition is present (answer = YES).
    await this.db.query(`
      UPDATE public.counselling_items
      SET risk_trigger_values = '["YES"]'::jsonb
      WHERE risk_trigger_values IS NULL
        AND response_type = 'BOOLEAN'
        AND risk_category IS NOT NULL
        AND risk_category <> 'NONE'
    `);

    // E. Keep the deprecated legacy `category` column in sync so the existing
    //    dual-read classification path keeps working for one release.
    await this.db.query(`
      UPDATE public.counselling_items
      SET category = NULLIF(risk_category, 'NONE')
      WHERE category IS DISTINCT FROM NULLIF(risk_category, 'NONE')
    `);
  }

  // ── Item category lookups ───────────────────────────────────────────────────

  async getItemCategories(itemIds: string[]): Promise<Map<string, string>> {
    if (itemIds.length === 0) return new Map();
    const res = await this.db.query<{ id: string; category: string }>(
      `SELECT id, category
       FROM public.counselling_items
       WHERE id = ANY($1) AND category IS NOT NULL`,
      [itemIds],
    );
    return new Map(res.rows.map((r) => [r.id, r.category]));
  }

  // ── Activity context lookup ─────────────────────────────────────────────────

  async getActivityInfo(
    activityId: string,
  ): Promise<{ citizenId: string; disease: string | null } | null> {
    const res = await this.db.query<{ citizen_id: string; disease: string | null }>(
      `SELECT e.citizen_id, d.name AS disease
       FROM public.worklist_items w
       JOIN public.enrollments e ON e.id = w.enrollment_id
       LEFT JOIN public.diseases d ON d.id = e.disease_id
       WHERE w.id = $1
       LIMIT 1`,
      [activityId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return { citizenId: row.citizen_id, disease: row.disease };
  }

  // ── Alert persistence ───────────────────────────────────────────────────────

  async createAlert(
    citizenId: string,
    activityId: string,
    disease: string | null,
    riskLevel: 'MODERATE' | 'SEVERE',
  ): Promise<ClinicalAlert> {
    const res = await this.db.query<{
      id: string;
      citizen_id: string;
      activity_id: string | null;
      disease: string | null;
      risk_level: string;
      status: string;
      triggered_at: Date;
      resolved_at: Date | null;
    }>(
      `INSERT INTO public.clinical_alerts
         (citizen_id, activity_id, disease, risk_level)
       VALUES ($1, $2, $3, $4)
       RETURNING id, citizen_id, activity_id, disease, risk_level, status,
                 triggered_at, resolved_at`,
      [citizenId, activityId, disease, riskLevel],
    );
    return this.mapAlert(res.rows[0]);
  }

  async resolveAlerts(
    citizenId: string,
    disease: string | null,
    resolvedBy?: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE public.clinical_alerts
       SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = $3
       WHERE citizen_id = $1
         AND status = 'ACTIVE'
         AND ($2::text IS NULL OR disease = $2)`,
      [citizenId, disease, resolvedBy ?? 'system'],
    );
  }

  // ── Alert reads ─────────────────────────────────────────────────────────────

  async getActiveAlerts(citizenId: string): Promise<ClinicalAlert[]> {
    const res = await this.db.query<{
      id: string;
      citizen_id: string;
      activity_id: string | null;
      disease: string | null;
      risk_level: string;
      status: string;
      triggered_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT id, citizen_id, activity_id, disease, risk_level, status,
              triggered_at, resolved_at
       FROM public.clinical_alerts
       WHERE citizen_id = $1 AND status = 'ACTIVE'
       ORDER BY triggered_at DESC`,
      [citizenId],
    );
    return res.rows.map((r) => this.mapAlert(r));
  }

  async getAllAlerts(citizenId: string): Promise<ClinicalAlert[]> {
    const res = await this.db.query<{
      id: string;
      citizen_id: string;
      activity_id: string | null;
      disease: string | null;
      risk_level: string;
      status: string;
      triggered_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT id, citizen_id, activity_id, disease, risk_level, status,
              triggered_at, resolved_at
       FROM public.clinical_alerts
       WHERE citizen_id = $1
       ORDER BY triggered_at DESC
       LIMIT 20`,
      [citizenId],
    );
    return res.rows.map((r) => this.mapAlert(r));
  }

  async getActiveAlertsForBell(limit = 20): Promise<AlertWithCitizen[]> {
    const res = await this.db.query<{
      id: string;
      citizen_id: string;
      activity_id: string | null;
      disease: string | null;
      risk_level: string;
      status: string;
      triggered_at: Date;
      resolved_at: Date | null;
      citizen_name: string | null;
      uhid: string | null;
    }>(
      `SELECT ca.id, ca.citizen_id, ca.activity_id, ca.disease, ca.risk_level,
              ca.status, ca.triggered_at, ca.resolved_at,
              c.full_name AS citizen_name, c.uhid
       FROM public.clinical_alerts ca
       JOIN public.citizens c ON c.id = ca.citizen_id
       WHERE ca.status = 'ACTIVE'
       ORDER BY ca.triggered_at DESC
       LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      ...this.mapAlert(r),
      citizenName: r.citizen_name,
      uhid: r.uhid,
    }));
  }

  async hasAnyConsultation(citizenId: string): Promise<boolean> {
    const res = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM public.outcome_records orec
         JOIN public.worklist_items w ON w.id = orec.worklist_item_id
         JOIN public.enrollments e ON e.id = w.enrollment_id
         WHERE e.citizen_id = $1
       ) AS exists`,
      [citizenId],
    );
    return res.rows[0]?.exists ?? false;
  }

  // ── Worklist risk enrichment ────────────────────────────────────────────────

  async getRiskMapForCitizens(
    citizenIds: string[],
  ): Promise<Map<string, { riskLevel: string; disease: string | null }>> {
    if (citizenIds.length === 0) return new Map();
    const res = await this.db.query<{
      citizen_id: string;
      risk_level: string;
      disease: string | null;
    }>(
      `SELECT DISTINCT ON (citizen_id) citizen_id, risk_level, disease
       FROM public.clinical_alerts
       WHERE citizen_id = ANY($1) AND status = 'ACTIVE'
       ORDER BY citizen_id, triggered_at DESC`,
      [citizenIds],
    );
    return new Map(res.rows.map((r) => [r.citizen_id, { riskLevel: r.risk_level, disease: r.disease }]));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private mapAlert(row: {
    id: string;
    citizen_id: string;
    activity_id: string | null;
    disease: string | null;
    risk_level: string;
    status: string;
    triggered_at: Date;
    resolved_at: Date | null;
  }): ClinicalAlert {
    return {
      id: row.id,
      citizenId: row.citizen_id,
      activityId: row.activity_id,
      disease: row.disease,
      riskLevel: row.risk_level as 'MODERATE' | 'SEVERE',
      status: row.status as 'ACTIVE' | 'RESOLVED',
      triggeredAt: row.triggered_at.toISOString(),
      resolvedAt: row.resolved_at?.toISOString() ?? null,
    };
  }
}
