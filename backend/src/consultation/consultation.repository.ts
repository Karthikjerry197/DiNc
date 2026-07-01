import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ClinicalFieldDef,
  ClinicalJourneyEntryDto,
  ConsultationHistoryEntryDto,
  ConsultationNoteDto,
  ConsultationResponseInput,
  CounsellingSectionDto,
} from './consultation.types';

/** Raw context row for a teleconsultation, assembled in one join. */
export interface ConsultationContextRow {
  activity_id: string;
  activity_status: string;
  priority: string;
  due_date: Date | null;
  event_id: string | null;
  event_name: string | null;
  sequence: number | null;
  expected_days: number | null;
  outcome_template_id: string | null;
  disease_id: string | null;
  disease_name: string | null;
  program_id: string | null;
  program_name: string | null;
  program_code: string | null;
  enrollment_id: string;
  enrollment_status: string | null;
  assigned_worker: string | null;
  current_event_id: string | null;
  citizen_id: string | null;
  uhid: string | null;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
}

export interface TimelineRow {
  kind: string;
  id: string;
  title: string;
  program: string | null;
  status: string;
  date: Date | null;
  outcome: string | null;
  priority: string | null;
}

interface NoteRow {
  id: string;
  worklist_item_id: string;
  outcome_record_id: string | null;
  generated_note: string;
  note_version: number;
  status: string;
  recorded_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Data-access layer for the Teleconsultation / Clinical Activity engine. The ONLY
 * place holding SQL for this feature. All statements are parameterised.
 *
 * On startup: creates public.consultation_notes and its two indexes if they do not
 * exist yet. Uses CREATE TABLE/INDEX IF NOT EXISTS so the migration is fully
 * idempotent and never overwrites existing data.
 */
@Injectable()
export class ConsultationRepository implements OnModuleInit {
  private readonly logger = new Logger(ConsultationRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.migrateConsultationNotes();
    await this.migrateCounsellingTables();
    await this.migrateProtocolSchema();
    await this.migrateCounsellingContent();
  }

  /**
   * Idempotent DDL migration for the consultation_notes table.
   * Mirrors scripts/milestone16a_consultation_foundation.sql section 3.
   * Safe to run on every startup — all three statements use IF NOT EXISTS.
   */
  private async migrateConsultationNotes(): Promise<void> {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS public.consultation_notes (
          id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          worklist_item_id  UUID        NOT NULL
                              REFERENCES public.worklist_items(id) ON DELETE CASCADE,
          outcome_record_id UUID
                              REFERENCES public.outcome_records(id) ON DELETE SET NULL,
          generated_note    TEXT        NOT NULL,
          note_version      INT         NOT NULL DEFAULT 1,
          status            VARCHAR(10) NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT', 'FINAL')),
          recorded_by       TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await this.db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_notes_draft
          ON public.consultation_notes(worklist_item_id)
          WHERE status = 'DRAFT'
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_consultation_notes_worklist
          ON public.consultation_notes(worklist_item_id, created_at DESC)
      `);

      this.logger.log('consultation_notes table ready.');
    } catch (error) {
      this.logger.error(
        `consultation_notes migration failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Creates counselling_sections and counselling_items tables if they do not
   * exist. Both tables are fully data-driven: section names and item content are
   * managed in the database so no frontend code change is required when adding
   * new programmes or disease-specific content.
   */
  private async migrateCounsellingTables(): Promise<void> {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS public.counselling_sections (
          id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
          guidebook_id UUID    NOT NULL REFERENCES public.guidebooks(id) ON DELETE CASCADE,
          name         TEXT    NOT NULL,
          sort_order   INT     NOT NULL DEFAULT 0,
          is_active    BOOLEAN NOT NULL DEFAULT true
        )
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_counselling_sections_guidebook
          ON public.counselling_sections(guidebook_id, sort_order)
      `);
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS public.counselling_items (
          id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
          section_id UUID    NOT NULL
                       REFERENCES public.counselling_sections(id) ON DELETE CASCADE,
          body       TEXT    NOT NULL,
          note_text  TEXT,
          sort_order INT     NOT NULL DEFAULT 0,
          is_active  BOOLEAN NOT NULL DEFAULT true
        )
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_counselling_items_section
          ON public.counselling_items(section_id, sort_order)
      `);
      this.logger.log('Counselling tables ready.');
    } catch (error) {
      this.logger.error(
        `Counselling tables migration failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Milestone 16E — Normalized Clinical Counselling Engine schema.
   *
   * Introduces counselling_protocols as the bridge between guidebooks and their
   * counselling sections. The new hierarchy is:
   *   Guidebook → Counselling Protocol → Counselling Sections → Counselling Items
   *
   * Unique constraints enable ON CONFLICT DO NOTHING in the seed migration so
   * admin-edited content is never overwritten. All DDL uses IF NOT EXISTS.
   */
  private async migrateProtocolSchema(): Promise<void> {
    try {
      // Table: counselling_protocols
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS public.counselling_protocols (
          id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          guidebook_id UUID        NOT NULL REFERENCES public.guidebooks(id) ON DELETE CASCADE,
          name         TEXT        NOT NULL,
          description  TEXT,
          sort_order   INT         NOT NULL DEFAULT 0,
          is_active    BOOLEAN     NOT NULL DEFAULT true,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // Unique: one protocol with the same name per guidebook
      await this.db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_counselling_protocols_name
          ON public.counselling_protocols(guidebook_id, name)
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_counselling_protocols_guidebook
          ON public.counselling_protocols(guidebook_id, sort_order)
          WHERE is_active = true
      `);

      // Link counselling_sections to a protocol (nullable for backward compat)
      await this.db.query(`
        ALTER TABLE public.counselling_sections
          ADD COLUMN IF NOT EXISTS protocol_id UUID
            REFERENCES public.counselling_protocols(id) ON DELETE CASCADE
      `);
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_counselling_sections_protocol
          ON public.counselling_sections(protocol_id, sort_order)
          WHERE protocol_id IS NOT NULL
      `);
      // Unique: one section with the same name per protocol (enables DO NOTHING seed)
      await this.db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_counselling_sections_protocol_name
          ON public.counselling_sections(protocol_id, name)
          WHERE protocol_id IS NOT NULL
      `);

      // Unique: one item with the same body text per section (enables DO NOTHING seed)
      await this.db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_counselling_items_section_body
          ON public.counselling_items(section_id, body)
      `);

      // Milestone 25A — permanent authored business identity key (item_key).
      // Pure identity: authored once in the item seed as CI_XXXXXX and immutable
      // for the item's lifetime. NOT derived from wording, section, guidebook,
      // display order, or risk category. Metadata mapping (CDSE) and future
      // integrations reference item_key, never the per-database UUID.
      await this.db.query(`
        ALTER TABLE public.counselling_items
          ADD COLUMN IF NOT EXISTS item_key VARCHAR(20)
      `);
      await this.db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_counselling_items_key
          ON public.counselling_items(item_key)
          WHERE item_key IS NOT NULL
      `);

      this.logger.log('Counselling protocol schema ready (16E).');
    } catch (error) {
      this.logger.error(`Protocol schema migration failed: ${(error as Error).message}`);
    }
  }

  /**
   * Milestone 16E — Rich clinical counselling seed.
   *
   * Seeds one counselling_protocol per guidebook (15 total), then seeds
   * clinically meaningful sections (Lifestyle, Nutrition, Medication, Danger
   * Signs, etc.) and items based on NHM standard protocols for each programme.
   *
   * The 16D generic sections (Assessment Checklist / Referral Guidance) are
   * deactivated once a protocol is available so the wizard shows rich content.
   *
   * All three INSERTs use ON CONFLICT DO NOTHING, making this fully idempotent:
   * re-running never overwrites admin-edited content.
   */
  private async migrateCounsellingContent(): Promise<void> {
    try {
      // ── 1. One protocol per guidebook ────────────────────────────────────────
      await this.db.query(`
        INSERT INTO public.counselling_protocols (guidebook_id, name, sort_order)
        SELECT g.id, v.pname, 0
        FROM (VALUES
          ('GB001'::text, 'Eligible Couple Counselling Protocol'),
          ('GB002',       'ANC First Trimester Protocol'),
          ('GB003',       'Postnatal Care Counselling Protocol'),
          ('GB004',       'Newborn and Infant Counselling Protocol'),
          ('GB005',       'TB Counselling and DOTS Protocol'),
          ('GB006',       'Malaria Prevention and Treatment Protocol'),
          ('GB007',       'Hypertension Counselling Protocol'),
          ('GB008',       'Diabetes Counselling Protocol'),
          ('GB009',       'CKD Management Counselling Protocol'),
          ('GB010',       'Mental Health Counselling Protocol'),
          ('GB011',       'Substance Use De-addiction Protocol'),
          ('GB012',       'Emergency First Aid Counselling Protocol'),
          ('GB013',       'Elderly Care Counselling Protocol'),
          ('GB014',       'Government Schemes Counselling Protocol'),
          ('GB015',       'Clinical FAQ Reference Protocol')
        ) AS v(code, pname)
        JOIN public.guidebooks g ON g.code = v.code AND g.is_active = true
        ON CONFLICT (guidebook_id, name) DO NOTHING
      `);

      // ── 2. Deactivate legacy JSONB-sourced generic sections ─────────────────
      // Sections named 'Assessment Checklist' / 'Referral Guidance' were seeded
      // in 16D from sparse guidebook_sections JSONB. Now that rich protocol-based
      // sections exist, retire the generic ones for guidebooks that have a protocol.
      await this.db.query(`
        UPDATE public.counselling_sections
        SET    is_active = false
        WHERE  protocol_id IS NULL
          AND  name IN ('Assessment Checklist', 'Referral Guidance')
          AND  guidebook_id IN (
                 SELECT guidebook_id FROM public.counselling_protocols WHERE is_active = true
               )
          AND  is_active = true
      `);

      // ── 3. Seed sections (linked to the first active protocol via LATERAL) ──
      await this.db.query(`
        INSERT INTO public.counselling_sections (protocol_id, guidebook_id, name, sort_order)
        SELECT cp.id, cp.guidebook_id, v.sname, v.sorder
        FROM (VALUES
          ('GB001'::text,'Preconception Care'::text,          1::int),
          ('GB001',      'Family Planning',                   2),
          ('GB001',      'Reproductive Health',               3),
          ('GB001',      'Nutrition Before Pregnancy',        4),
          ('GB001',      'Referral Criteria',                 5),
          ('GB001',      'Follow-up',                         6),
          ('GB002',      'Nutrition and Supplements',         1),
          ('GB002',      'Rest and Activity',                 2),
          ('GB002',      'Antenatal Visits',                  3),
          ('GB002',      'Vaccinations',                      4),
          ('GB002',      'Danger Signs',                      5),
          ('GB002',      'Birth Preparedness',                6),
          ('GB002',      'Follow-up',                         7),
          ('GB003',      'Breastfeeding',                     1),
          ('GB003',      'Maternal Care',                     2),
          ('GB003',      'Newborn Care',                      3),
          ('GB003',      'Family Planning',                   4),
          ('GB003',      'Danger Signs - Mother',             5),
          ('GB003',      'Danger Signs - Baby',               6),
          ('GB003',      'Follow-up',                         7),
          ('GB004',      'Infant Feeding',                    1),
          ('GB004',      'Immunisation Schedule',             2),
          ('GB004',      'Growth Monitoring',                 3),
          ('GB004',      'Danger Signs',                      4),
          ('GB004',      'WASH and Hygiene',                  5),
          ('GB004',      'Caregiver Education',               6),
          ('GB004',      'Follow-up',                         7),
          ('GB005',      'Treatment Adherence',               1),
          ('GB005',      'Cough Hygiene',                     2),
          ('GB005',      'Nutrition During TB',               3),
          ('GB005',      'Side Effects to Report',            4),
          ('GB005',      'Contact Tracing',                   5),
          ('GB005',      'Referral Criteria',                 6),
          ('GB005',      'Follow-up',                         7),
          ('GB006',      'Prevention',                        1),
          ('GB006',      'Testing and Diagnosis',             2),
          ('GB006',      'Treatment',                         3),
          ('GB006',      'Danger Signs',                      4),
          ('GB006',      'Special Populations',               5),
          ('GB006',      'Follow-up',                         6),
          ('GB007',      'Lifestyle Modification',            1),
          ('GB007',      'Diet and Nutrition',                2),
          ('GB007',      'Medication Adherence',              3),
          ('GB007',      'Blood Pressure Monitoring',         4),
          ('GB007',      'Danger Signs',                      5),
          ('GB007',      'Referral Criteria',                 6),
          ('GB007',      'Follow-up',                         7),
          ('GB008',      'Healthy Lifestyle',                 1),
          ('GB008',      'Diet and Nutrition',                2),
          ('GB008',      'Medication Adherence',              3),
          ('GB008',      'Blood Sugar Monitoring',            4),
          ('GB008',      'Foot Care',                         5),
          ('GB008',      'Danger Signs',                      6),
          ('GB008',      'Complications Screening',           7),
          ('GB008',      'Follow-up',                         8),
          ('GB009',      'Blood Pressure Control',            1),
          ('GB009',      'Kidney-Safe Diet',                  2),
          ('GB009',      'Medication Safety',                 3),
          ('GB009',      'Monitoring Tests',                  4),
          ('GB009',      'Danger Signs',                      5),
          ('GB009',      'Referral Criteria',                 6),
          ('GB009',      'Follow-up',                         7),
          ('GB010',      'Emotional Wellbeing',               1),
          ('GB010',      'Treatment Adherence',               2),
          ('GB010',      'Family and Caregiver Support',      3),
          ('GB010',      'Healthy Lifestyle',                 4),
          ('GB010',      'Danger Signs',                      5),
          ('GB010',      'Referral Criteria',                 6),
          ('GB010',      'Follow-up',                         7),
          ('GB011',      'Motivation and Readiness',          1),
          ('GB011',      'Quitting Strategies',               2),
          ('GB011',      'Medical Treatment',                 3),
          ('GB011',      'Family Counselling',                4),
          ('GB011',      'Withdrawal Danger Signs',           5),
          ('GB011',      'Referral Criteria',                 6),
          ('GB011',      'Follow-up',                         7),
          ('GB012',      'Primary Assessment',                1),
          ('GB012',      'Emergency Responses',               2),
          ('GB012',      'Ambulance Activation',              3),
          ('GB012',      'Stabilisation',                     4),
          ('GB012',      'Documentation',                     5),
          ('GB013',      'Fall Prevention',                   1),
          ('GB013',      'Medication Review',                 2),
          ('GB013',      'Cognitive Health',                  3),
          ('GB013',      'Nutrition',                         4),
          ('GB013',      'Mental Wellbeing',                  5),
          ('GB013',      'Danger Signs',                      6),
          ('GB013',      'Referral Criteria',                 7),
          ('GB013',      'Follow-up',                         8),
          ('GB014',      'Eligibility Assessment',            1),
          ('GB014',      'Scheme Benefits',                   2),
          ('GB014',      'Enrolment Support',                 3),
          ('GB014',      'Utilisation Guidance',              4),
          ('GB014',      'Referral for Complex Queries',      5),
          ('GB014',      'Follow-up',                         6),
          ('GB015',      'Clinical Query Resolution',         1),
          ('GB015',      'Health Myth Correction',            2),
          ('GB015',      'Escalation of Queries',             3),
          ('GB015',      'Follow-up',                         4)
        ) AS v(code, sname, sorder)
        JOIN public.guidebooks g ON g.code = v.code AND g.is_active = true
        JOIN LATERAL (
          SELECT id, guidebook_id FROM public.counselling_protocols
          WHERE  guidebook_id = g.id AND is_active = true
          ORDER  BY sort_order ASC LIMIT 1
        ) cp ON true
        ON CONFLICT DO NOTHING
      `);

      // ── 4. Seed items (CTE resolves section_id by guidebook code + section name) ──
      await this.db.query(`
        WITH sl AS (
          SELECT cs.id AS sid, g.code AS gcode, cs.name AS sname
          FROM   public.counselling_sections cs
          JOIN   public.counselling_protocols cp ON cp.id = cs.protocol_id AND cp.is_active = true
          JOIN   public.guidebooks g ON g.id = cp.guidebook_id
          WHERE  cs.is_active = true
        )
        INSERT INTO public.counselling_items (section_id, body, note_text, sort_order, item_key)
        SELECT sl.sid, v.body, v.body, v.iord, v.item_key
        FROM (VALUES
          -- GB001 Preconception Care
          ('CI_000001'::text,'GB001'::text,'Preconception Care'::text,'Start folic acid 400 mcg daily at least 3 months before planned pregnancy'::text,1::int),
          ('CI_000002','GB001','Preconception Care','Complete vaccinations before pregnancy: Rubella, Hepatitis B, and Td',2),
          ('CI_000003','GB001','Preconception Care','Screen for and control diabetes, hypertension, and thyroid disorders before conception',3),
          ('CI_000004','GB001','Preconception Care','Achieve healthy body weight before becoming pregnant',4),
          ('CI_000005','GB001','Preconception Care','Quit tobacco and alcohol at least 3 months before planned conception',5),
          -- GB001 Family Planning
          ('CI_000006','GB001','Family Planning','Discuss birth spacing of at least 2 years between pregnancies for maternal and child health',1),
          ('CI_000007','GB001','Family Planning','Explain available options: OCP, condom, IUCD, injectable, implant, or sterilisation',2),
          ('CI_000008','GB001','Family Planning','Provide chosen contraceptive method or refer to the family planning clinic',3),
          ('CI_000009','GB001','Family Planning','Ensure partner involvement and informed consent in all family planning decisions',4),
          ('CI_000010','GB001','Family Planning','Counsel on correct and consistent use of chosen contraceptive method',5),
          -- GB001 Reproductive Health
          ('CI_000011','GB001','Reproductive Health','Screen for cervical cancer with VIA test every 3 years for women aged 25 to 65',1),
          ('CI_000012','GB001','Reproductive Health','Perform clinical breast examination and demonstrate breast self-examination technique',2),
          ('CI_000013','GB001','Reproductive Health','Screen for and treat genital tract infections promptly',3),
          ('CI_000014','GB001','Reproductive Health','Counsel to recognise early warning signs of reproductive tract problems',4),
          -- GB001 Nutrition Before Pregnancy
          ('CI_000015','GB001','Nutrition Before Pregnancy','Eat foods rich in folic acid daily: green leafy vegetables, lentils, and fortified cereals',1),
          ('CI_000016','GB001','Nutrition Before Pregnancy','Take iron-rich foods to prevent anaemia before and during pregnancy',2),
          ('CI_000017','GB001','Nutrition Before Pregnancy','Ensure adequate calcium and Vitamin D through diet and daily sun exposure',3),
          ('CI_000018','GB001','Nutrition Before Pregnancy','Maintain healthy weight through balanced diet and regular physical activity',4),
          -- GB001 Referral Criteria
          ('CI_000019','GB001','Referral Criteria','Refer for infertility evaluation if not conceiving after 12 months of trying (6 months if age above 35)',1),
          ('CI_000020','GB001','Referral Criteria','Refer for evaluation if history of 2 or more consecutive pregnancy losses',2),
          ('CI_000021','GB001','Referral Criteria','Refer for preconception counselling for high-risk conditions: epilepsy, heart disease, kidney disease',3),
          ('CI_000022','GB001','Referral Criteria','Refer for genetic counselling if family history of inherited disorders',4),
          -- GB001 Follow-up
          ('CI_000023','GB001','Follow-up','Schedule annual reproductive health check at the health centre or sub-centre',1),
          ('CI_000024','GB001','Follow-up','Contraceptive follow-up as per the chosen method schedule',2),
          ('CI_000025','GB001','Follow-up','Preconception counselling appointment confirmed on the ANC card',3),
          -- GB002 Nutrition and Supplements
          ('CI_000026','GB002','Nutrition and Supplements','Start IFA tablet daily from the first ANC visit — take at night to reduce nausea',1),
          ('CI_000027','GB002','Nutrition and Supplements','Take calcium tablet 500 mg twice daily to support fetal bone development',2),
          ('CI_000028','GB002','Nutrition and Supplements','Eat protein-rich foods at every meal: eggs, milk, pulses, meat, or fish',3),
          ('CI_000029','GB002','Nutrition and Supplements','Increase intake of green leafy vegetables, fruits, and fortified foods',4),
          ('CI_000030','GB002','Nutrition and Supplements','Drink at least 8 to 10 glasses of safe drinking water daily',5),
          -- GB002 Rest and Activity
          ('CI_000031','GB002','Rest and Activity','Get 8 hours of sleep at night and 2 hours of rest during the day',1),
          ('CI_000032','GB002','Rest and Activity','Avoid heavy lifting, strenuous work, and long journeys especially in the first trimester',2),
          ('CI_000033','GB002','Rest and Activity','Light walking for 20 to 30 minutes daily is safe and beneficial',3),
          ('CI_000034','GB002','Rest and Activity','Avoid contact with pesticides, chemicals, smoke, and industrial fumes throughout pregnancy',4),
          -- GB002 Antenatal Visits
          ('CI_000035','GB002','Antenatal Visits','Complete minimum 4 ANC visits: first trimester, 14-16 weeks, 28-32 weeks, and 36 weeks',1),
          ('CI_000036','GB002','Antenatal Visits','Carry the ANC card to every visit and keep it safe at home',2),
          ('CI_000037','GB002','Antenatal Visits','Complete all prescribed investigations: blood group, haemoglobin, blood glucose, and urine test',3),
          ('CI_000038','GB002','Antenatal Visits','Report any new symptoms or concerns at each visit without delay',4),
          -- GB002 Vaccinations
          ('CI_000039','GB002','Vaccinations','Receive Td first dose in the first trimester as per the NHM vaccine schedule',1),
          ('CI_000040','GB002','Vaccinations','Second Td dose to be given 4 weeks after the first dose if not previously vaccinated',2),
          ('CI_000041','GB002','Vaccinations','Report any fever, rash, or unusual reaction after vaccination to the health worker',3),
          -- GB002 Danger Signs
          ('CI_000042','GB002','Danger Signs','Seek emergency care immediately for any vaginal bleeding at any point in pregnancy',1),
          ('CI_000043','GB002','Danger Signs','Seek emergency care immediately for severe headache, blurred vision, or swollen face and hands',2),
          ('CI_000044','GB002','Danger Signs','Seek emergency care immediately for severe abdominal pain or cramps',3),
          ('CI_000045','GB002','Danger Signs','Seek emergency care immediately for high fever with chills or rigors',4),
          ('CI_000046','GB002','Danger Signs','Seek emergency care after 5 months if fetal movements reduce or stop completely',5),
          -- GB002 Birth Preparedness
          ('CI_000047','GB002','Birth Preparedness','Plan for institutional delivery — identify and register at a government hospital or PHC',1),
          ('CI_000048','GB002','Birth Preparedness','Arrange transport in advance and keep emergency contact numbers ready at home',2),
          ('CI_000049','GB002','Birth Preparedness','Enrol under Janani Suraksha Yojana (JSY) to receive the delivery cash incentive',3),
          ('CI_000050','GB002','Birth Preparedness','Keep blood group card, ANC documents, and ID proof ready for the delivery admission',4),
          -- GB002 Follow-up
          ('CI_000051','GB002','Follow-up','Next ANC appointment date confirmed and written on the ANC card',1),
          ('CI_000052','GB002','Follow-up','All pending blood and urine investigations to be completed before the next visit',2),
          ('CI_000053','GB002','Follow-up','Bring ANC card and investigation reports to the next visit without fail',3),
          -- GB003 Breastfeeding
          ('CI_000054','GB003','Breastfeeding','Begin breastfeeding within 30 minutes of delivery — first feed is most critical',1),
          ('CI_000055','GB003','Breastfeeding','Give colostrum — the first thick yellowish milk — it protects the baby from infections',2),
          ('CI_000056','GB003','Breastfeeding','Exclusive breastfeeding for 6 months — give no water, no top feed, no formula',3),
          ('CI_000057','GB003','Breastfeeding','Feed on demand, at least 8 to 12 times every 24 hours including night feeds',4),
          ('CI_000058','GB003','Breastfeeding','Ensure correct latch and positioning to prevent sore nipples and poor milk transfer',5),
          -- GB003 Maternal Care
          ('CI_000059','GB003','Maternal Care','Rest adequately for at least 6 weeks after delivery — avoid heavy household work',1),
          ('CI_000060','GB003','Maternal Care','Continue IFA and calcium tablets for at least 6 months after delivery',2),
          ('CI_000061','GB003','Maternal Care','Keep the perineal area or caesarean wound clean and dry; report any redness or discharge',3),
          ('CI_000062','GB003','Maternal Care','Eat a nutritious diet: protein, iron-rich foods, calcium, and fresh fruits and vegetables',4),
          -- GB003 Newborn Care
          ('CI_000063','GB003','Newborn Care','Keep the newborn warm — skin-to-skin contact is the best method for warmth',1),
          ('CI_000064','GB003','Newborn Care','Do not bathe the newborn for the first 24 to 72 hours after birth',2),
          ('CI_000065','GB003','Newborn Care','Keep the cord clean and dry — do not apply anything to the cord stump',3),
          ('CI_000066','GB003','Newborn Care','Ensure BCG and OPV-0 vaccines are given before discharge from the hospital',4),
          -- GB003 Family Planning
          ('CI_000067','GB003','Family Planning','Discuss postpartum family planning options at the 6-week postnatal visit',1),
          ('CI_000068','GB003','Family Planning','Lactational Amenorrhoea Method (LAM) works for the first 6 months if fully breastfeeding',2),
          ('CI_000069','GB003','Family Planning','Intrauterine device (IUCD) can be inserted within 48 hours or after 6 weeks postpartum',3),
          ('CI_000070','GB003','Family Planning','Plan next pregnancy with a minimum spacing of 2 to 3 years after this delivery',4),
          -- GB003 Danger Signs - Mother
          ('CI_000071','GB003','Danger Signs - Mother','Seek immediate care for heavy vaginal bleeding — soaking more than 1 pad per hour',1),
          ('CI_000072','GB003','Danger Signs - Mother','Seek immediate care for high fever, chills, or foul-smelling vaginal discharge',2),
          ('CI_000073','GB003','Danger Signs - Mother','Seek immediate care for severe headache, swelling of face or hands, or fits',3),
          ('CI_000074','GB003','Danger Signs - Mother','Seek immediate care for breast redness, hard lump, or abscess forming',4),
          ('CI_000075','GB003','Danger Signs - Mother','Report persistent sadness, inability to care for the baby, or thoughts of self-harm',5),
          -- GB003 Danger Signs - Baby
          ('CI_000076','GB003','Danger Signs - Baby','Seek immediate care if baby refuses to feed or is too weak to suck',1),
          ('CI_000077','GB003','Danger Signs - Baby','Seek immediate care if baby has fast breathing, chest in-drawing, or makes grunting sound',2),
          ('CI_000078','GB003','Danger Signs - Baby','Seek immediate care if baby has fever above 37.5 degrees or feels unusually cold to touch',3),
          ('CI_000079','GB003','Danger Signs - Baby','Seek immediate care if baby has convulsions or is unconscious or unresponsive',4),
          ('CI_000080','GB003','Danger Signs - Baby','Seek immediate care if yellow colour appears in eyes or skin in the first 24 hours',5),
          -- GB003 Follow-up
          ('CI_000081','GB003','Follow-up','PNC visit required within 48 hours of returning home from the hospital',1),
          ('CI_000082','GB003','Follow-up','Second PNC visit at 7 days after delivery for mother and baby check',2),
          ('CI_000083','GB003','Follow-up','Third PNC visit at 42 days — confirm vaccine schedule, family planning, and maternal recovery',3),
          -- GB004 Infant Feeding
          ('CI_000084','GB004','Infant Feeding','Exclusive breastfeeding for 6 months — no water, no other food or drink at all',1),
          ('CI_000085','GB004','Infant Feeding','Introduce complementary foods from exactly 6 months: mashed rice, dal, and vegetables',2),
          ('CI_000086','GB004','Infant Feeding','Continue breastfeeding alongside complementary foods until 2 years of age or beyond',3),
          ('CI_000087','GB004','Infant Feeding','Do not give honey, salt, or sugar to infants under 1 year of age',4),
          ('CI_000088','GB004','Infant Feeding','Feed infant 5 to 6 times daily with gradually increasing quantity as baby grows',5),
          -- GB004 Immunisation Schedule
          ('CI_000089','GB004','Immunisation Schedule','Give BCG and OPV-0 at birth before hospital discharge',1),
          ('CI_000090','GB004','Immunisation Schedule','Give Pentavalent-1, OPV-1, IPV-1, and RVV-1 at 6 weeks of age',2),
          ('CI_000091','GB004','Immunisation Schedule','Give Pentavalent-2, OPV-2, and RVV-2 at 10 weeks of age',3),
          ('CI_000092','GB004','Immunisation Schedule','Give Pentavalent-3, OPV-3, IPV-2, and RVV-3 at 14 weeks of age',4),
          ('CI_000093','GB004','Immunisation Schedule','Give MR vaccine at 9 months; DPT Booster and MR-2 at 16 to 24 months',5),
          -- GB004 Growth Monitoring
          ('CI_000094','GB004','Growth Monitoring','Weigh the baby every month at the VHSND or health centre — do not skip',1),
          ('CI_000095','GB004','Growth Monitoring','Track developmental milestones: smile by 2 months, sit by 6 months, walk by 15 months',2),
          ('CI_000096','GB004','Growth Monitoring','Plot weight on the growth chart; report if weight moves into the yellow or red zone',3),
          ('CI_000097','GB004','Growth Monitoring','Refer immediately for SAM evaluation if weight enters the red zone',4),
          -- GB004 Danger Signs
          ('CI_000098','GB004','Danger Signs','Seek immediate care if baby refuses to feed or is feeding very poorly',1),
          ('CI_000099','GB004','Danger Signs','Seek immediate care if baby has fast breathing or chest in-drawing',2),
          ('CI_000100','GB004','Danger Signs','Seek immediate care if baby is cold (below 36°C) or hot (above 38°C) to touch',3),
          ('CI_000101','GB004','Danger Signs','Seek immediate care if baby has convulsions, is limp, or does not respond to touch or sound',4),
          ('CI_000102','GB004','Danger Signs','Seek immediate care if the cord becomes red, swollen, or produces pus or foul smell',5),
          -- GB004 WASH and Hygiene
          ('CI_000103','GB004','WASH and Hygiene','Wash hands thoroughly with soap and water before every feed and after cleaning the baby',1),
          ('CI_000104','GB004','WASH and Hygiene','Use only safe drinking water for preparing complementary food after 6 months',2),
          ('CI_000105','GB004','WASH and Hygiene','Wash all feeding vessels and utensils with soap and hot water and air-dry',3),
          ('CI_000106','GB004','WASH and Hygiene','Keep the baby''s sleeping and play area clean, dry, and free from smoke and animals',4),
          -- GB004 Caregiver Education
          ('CI_000107','GB004','Caregiver Education','Talk, sing, and make eye contact with the baby from birth to support brain development',1),
          ('CI_000108','GB004','Caregiver Education','Skin-to-skin contact promotes bonding and increases breastmilk production',2),
          ('CI_000109','GB004','Caregiver Education','Never leave the baby alone on a raised surface — falls cause serious injuries',3),
          ('CI_000110','GB004','Caregiver Education','Never shake a baby under any circumstances — shaking causes permanent brain damage',4),
          -- GB004 Follow-up
          ('CI_000111','GB004','Follow-up','Monthly weight monitoring at the VHSND or health sub-centre',1),
          ('CI_000112','GB004','Follow-up','Next vaccine date written on the child''s immunisation card and confirmed with caregiver',2),
          ('CI_000113','GB004','Follow-up','Bring the child''s immunisation card and growth chart to every visit',3),
          -- GB005 Treatment Adherence
          ('CI_000114','GB005','Treatment Adherence','Complete the full TB treatment course — minimum 6 months — never stop early even if feeling better',1),
          ('CI_000115','GB005','Treatment Adherence','Take all medicines every day under DOTS supervision — never skip any dose',2),
          ('CI_000116','GB005','Treatment Adherence','Even one missed dose can lead to drug-resistant TB which is much harder to treat',3),
          ('CI_000117','GB005','Treatment Adherence','Contact your ASHA or health worker immediately if you are unable to take medicines for any reason',4),
          ('CI_000118','GB005','Treatment Adherence','Collect your next month''s medicines at least 5 days before your current supply runs out',5),
          -- GB005 Cough Hygiene
          ('CI_000119','GB005','Cough Hygiene','Cover mouth and nose with a cloth or handkerchief when coughing or sneezing — not with hands',1),
          ('CI_000120','GB005','Cough Hygiene','Dispose of sputum safely in a covered container with disinfectant — never spit on the floor',2),
          ('CI_000121','GB005','Cough Hygiene','Keep the home well-ventilated — open windows and doors during the day to allow fresh air in',3),
          ('CI_000122','GB005','Cough Hygiene','Sleep in a separate well-ventilated room for the first 2 weeks of treatment',4),
          ('CI_000123','GB005','Cough Hygiene','Household members should not share towels, bedding, or eating utensils until sputum becomes negative',5),
          -- GB005 Nutrition During TB
          ('CI_000124','GB005','Nutrition During TB','Eat nutritious food at every meal: eggs, meat, fish, lentils, green vegetables, and fruits',1),
          ('CI_000125','GB005','Nutrition During TB','TB treatment and infection can cause weight loss — increase calorie and protein intake',2),
          ('CI_000126','GB005','Nutrition During TB','Avoid alcohol completely during the entire treatment period — alcohol worsens TB outcomes',3),
          ('CI_000127','GB005','Nutrition During TB','Enrol in Nikshay Poshan Yojana to receive monthly nutritional support of rupees 500',4),
          -- GB005 Side Effects to Report
          ('CI_000128','GB005','Side Effects to Report','Stop medicines and seek immediate care if yellow eyes or skin appears — this means liver injury',1),
          ('CI_000129','GB005','Side Effects to Report','Report skin rash or generalised itching to the health worker — may indicate allergic reaction',2),
          ('CI_000130','GB005','Side Effects to Report','Report tingling or numbness in hands or feet — may indicate peripheral nerve involvement',3),
          ('CI_000131','GB005','Side Effects to Report','Report any changes in vision promptly — particularly with ethambutol treatment',4),
          ('CI_000132','GB005','Side Effects to Report','Report persistent nausea or vomiting that prevents taking medicines as prescribed',5),
          -- GB005 Contact Tracing
          ('CI_000133','GB005','Contact Tracing','All household contacts must be screened for TB symptoms at the health centre immediately',1),
          ('CI_000134','GB005','Contact Tracing','Children under 5 who are household contacts must receive preventive therapy (IPT)',2),
          ('CI_000135','GB005','Contact Tracing','Household contacts who are HIV-positive need immediate TB evaluation',3),
          ('CI_000136','GB005','Contact Tracing','Advise all contacts to report without delay if they develop cough, fever, or weight loss',4),
          -- GB005 Referral Criteria
          ('CI_000137','GB005','Referral Criteria','Refer if symptoms do not improve after 2 months of regular treatment — suspect drug resistance',1),
          ('CI_000138','GB005','Referral Criteria','Refer pregnant women with confirmed TB — requires supervised specialist management',2),
          ('CI_000139','GB005','Referral Criteria','Refer patients with confirmed TB and HIV co-infection to ART centre',3),
          ('CI_000140','GB005','Referral Criteria','Refer children and adolescents with confirmed or suspected TB to DOTS centre specialist',4),
          -- GB005 Follow-up
          ('CI_000141','GB005','Follow-up','Sputum examination at end of month 2, month 5, and month 6 as per protocol',1),
          ('CI_000142','GB005','Follow-up','Record body weight at each monthly DOTS visit',2),
          ('CI_000143','GB005','Follow-up','Update Nikshay portal after each dose and each monthly visit',3),
          ('CI_000144','GB005','Follow-up','Next monthly visit date and DOTS pick-up schedule confirmed with patient',4),
          -- GB006 Prevention
          ('CI_000145','GB006','Prevention','Sleep under a Long-Lasting Insecticide-Treated Net (LLIN) every night without exception',1),
          ('CI_000146','GB006','Prevention','Apply mosquito repellent on exposed skin during evening and night hours (dusk to dawn)',2),
          ('CI_000147','GB006','Prevention','Wear long-sleeved clothing and full-length trousers during peak mosquito biting hours',3),
          ('CI_000148','GB006','Prevention','Drain all stagnant water around the home every week — check flower pots, tyres, and containers',4),
          ('CI_000149','GB006','Prevention','Use window and door screens or keep doors and windows closed during evening and night',5),
          -- GB006 Testing and Diagnosis
          ('CI_000150','GB006','Testing and Diagnosis','Get tested for malaria with RDT or blood slide if fever continues for more than 24 hours',1),
          ('CI_000151','GB006','Testing and Diagnosis','Never start antimalarial treatment without a confirmed positive test result',2),
          ('CI_000152','GB006','Testing and Diagnosis','Bring the test result or health card to the health centre when seeking treatment',3),
          ('CI_000153','GB006','Testing and Diagnosis','Retest if fever returns after completion of the full medicine course',4),
          -- GB006 Treatment
          ('CI_000154','GB006','Treatment','Complete the full prescribed course of antimalarial medicines — never stop early',1),
          ('CI_000155','GB006','Treatment','For P. vivax: take the full primaquine course for radical cure after G6PD test clearance',2),
          ('CI_000156','GB006','Treatment','For P. falciparum: take the full ACT course as per NVBDCP protocol',3),
          ('CI_000157','GB006','Treatment','Take medicines with food to reduce stomach discomfort',4),
          ('CI_000158','GB006','Treatment','Primaquine must not be given to pregnant women or people with G6PD deficiency',5),
          -- GB006 Danger Signs
          ('CI_000159','GB006','Danger Signs','Seek immediate emergency care for repeated vomiting that prevents swallowing medicines',1),
          ('CI_000160','GB006','Danger Signs','Seek immediate care for altered consciousness, confusion, or any convulsion',2),
          ('CI_000161','GB006','Danger Signs','Seek immediate care for severe body weakness or inability to walk or sit up',3),
          ('CI_000162','GB006','Danger Signs','Seek immediate care for very high fever above 40 degrees or persistent fever despite medicines',4),
          ('CI_000163','GB006','Danger Signs','Seek immediate care for difficulty breathing, chest pain, or very little urine output',5),
          -- GB006 Special Populations
          ('CI_000164','GB006','Special Populations','Pregnant women with malaria must be referred immediately for supervised treatment',1),
          ('CI_000165','GB006','Special Populations','Children under 5 with malaria are at high risk — test, treat, and monitor closely',2),
          ('CI_000166','GB006','Special Populations','Malaria in pregnancy can cause severe anaemia, miscarriage, and very low birth weight',3),
          ('CI_000167','GB006','Special Populations','Never give primaquine to pregnant women — use only chloroquine or ACT as per protocol',4),
          -- GB006 Follow-up
          ('CI_000168','GB006','Follow-up','Return to the health centre on Day 3 and Day 7 to assess treatment response',1),
          ('CI_000169','GB006','Follow-up','Seek care immediately if fever returns after completing the full medicine course',2),
          ('CI_000170','GB006','Follow-up','Report any fever cluster in the household to the local ASHA within 24 hours',3),
          -- GB007 Lifestyle Modification
          ('CI_000171','GB007','Lifestyle Modification','Walk briskly for at least 30 minutes per day on most days of the week',1),
          ('CI_000172','GB007','Lifestyle Modification','Reduce salt intake to less than 5 grams per day — avoid pickles, papads, namkeen, and packaged foods',2),
          ('CI_000173','GB007','Lifestyle Modification','Aim to achieve and maintain a healthy body weight — even 5 kg of weight loss improves blood pressure',3),
          ('CI_000174','GB007','Lifestyle Modification','Quit tobacco and all tobacco products completely — smoking raises blood pressure and doubles stroke risk',4),
          ('CI_000175','GB007','Lifestyle Modification','Limit or stop alcohol — alcohol raises blood pressure unpredictably and reduces medicine effectiveness',5),
          -- GB007 Diet and Nutrition
          ('CI_000176','GB007','Diet and Nutrition','Eat at least 5 portions of fruits and vegetables every day',1),
          ('CI_000177','GB007','Diet and Nutrition','Choose whole grains over refined: brown rice and whole wheat chapati instead of white rice and maida',2),
          ('CI_000178','GB007','Diet and Nutrition','Reduce intake of saturated fats, fried foods, ghee, and red meat',3),
          ('CI_000179','GB007','Diet and Nutrition','Avoid all processed, packaged, and fast foods which are high in hidden salt',4),
          ('CI_000180','GB007','Diet and Nutrition','Include low-fat dairy: skimmed milk and low-fat yoghurt for calcium without extra saturated fat',5),
          -- GB007 Medication Adherence
          ('CI_000181','GB007','Medication Adherence','Take blood pressure medicines every single day at the same time — never skip or stop',1),
          ('CI_000182','GB007','Medication Adherence','Never discontinue medicines because BP feels normal — BP rises when medicines are stopped',2),
          ('CI_000183','GB007','Medication Adherence','Collect monthly medicine supply before running out; BP spikes during gaps in medicine',3),
          ('CI_000184','GB007','Medication Adherence','Report side effects promptly: ankle swelling, persistent cough, or severe dizziness',4),
          ('CI_000185','GB007','Medication Adherence','Tell all other doctors about your BP medicines before any new prescription or procedure',5),
          -- GB007 Blood Pressure Monitoring
          ('CI_000186','GB007','Blood Pressure Monitoring','Check blood pressure at least twice a week; record all readings in the BP diary with date and time',1),
          ('CI_000187','GB007','Blood Pressure Monitoring','Visit the health centre immediately if reading is above 160/100 mmHg on two checks within one hour',2),
          ('CI_000188','GB007','Blood Pressure Monitoring','Know your personal BP target — for most people below 140/90 mmHg; below 130/80 if diabetic',3),
          ('CI_000189','GB007','Blood Pressure Monitoring','Bring the BP diary and all medicines to every clinic visit for review',4),
          -- GB007 Danger Signs
          ('CI_000190','GB007','Danger Signs','Call for emergency help immediately for sudden severe headache or head heaviness unlike before',1),
          ('CI_000191','GB007','Danger Signs','Call for emergency help immediately for chest pain, chest tightness, or difficulty breathing',2),
          ('CI_000192','GB007','Danger Signs','Call for emergency help immediately for sudden weakness or numbness in face, arm, or leg',3),
          ('CI_000193','GB007','Danger Signs','Call for emergency help immediately for sudden blurred or loss of vision in one or both eyes',4),
          ('CI_000194','GB007','Danger Signs','Call for emergency help immediately for sudden confusion, difficulty speaking, or loss of balance',5),
          -- GB007 Referral Criteria
          ('CI_000195','GB007','Referral Criteria','Refer if blood pressure is above 180/110 mmHg on two readings taken 15 minutes apart',1),
          ('CI_000196','GB007','Referral Criteria','Refer immediately if any hypertensive danger sign (stroke, chest pain) is present',2),
          ('CI_000197','GB007','Referral Criteria','Refer pregnant women with BP at or above 140/90 mmHg — hypertension in pregnancy is high risk',3),
          ('CI_000198','GB007','Referral Criteria','Refer if blood pressure remains above 140/90 mmHg after 3 months of compliant treatment',4),
          ('CI_000199','GB007','Referral Criteria','Refer if more than 2 medicines are already prescribed and BP remains uncontrolled',5),
          -- GB007 Follow-up
          ('CI_000200','GB007','Follow-up','Return to the health centre monthly for medicines, BP check, and adherence review',1),
          ('CI_000201','GB007','Follow-up','Target BP must be achieved within 3 to 6 months and maintained at every visit',2),
          ('CI_000202','GB007','Follow-up','Bring BP diary and all medicines — one family member should accompany for support counselling',3),
          ('CI_000203','GB007','Follow-up','Annual urine test, blood creatinine, and ECG as part of hypertension complication screen',4),
          -- GB008 Healthy Lifestyle
          ('CI_000204','GB008','Healthy Lifestyle','Walk at least 30 to 45 minutes daily or 5 days per week — regular activity reduces blood sugar',1),
          ('CI_000205','GB008','Healthy Lifestyle','Avoid sitting for more than 1 hour at a stretch — stand up and walk for 5 minutes every hour',2),
          ('CI_000206','GB008','Healthy Lifestyle','Achieve and maintain a healthy weight — every kilogram lost significantly improves blood sugar control',3),
          ('CI_000207','GB008','Healthy Lifestyle','Quit all tobacco products — smoking accelerates diabetes complications especially kidney and heart disease',4),
          ('CI_000208','GB008','Healthy Lifestyle','Limit alcohol to the minimum possible — alcohol causes unpredictable swings in blood sugar',5),
          -- GB008 Diet and Nutrition
          ('CI_000209','GB008','Diet and Nutrition','Eat small, frequent meals 5 to 6 times per day at regular intervals — avoid skipping any meal',1),
          ('CI_000210','GB008','Diet and Nutrition','Completely avoid sugary drinks, sweetened juices, sweets, biscuits, and refined carbohydrates',2),
          ('CI_000211','GB008','Diet and Nutrition','Choose high-fibre foods at every meal: vegetables, salads, lentils, legumes, and whole grains',3),
          ('CI_000212','GB008','Diet and Nutrition','Control portion size by using a smaller plate and stopping when comfortably full',4),
          ('CI_000213','GB008','Diet and Nutrition','Do not skip meals if on insulin or sulphonylurea tablets — skipping causes dangerous low blood sugar',5),
          -- GB008 Medication Adherence
          ('CI_000214','GB008','Medication Adherence','Take all diabetes medicines at the correct dose and time every day without exception',1),
          ('CI_000215','GB008','Medication Adherence','Never increase, decrease, or stop medicines without consulting the doctor first',2),
          ('CI_000216','GB008','Medication Adherence','If using insulin: follow correct injection site rotation; store insulin away from heat and sunlight',3),
          ('CI_000217','GB008','Medication Adherence','Collect refill before supply runs out — a break in medicines causes blood sugar to spike',4),
          ('CI_000218','GB008','Medication Adherence','Report any episode of low blood sugar (shakiness, sweating, confusion) to the health worker the same day',5),
          -- GB008 Blood Sugar Monitoring
          ('CI_000219','GB008','Blood Sugar Monitoring','Know your targets: fasting glucose below 130 mg/dL; 2-hour post-meal glucose below 180 mg/dL',1),
          ('CI_000220','GB008','Blood Sugar Monitoring','Check blood glucose as advised — at least fasting and 2 hours after the main meal',2),
          ('CI_000221','GB008','Blood Sugar Monitoring','HbA1c test every 3 months to assess overall blood sugar control over the past 3 months',3),
          ('CI_000222','GB008','Blood Sugar Monitoring','Record all readings in the blood sugar diary with date, time, and what was eaten before the test',4),
          -- GB008 Foot Care
          ('CI_000223','GB008','Foot Care','Inspect both feet every day for cuts, blisters, corns, redness, or swelling — use a mirror if needed',1),
          ('CI_000224','GB008','Foot Care','Wash both feet daily with lukewarm water; dry thoroughly between toes with a soft cloth',2),
          ('CI_000225','GB008','Foot Care','Wear comfortable, fully enclosed, well-fitting footwear at all times — never walk barefoot',3),
          ('CI_000226','GB008','Foot Care','Seek care immediately for any foot wound, ulcer, or infection — never self-treat a diabetic foot wound',4),
          -- GB008 Danger Signs
          ('CI_000227','GB008','Danger Signs','Seek immediate care for symptoms of low blood sugar: sudden sweating, shaking, confusion, or faintness',1),
          ('CI_000228','GB008','Danger Signs','Seek immediate care if blood sugar exceeds 300 mg/dL or is very low on repeated checks',2),
          ('CI_000229','GB008','Danger Signs','Seek immediate care for any foot sore or wound that is not healing after 48 hours',3),
          ('CI_000230','GB008','Danger Signs','Seek immediate care for sudden vision changes, chest pain, breathlessness, or numbness in limbs',4),
          ('CI_000231','GB008','Danger Signs','Seek immediate care for uncontrolled vomiting or inability to eat or drink for more than 6 hours',5),
          -- GB008 Complications Screening
          ('CI_000232','GB008','Complications Screening','Annual eye examination by an ophthalmologist for diabetic retinopathy — even if vision is normal',1),
          ('CI_000233','GB008','Complications Screening','Annual kidney function tests: serum creatinine and spot urine microalbumin ratio',2),
          ('CI_000234','GB008','Complications Screening','Blood pressure measured and recorded at every clinic visit — target below 130/80 mmHg',3),
          ('CI_000235','GB008','Complications Screening','Complete foot examination including sensation test with monofilament at every visit',4),
          -- GB008 Follow-up
          ('CI_000236','GB008','Follow-up','Return to health centre monthly for medicines, BP, weight, and glucose review',1),
          ('CI_000237','GB008','Follow-up','HbA1c test every 3 months — target HbA1c below 7% for most patients',2),
          ('CI_000238','GB008','Follow-up','Bring all medicines, blood sugar diary, and BP record to every visit without fail',3),
          -- GB009 Blood Pressure Control
          ('CI_000239','GB009','Blood Pressure Control','Target blood pressure must be below 130/80 mmHg for all patients with CKD',1),
          ('CI_000240','GB009','Blood Pressure Control','Take every BP medicine every single day — missing doses causes accelerated kidney damage',2),
          ('CI_000241','GB009','Blood Pressure Control','Strictly limit salt intake to less than 3 grams per day — much lower than for the general population',3),
          ('CI_000242','GB009','Blood Pressure Control','Check blood pressure at home once or twice a week and record readings in the diary',4),
          ('CI_000243','GB009','Blood Pressure Control','Report any reading above 140/90 mmHg to the health worker the same day',5),
          -- GB009 Kidney-Safe Diet
          ('CI_000244','GB009','Kidney-Safe Diet','Restrict potassium if blood level is high — avoid bananas, oranges, tomatoes, potatoes, and coconut water',1),
          ('CI_000245','GB009','Kidney-Safe Diet','Restrict phosphorus intake — avoid dairy in large amounts, nuts, beans, and all processed foods',2),
          ('CI_000246','GB009','Kidney-Safe Diet','Eat adequate but not excess protein — follow the specific advice from the doctor or dietitian',3),
          ('CI_000247','GB009','Kidney-Safe Diet','Drink only the amount of fluid your doctor advises — do not restrict unless told to',4),
          ('CI_000248','GB009','Kidney-Safe Diet','Never take herbal remedies, Ayurvedic powders, or pain killers without telling your kidney doctor',5),
          -- GB009 Medication Safety
          ('CI_000249','GB009','Medication Safety','Never take NSAIDs (pain killers like ibuprofen, diclofenac, naproxen) — they cause rapid kidney damage',1),
          ('CI_000250','GB009','Medication Safety','Inform every doctor and dentist about CKD and kidney function before any new medicine is started',2),
          ('CI_000251','GB009','Medication Safety','Avoid contrast dye procedures (like CT scan with contrast) unless reviewed and approved by the kidney doctor',3),
          ('CI_000252','GB009','Medication Safety','Diabetes medicines may need dose reduction as kidney function declines — review at every visit',4),
          -- GB009 Monitoring Tests
          ('CI_000253','GB009','Monitoring Tests','Serum creatinine and eGFR test every 3 to 6 months to monitor kidney function trend',1),
          ('CI_000254','GB009','Monitoring Tests','Spot urine for protein (urine albumin-to-creatinine ratio) every 3 months',2),
          ('CI_000255','GB009','Monitoring Tests','Complete blood count every 6 months — CKD commonly causes anaemia that needs treatment',3),
          ('CI_000256','GB009','Monitoring Tests','Blood potassium, sodium, and bicarbonate levels as advised by the doctor',4),
          -- GB009 Danger Signs
          ('CI_000257','GB009','Danger Signs','Seek immediate emergency care if urine output decreases suddenly or you stop passing urine',1),
          ('CI_000258','GB009','Danger Signs','Seek immediate care for severe swelling of both legs, face, or the whole body',2),
          ('CI_000259','GB009','Danger Signs','Seek immediate care for worsening breathlessness especially when lying flat',3),
          ('CI_000260','GB009','Danger Signs','Seek immediate care for persistent severe nausea or vomiting that prevents eating',4),
          ('CI_000261','GB009','Danger Signs','Seek immediate care for sudden confusion, drowsiness, or difficulty being aroused',5),
          -- GB009 Referral Criteria
          ('CI_000262','GB009','Referral Criteria','Refer to a nephrologist when eGFR falls to below 30 mL/min/1.73m2',1),
          ('CI_000263','GB009','Referral Criteria','Refer if kidney function is declining rapidly (eGFR drop above 5 mL/min in 6 months)',2),
          ('CI_000264','GB009','Referral Criteria','Refer if fluid overload does not respond to diuretic medicines given at the health centre',3),
          ('CI_000265','GB009','Referral Criteria','Refer to begin preparation and education for dialysis or kidney transplant when appropriate',4),
          -- GB009 Follow-up
          ('CI_000266','GB009','Follow-up','Monthly review at the health centre for blood pressure, weight, symptoms, and medicine review',1),
          ('CI_000267','GB009','Follow-up','Quarterly blood tests as scheduled — bring previous results to each visit for comparison',2),
          ('CI_000268','GB009','Follow-up','Annual eye check for diabetic retinopathy if underlying diabetes',3),
          ('CI_000269','GB009','Follow-up','Nephrologist review every 6 months or more frequently if kidney function is declining',4),
          -- GB010 Emotional Wellbeing
          ('CI_000270','GB010','Emotional Wellbeing','Talk about your feelings with someone you trust — sharing reduces the burden of mental illness',1),
          ('CI_000271','GB010','Emotional Wellbeing','Maintain a consistent daily routine including fixed waking time, meals, and sleep time',2),
          ('CI_000272','GB010','Emotional Wellbeing','Practice slow deep breathing, progressive muscle relaxation, or simple yoga for 15 minutes daily',3),
          ('CI_000273','GB010','Emotional Wellbeing','Engage in one enjoyable or meaningful activity every day even if motivation is very low',4),
          ('CI_000274','GB010','Emotional Wellbeing','Limit exposure to distressing news or content that increases anxiety or sadness',5),
          -- GB010 Treatment Adherence
          ('CI_000275','GB010','Treatment Adherence','Take all prescribed medicines every day at the same time — never skip or stop without advice',1),
          ('CI_000276','GB010','Treatment Adherence','Mental health medicines typically take 4 to 6 weeks to show full benefit — be patient and continue',2),
          ('CI_000277','GB010','Treatment Adherence','Never stop medicines suddenly — stopping abruptly causes withdrawal or rapid relapse',3),
          ('CI_000278','GB010','Treatment Adherence','Attend all follow-up counselling sessions and clinic appointments as scheduled',4),
          ('CI_000279','GB010','Treatment Adherence','Report any side effects: excessive weight gain, excessive drowsiness, or sexual dysfunction',5),
          -- GB010 Family and Caregiver Support
          ('CI_000280','GB010','Family and Caregiver Support','Family members must be supportive and patient — avoid criticising, blaming, or pressuring',1),
          ('CI_000281','GB010','Family and Caregiver Support','Participate in family counselling sessions to understand the illness and the treatment plan',2),
          ('CI_000282','GB010','Family and Caregiver Support','Never leave the person alone if there is any risk of self-harm or thoughts of suicide',3),
          ('CI_000283','GB010','Family and Caregiver Support','Contact the ASHA, ANM, or health centre immediately if the person expresses suicidal thoughts',4),
          -- GB010 Healthy Lifestyle
          ('CI_000284','GB010','Healthy Lifestyle','Maintain regular sleep schedule — go to bed and wake at the same time every day',1),
          ('CI_000285','GB010','Healthy Lifestyle','Physical activity improves mood significantly — even a 20 to 30 minute walk every day helps',2),
          ('CI_000286','GB010','Healthy Lifestyle','Avoid all alcohol and substance use — they worsen mental illness and interact with medicines',3),
          ('CI_000287','GB010','Healthy Lifestyle','Eat regular balanced meals throughout the day — skipping meals worsens mood and energy',4),
          -- GB010 Danger Signs
          ('CI_000288','GB010','Danger Signs','Seek immediate care if the person expresses any plan or intention to harm themselves or others',1),
          ('CI_000289','GB010','Danger Signs','Seek immediate care if the person refuses to eat or drink for more than 24 hours',2),
          ('CI_000290','GB010','Danger Signs','Seek immediate care if the person becomes suddenly aggressive, violent, or destructive',3),
          ('CI_000291','GB010','Danger Signs','Seek immediate care if the person is hearing or seeing things others cannot (hallucinations)',4),
          ('CI_000292','GB010','Danger Signs','Report extreme agitation, inability to sleep for more than 2 consecutive nights, or new strange behaviour',5),
          -- GB010 Referral Criteria
          ('CI_000293','GB010','Referral Criteria','Refer immediately for any active suicidal ideation with a plan or recent self-harm attempt',1),
          ('CI_000294','GB010','Referral Criteria','Refer for first psychotic episode — new onset hallucinations, delusions, or disorganised behaviour',2),
          ('CI_000295','GB010','Referral Criteria','Refer if no improvement after 6 to 8 weeks of treatment at adequate doses',3),
          ('CI_000296','GB010','Referral Criteria','Refer for specialist dual diagnosis assessment if co-occurring substance use disorder',4),
          ('CI_000297','GB010','Referral Criteria','Refer for ECT evaluation if severe depression with poor response to multiple medicines',5),
          -- GB010 Follow-up
          ('CI_000298','GB010','Follow-up','Weekly follow-up during initial 4 weeks; fortnightly until stable; monthly when stable',1),
          ('CI_000299','GB010','Follow-up','Bring all medicines to each visit — pill count helps assess adherence',2),
          ('CI_000300','GB010','Follow-up','Caregiver must accompany the patient to as many visits as possible for coordinated care',3),
          -- GB011 Motivation and Readiness
          ('CI_000301','GB011','Motivation and Readiness','Explore the person''s own motivation to change — list specific harms of continued use to health and family',1),
          ('CI_000302','GB011','Motivation and Readiness','Discuss realistic benefits of stopping: improved health, family relationships, and finances',2),
          ('CI_000303','GB011','Motivation and Readiness','Identify high-risk triggers: stress, peer pressure, specific people, places, or emotional states',3),
          ('CI_000304','GB011','Motivation and Readiness','Set a specific quit date together and write it down with a plan for the first 24 hours',4),
          ('CI_000305','GB011','Motivation and Readiness','Acknowledge that relapse is part of the recovery process — not a sign of failure or weakness',5),
          -- GB011 Quitting Strategies
          ('CI_000306','GB011','Quitting Strategies','Remove all tobacco, alcohol, or other substances from the home on the quit date',1),
          ('CI_000307','GB011','Quitting Strategies','Avoid all situations, people, and places associated with substance use for the first month',2),
          ('CI_000308','GB011','Quitting Strategies','Call a trusted family member or friend immediately when a craving strikes — do not be alone',3),
          ('CI_000309','GB011','Quitting Strategies','Physical exercise reduces craving intensity — walk briskly for 10 minutes when cravings hit',4),
          ('CI_000310','GB011','Quitting Strategies','Use distraction activities: reading, calling a friend, household chores during intense craving periods',5),
          -- GB011 Medical Treatment
          ('CI_000311','GB011','Medical Treatment','Take all prescribed medicines for withdrawal or craving management as directed',1),
          ('CI_000312','GB011','Medical Treatment','Never mix prescribed medicines with alcohol or any other substances',2),
          ('CI_000313','GB011','Medical Treatment','For opioid dependence: Opioid Substitution Therapy (OST) with buprenorphine is available at government centres',3),
          ('CI_000314','GB011','Medical Treatment','Report any severe or unexpected symptoms during withdrawal to the health worker immediately',4),
          -- GB011 Family Counselling
          ('CI_000315','GB011','Family Counselling','Educate family that substance use disorder is a brain disease — not a moral failing or weakness',1),
          ('CI_000316','GB011','Family Counselling','Family should support recovery without enabling substance access or use',2),
          ('CI_000317','GB011','Family Counselling','Involve the family in setting boundaries, treatment goals, and follow-up plans',3),
          ('CI_000318','GB011','Family Counselling','Address domestic violence, financial stress, and mental health impacts on the family in sessions',4),
          -- GB011 Withdrawal Danger Signs
          ('CI_000319','GB011','Withdrawal Danger Signs','Seek emergency care for alcohol withdrawal symptoms: uncontrolled tremors, confusion, or seizures',1),
          ('CI_000320','GB011','Withdrawal Danger Signs','Seek emergency care for opioid withdrawal with severe dehydration, chest pain, or fainting',2),
          ('CI_000321','GB011','Withdrawal Danger Signs','Never attempt abrupt alcohol cessation at home if drinking heavily every day — medically managed withdrawal is needed',3),
          ('CI_000322','GB011','Withdrawal Danger Signs','Report any thoughts of self-harm or suicide immediately during the withdrawal period',4),
          -- GB011 Referral Criteria
          ('CI_000323','GB011','Referral Criteria','Refer for inpatient de-addiction if outpatient management has failed twice',1),
          ('CI_000324','GB011','Referral Criteria','Refer opioid-dependent patients requiring OST to the nearest government de-addiction or ICTC centre',2),
          ('CI_000325','GB011','Referral Criteria','Refer for specialist assessment if co-occurring mental illness is suspected',3),
          ('CI_000326','GB011','Referral Criteria','Refer to social welfare services if homelessness, abuse, or child safety is a concern',4),
          -- GB011 Follow-up
          ('CI_000327','GB011','Follow-up','Weekly session during the first month — the highest relapse risk period',1),
          ('CI_000328','GB011','Follow-up','Fortnightly session during months 2 and 3; monthly once stable and maintaining abstinence',2),
          ('CI_000329','GB011','Follow-up','Relapse review session within 48 hours of any relapse to identify trigger and revise plan',3),
          -- GB012 Primary Assessment
          ('CI_000330','GB012','Primary Assessment','Check Airway first — tilt head back and lift chin; clear any visible obstruction with finger sweep',1),
          ('CI_000331','GB012','Primary Assessment','Check Breathing — look, listen, and feel at the mouth and nose for 10 seconds',2),
          ('CI_000332','GB012','Primary Assessment','Check Circulation — feel for carotid pulse for 10 seconds; begin CPR at 30 compressions to 2 breaths if no pulse',3),
          ('CI_000333','GB012','Primary Assessment','Assess Disability (consciousness) — use AVPU: Alert, responds to Voice, responds to Pain, or Unresponsive',4),
          ('CI_000334','GB012','Primary Assessment','Expose and control — identify major wounds or fractures; apply direct pressure to control bleeding',5),
          -- GB012 Emergency Responses
          ('CI_000335','GB012','Emergency Responses','Suspected stroke — use FAST: Face drooping, Arm weakness, Speech difficulty, Time to call 108 now',1),
          ('CI_000336','GB012','Emergency Responses','Suspected heart attack — rest patient flat, loosen all tight clothing, call 108, aspirin 300 mg if conscious and not allergic',2),
          ('CI_000337','GB012','Emergency Responses','Convulsions — protect head from injury, do not restrain, turn to side after convulsion ends, do not put anything in mouth',3),
          ('CI_000338','GB012','Emergency Responses','Anaphylaxis — call 108 immediately; if adrenaline auto-injector available give it at once; lay flat with legs raised',4),
          ('CI_000339','GB012','Emergency Responses','Snake bite — immobilise bitten limb below heart level, call 108, do NOT cut, suck, apply tourniquet, or give herbal treatment',5),
          -- GB012 Ambulance Activation
          ('CI_000340','GB012','Ambulance Activation','Call 108 immediately for all life-threatening conditions — do not delay for any first aid',1),
          ('CI_000341','GB012','Ambulance Activation','Give the operator exact location: village name, landmark, road name, and active mobile number',2),
          ('CI_000342','GB012','Ambulance Activation','Keep the line open; follow operator instructions until the ambulance arrives',3),
          ('CI_000343','GB012','Ambulance Activation','Ensure one adult accompanies the patient with their medicines, documents, and ID',4),
          -- GB012 Stabilisation
          ('CI_000344','GB012','Stabilisation','Control external bleeding with firm continuous direct pressure using a clean cloth — maintain for 10 minutes',1),
          ('CI_000345','GB012','Stabilisation','Immobilise a suspected fracture with a makeshift splint before moving the patient',2),
          ('CI_000346','GB012','Stabilisation','Keep all unconscious breathing patients in the lateral (recovery) position to prevent choking',3),
          ('CI_000347','GB012','Stabilisation','Do not give anything by mouth to any unconscious or fitting patient',4),
          -- GB012 Documentation
          ('CI_000348','GB012','Documentation','Record time of emergency onset, first aid steps taken, and patient''s condition on arrival at facility',1),
          ('CI_000349','GB012','Documentation','Report all emergency incidents to the PHC or CHC within 24 hours for HMIS documentation',2),
          ('CI_000350','GB012','Documentation','Follow up with the patient or family within 48 hours to learn the outcome and support recovery',3),
          -- GB013 Fall Prevention
          ('CI_000351','GB013','Fall Prevention','Remove all trip hazards from walking areas: loose mats, cables, low furniture, and clutter',1),
          ('CI_000352','GB013','Fall Prevention','Use a walking stick or walker if balance or confidence while walking is reduced',2),
          ('CI_000353','GB013','Fall Prevention','Wear non-slip rubber-soled footwear at all times — both indoors and outdoors',3),
          ('CI_000354','GB013','Fall Prevention','Install a sturdy grab rail next to the toilet and in the bathing area if possible',4),
          ('CI_000355','GB013','Fall Prevention','Perform supervised balance and leg-strengthening exercises for 20 minutes at least 3 times per week',5),
          -- GB013 Medication Review
          ('CI_000356','GB013','Medication Review','Review all medicines at every visit — patients on 5 or more medicines are at high risk of falls and confusion',1),
          ('CI_000357','GB013','Medication Review','Use a daily pill organiser to reduce missed doses and avoid double-dosing',2),
          ('CI_000358','GB013','Medication Review','Watch for medicines that cause dizziness, low BP, or drowsiness — these are common fall triggers',3),
          ('CI_000359','GB013','Medication Review','Never stop any chronic disease medicine without telling the doctor first',4),
          ('CI_000360','GB013','Medication Review','Sleeping tablets and sedatives should be avoided or used at the lowest dose for the shortest time',5),
          -- GB013 Cognitive Health
          ('CI_000361','GB013','Cognitive Health','Screen for memory and cognitive problems using MMSE or AMTS at the annual health visit',1),
          ('CI_000362','GB013','Cognitive Health','Counsel caregivers to use simple sentences, calm tone, and direct eye contact with someone with dementia',2),
          ('CI_000363','GB013','Cognitive Health','Maintain daily routine and familiar environment — changes and new places increase confusion',3),
          ('CI_000364','GB013','Cognitive Health','Engage in cognitively stimulating activities: conversation, prayers, puzzles, or familiar music',4),
          -- GB013 Nutrition
          ('CI_000365','GB013','Nutrition','Ensure adequate protein at every meal to prevent muscle wasting: eggs, fish, lentils, or milk',1),
          ('CI_000366','GB013','Nutrition','Calcium supplementation 500 mg twice daily and Vitamin D to prevent falls and fractures',2),
          ('CI_000367','GB013','Nutrition','Offer small frequent meals if appetite is poor — large meals are often not tolerated',3),
          ('CI_000368','GB013','Nutrition','Ensure at least 6 glasses of fluid daily — dehydration is common and dangerous in the elderly',4),
          ('CI_000369','GB013','Nutrition','Screen for swallowing difficulty (food going the wrong way) and refer if present',5),
          -- GB013 Mental Wellbeing
          ('CI_000370','GB013','Mental Wellbeing','Screen for depression at every annual visit using GDS (Geriatric Depression Scale)',1),
          ('CI_000371','GB013','Mental Wellbeing','Encourage regular contact with family, friends, and the community — loneliness worsens health',2),
          ('CI_000372','GB013','Mental Wellbeing','Involve the elderly person in household decisions to preserve dignity and sense of purpose',3),
          ('CI_000373','GB013','Mental Wellbeing','Refer for palliative care when there is significant pain, terminal illness, or severe decline',4),
          -- GB013 Danger Signs
          ('CI_000374','GB013','Danger Signs','Seek immediate care for new or sudden confusion, agitation, or disorientation not present before',1),
          ('CI_000375','GB013','Danger Signs','Seek immediate care for any fall resulting in pain, swelling, or inability to bear weight or walk',2),
          ('CI_000376','GB013','Danger Signs','Seek immediate care for sudden loss of a function previously managed independently',3),
          ('CI_000377','GB013','Danger Signs','Seek immediate care for chest pain, sudden shortness of breath, or sudden one-sided weakness',4),
          ('CI_000378','GB013','Danger Signs','Report any signs of elder mistreatment: unexplained bruises, fear, malnutrition, or financial exploitation',5),
          -- GB013 Referral Criteria
          ('CI_000379','GB013','Referral Criteria','Refer to geriatric specialist or psychiatrist when dementia diagnosis or complex assessment is needed',1),
          ('CI_000380','GB013','Referral Criteria','Refer for comprehensive geriatric assessment when managing 3 or more chronic conditions together',2),
          ('CI_000381','GB013','Referral Criteria','Refer for palliative care services when curative treatment goals are no longer appropriate',3),
          ('CI_000382','GB013','Referral Criteria','Refer to district social welfare office for elderly without family support or facing neglect',4),
          -- GB013 Follow-up
          ('CI_000383','GB013','Follow-up','Monthly review at the health centre; home visit if patient is homebound or bedbound',1),
          ('CI_000384','GB013','Follow-up','Caregiver education and support at every visit — caregiver burnout is a real risk',2),
          ('CI_000385','GB013','Follow-up','Document functional status at each visit: ability to bathe, dress, eat, walk, and manage toileting',3),
          -- GB014 Eligibility Assessment
          ('CI_000386','GB014','Eligibility Assessment','Verify PM-JAY (Ayushman Bharat) eligibility using the beneficiary list, ration card, or SECC data',1),
          ('CI_000387','GB014','Eligibility Assessment','Assess eligibility for JSY cash incentive for all pregnant women planning institutional delivery',2),
          ('CI_000388','GB014','Eligibility Assessment','Assess eligibility for PMMVY for the first-time mother with the first living child',3),
          ('CI_000389','GB014','Eligibility Assessment','Generate ABHA (Ayushman Bharat Health Account) ID for all beneficiaries who do not have one',4),
          ('CI_000390','GB014','Eligibility Assessment','Confirm eligibility for NHM free essential medicines and free diagnostics at government facilities',5),
          -- GB014 Scheme Benefits
          ('CI_000391','GB014','Scheme Benefits','PM-JAY provides up to rupees 5 lakh per family per year for hospitalisation at empanelled hospitals — completely cashless',1),
          ('CI_000392','GB014','Scheme Benefits','JSY provides cash incentive directly to the mother after institutional delivery — amount varies by state and category',2),
          ('CI_000393','GB014','Scheme Benefits','PMMVY provides rupees 5,000 to first-time mothers in three instalments linked to ANC, delivery, and immunisation',3),
          ('CI_000394','GB014','Scheme Benefits','NHM Essential Drug List medicines are available free at all government health facilities',4),
          ('CI_000395','GB014','Scheme Benefits','RBSK screens all children aged 0 to 18 years free of charge for 30 health conditions at school and VHSND',5),
          -- GB014 Enrolment Support
          ('CI_000396','GB014','Enrolment Support','Assist the beneficiary in completing enrolment or verification forms accurately',1),
          ('CI_000397','GB014','Enrolment Support','Link Aadhaar number and active mobile number — both required for scheme registration',2),
          ('CI_000398','GB014','Enrolment Support','Provide the list of empanelled hospitals in the district for PM-JAY and explain how to use them',3),
          ('CI_000399','GB014','Enrolment Support','Issue the beneficiary ID card or health and wellness card and explain how to keep it safely',4),
          -- GB014 Utilisation Guidance
          ('CI_000400','GB014','Utilisation Guidance','For PM-JAY: present the beneficiary card at the empanelled hospital front desk — no cash payment needed for covered conditions',1),
          ('CI_000401','GB014','Utilisation Guidance','For JSY: enrol at the nearest ANM or sub-centre before delivery; collect payment after delivery with discharge certificate',2),
          ('CI_000402','GB014','Utilisation Guidance','For NHM free medicines: available only at government facilities — advise to not pay for NHM list drugs',3),
          ('CI_000403','GB014','Utilisation Guidance','For free diagnostics: available at government health facilities — no payment should be collected',4),
          -- GB014 Referral for Complex Queries
          ('CI_000404','GB014','Referral for Complex Queries','Refer eligibility disputes or denied claim cases to the District PM-JAY Implementation Unit',1),
          ('CI_000405','GB014','Referral for Complex Queries','Refer for scheme-covered specialist conditions to the appropriate empanelled hospital',2),
          ('CI_000406','GB014','Referral for Complex Queries','Refer children identified under RBSK to the District Early Intervention Centre (DEIC) for further evaluation',3),
          -- GB014 Follow-up
          ('CI_000407','GB014','Follow-up','Confirm successful enrolment or scheme card receipt within 2 weeks of application',1),
          ('CI_000408','GB014','Follow-up','Follow up on pending JSY payments, PMMVY instalments, or delayed PM-JAY claims',2),
          ('CI_000409','GB014','Follow-up','Annual review: confirm scheme renewal, update household details, and check for new scheme eligibility',3),
          -- GB015 Clinical Query Resolution
          ('CI_000410','GB015','Clinical Query Resolution','Search the DiNC knowledge base for the patient''s question before providing an answer',1),
          ('CI_000411','GB015','Clinical Query Resolution','Verify the answer against current NHM programme guidelines and protocols',2),
          ('CI_000412','GB015','Clinical Query Resolution','Provide the answer in simple local language the patient can understand without technical terms',3),
          ('CI_000413','GB015','Clinical Query Resolution','Document all questions and answers in the patient interaction record for quality review',4),
          -- GB015 Health Myth Correction
          ('CI_000414','GB015','Health Myth Correction','Correct common health myths with factual evidence-based information — never reinforce false beliefs',1),
          ('CI_000415','GB015','Health Myth Correction','Explain why the myth is incorrect and what the correct information is, using a respectful and non-judgemental approach',2),
          ('CI_000416','GB015','Health Myth Correction','Use approved NHM IEC materials to illustrate correct health information',3),
          -- GB015 Escalation of Queries
          ('CI_000417','GB015','Escalation of Queries','Document all questions that cannot be answered confidently in the query log',1),
          ('CI_000418','GB015','Escalation of Queries','Escalate clinical questions beyond scope to the supervisor or medical officer at the PHC or CHC',2),
          ('CI_000419','GB015','Escalation of Queries','Refer the patient to an appropriate specialist if the query involves diagnosis, treatment, or prescribing',3),
          ('CI_000420','GB015','Escalation of Queries','Report knowledge gaps to the district health team for FAQ database update and training',4),
          -- GB015 Follow-up
          ('CI_000421','GB015','Follow-up','Schedule a follow-up visit or call if the question requires investigation or specialist referral',1),
          ('CI_000422','GB015','Follow-up','Document all health information provided during the session accurately in the patient record',2),
          ('CI_000423','GB015','Follow-up','Report repeated questions from the community to identify gaps in health education coverage',3)
        
        ) AS v(item_key, code, sname, body, iord)
        JOIN sl ON sl.gcode = v.code AND sl.sname = v.sname
        ON CONFLICT (section_id, body) DO UPDATE
          SET item_key = EXCLUDED.item_key
          WHERE counselling_items.item_key IS NULL
      `);

      const { rows } = await this.db.query<{ protocols: number; sections: number; items: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM public.counselling_protocols WHERE is_active = true) AS protocols,
           (SELECT COUNT(*)::int FROM public.counselling_sections  WHERE is_active = true) AS sections,
           (SELECT COUNT(*)::int FROM public.counselling_items     WHERE is_active = true) AS items`,
      );
      this.logger.log(
        `Counselling content ready (16E): ${rows[0]?.protocols ?? 0} protocol(s), ` +
        `${rows[0]?.sections ?? 0} section(s), ${rows[0]?.items ?? 0} item(s).`,
      );
    } catch (error) {
      this.logger.error(`Counselling content seed failed: ${(error as Error).message}`);
    }
  }

  // ── Counselling engine (16B) ────────────────────────────────────────────────

  /**
   * Returns the counselling sections (with items) for a guidebook.
   *
   * Resolution order (16E):
   *   1. Protocol path: sections linked to the first active counselling_protocol
   *      for this guidebook, ordered by the protocol then section sort_order.
   *   2. Legacy fallback: sections directly on counselling_sections.guidebook_id
   *      (no protocol_id) — used only when no protocol exists yet, ensuring
   *      backward compatibility with 16D-seeded data.
   *
   * Only active sections and items are returned.
   */
  async findCounsellingSections(guidebookId: string): Promise<CounsellingSectionDto[]> {
    const result = await this.db.query<{
      section_id: string;
      section_name: string;
      section_order: number;
      item_id: string | null;
      item_body: string | null;
      item_note_text: string | null;
      item_order: number | null;
    }>(
      `SELECT cs.id           AS section_id,
              cs.name         AS section_name,
              cs.sort_order   AS section_order,
              ci.id           AS item_id,
              ci.body         AS item_body,
              ci.note_text    AS item_note_text,
              ci.sort_order   AS item_order
       FROM   public.counselling_sections cs
       LEFT   JOIN public.counselling_items ci
                ON ci.section_id = cs.id AND ci.is_active = true
       WHERE  cs.is_active = true
         AND  (
               -- Protocol path (16E): sections belonging to the first active protocol
               cs.protocol_id = (
                 SELECT id FROM public.counselling_protocols
                 WHERE  guidebook_id = $1 AND is_active = true
                 ORDER  BY sort_order ASC LIMIT 1
               )
               OR
               -- Legacy fallback (16D): direct sections with no protocol yet
               (
                 cs.protocol_id IS NULL
                 AND cs.guidebook_id = $1
                 AND NOT EXISTS (
                   SELECT 1 FROM public.counselling_protocols
                   WHERE guidebook_id = $1 AND is_active = true
                 )
               )
             )
       ORDER  BY cs.sort_order, ci.sort_order`,
      [guidebookId],
    );

    const map = new Map<string, CounsellingSectionDto>();
    for (const row of result.rows) {
      if (!map.has(row.section_id)) {
        map.set(row.section_id, {
          id: row.section_id,
          name: row.section_name,
          sortOrder: row.section_order,
          items: [],
        });
      }
      if (row.item_id && row.item_body) {
        map.get(row.section_id)!.items.push({
          id: row.item_id,
          body: row.item_body,
          noteText: row.item_note_text ?? row.item_body,
          sortOrder: row.item_order ?? 0,
        });
      }
    }
    return Array.from(map.values());
  }

  /** Full teleconsultation context for an activity, or null when not found. */
  async findContext(activityId: string): Promise<ConsultationContextRow | null> {
    const result = await this.db.query<ConsultationContextRow>(
      `SELECT w.id AS activity_id,
              w.status AS activity_status,
              w.priority AS priority,
              w.due_date AS due_date,
              w.event_id AS event_id,
              ev.name AS event_name,
              ev.sequence AS sequence,
              ev.expected_days AS expected_days,
              ev.outcome_template_id AS outcome_template_id,
              COALESCE(w.disease_id, e.disease_id) AS disease_id,
              d.name AS disease_name,
              p.id AS program_id,
              p.name AS program_name,
              p.code AS program_code,
              e.id AS enrollment_id,
              e.status AS enrollment_status,
              e.assigned_worker AS assigned_worker,
              e.current_event_id AS current_event_id,
              c.id AS citizen_id,
              c.uhid AS uhid,
              c.full_name AS full_name,
              c.age AS age,
              c.gender AS gender,
              c.phone AS phone
       FROM public.worklist_items w
       JOIN public.enrollments e ON e.id = w.enrollment_id
       LEFT JOIN public.events ev ON ev.id = w.event_id
       LEFT JOIN public.diseases d ON d.id = COALESCE(w.disease_id, e.disease_id)
       LEFT JOIN public.programs p ON p.id = COALESCE(w.program_id, e.program_id)
       LEFT JOIN public.citizens c ON c.id = e.citizen_id
       WHERE w.id = $1
       LIMIT 1`,
      [activityId],
    );
    return result.rows[0] ?? null;
  }

  /** The dynamic clinical field definitions from an outcome template. */
  async findTemplate(
    templateId: string,
  ): Promise<{ name: string; fields: ClinicalFieldDef[] } | null> {
    const result = await this.db.query<{ name: string; fields: unknown }>(
      `SELECT name, fields
       FROM public.outcome_templates
       WHERE id = $1 AND is_active = true
       LIMIT 1`,
      [templateId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { name: row.name, fields: ConsultationRepository.normaliseFields(row.fields) };
  }

  /**
   * The configurable outcomes for an event (the worker's selectable consultation
   * outcomes). These drive the Workflow Rules Engine — each maps to a `rules` row.
   */
  async findOutcomeTypes(
    eventId: string,
  ): Promise<{ id: string; code: string; name: string; category: string }[]> {
    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      category: string;
    }>(
      `SELECT id, code, name, category
       FROM public.outcome_types
       WHERE event_id = $1
       ORDER BY
         CASE category WHEN 'POSITIVE' THEN 0 WHEN 'NEUTRAL' THEN 1
                       WHEN 'NEGATIVE' THEN 2 WHEN 'ESCALATION' THEN 3 ELSE 4 END,
         name`,
      [eventId],
    );
    return result.rows;
  }

  /** Resolves one outcome type (validates the worker's selection), or null. */
  async findOutcomeType(
    outcomeTypeId: string,
  ): Promise<{ id: string; code: string; name: string; category: string; event_id: string } | null> {
    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      category: string;
      event_id: string;
    }>(
      `SELECT id, code, name, category, event_id
       FROM public.outcome_types WHERE id = $1 LIMIT 1`,
      [outcomeTypeId],
    );
    return result.rows[0] ?? null;
  }

  /** Next call attempt number for an activity (1-based). */
  async nextAttemptNumber(activityId: string): Promise<number> {
    const result = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.contact_outcomes WHERE worklist_item_id = $1`,
      [activityId],
    );
    return (result.rows[0]?.n ?? 0) + 1;
  }

  /** Logs a contact attempt against the activity. */
  async insertContactOutcome(input: {
    activityId: string;
    contactType: string;
    attemptNumber: number;
    notes: string | null;
    contactedBy: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO public.contact_outcomes
         (worklist_item_id, contact_type, attempt_number, notes, contacted_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.activityId, input.contactType, input.attemptNumber, input.notes, input.contactedBy],
    );
  }

  /** Stores the clinical observation/outcome record; returns its id. */
  async insertOutcomeRecord(input: {
    activityId: string;
    templateId: string;
    outcomeTypeId: string;
    data: unknown;
    recordedBy: string | null;
  }): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO public.outcome_records
         (worklist_item_id, template_id, outcome_type_id, data, recorded_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id`,
      [
        input.activityId,
        input.templateId,
        input.outcomeTypeId,
        JSON.stringify(input.data ?? {}),
        input.recordedBy,
      ],
    );
    return result.rows[0].id;
  }

  // ── Consultation Responses (Milestone 25A, Step 2) ──────────────────────────

  /**
   * Persists the explicit consultation_responses for a saved consultation — the
   * new single source of truth. The caller supplies an abstract, response-type-
   * agnostic collection (`ConsultationResponseInput[]`): one entry per counselling
   * question DISPLAYED during the session, each carrying its own responseStatus
   * (ANSWERED / NOT_ASSESSED / NOT_PRESENTED) and responseValue. This layer makes
   * NO assumption that an answer is "YES" — that translation belongs to the caller
   * (today the checkbox UI adapter in ConsultationService), so future response
   * types (BOOLEAN, NUMBER, CHOICE, TEXT, YES_NO_UNKNOWN) need no persistence
   * redesign.
   *
   * Each row SNAPSHOTS the item's current metadata (question_text, response_type,
   * response_options, risk_category) so a historical consultation stays fully
   * reproducible even if the item is later edited or removed. `triggered_risk`
   * records whether the supplied responseValue matches the item's own configured
   * risk_trigger_values — a per-row fact, NOT a classification decision.
   *
   * This runs ALONGSIDE the existing checkedItemIds dual-read: CDSE classification
   * is untouched. Idempotent via the (outcome_record_id, counselling_item_id)
   * unique index. Returns the number of response rows written.
   */
  async persistConsultationResponses(input: {
    outcomeRecordId: string;
    activityId: string; // worklist_item_id
    citizenId: string;
    responses: ConsultationResponseInput[];
    recordedBy: string | null;
  }): Promise<number> {
    // De-duplicate by item (the unique index allows one row per item per record);
    // keep the first occurrence for a stable result.
    const byItem = new Map<string, ConsultationResponseInput>();
    for (const r of input.responses) {
      if (!byItem.has(r.counsellingItemId)) byItem.set(r.counsellingItemId, r);
    }
    if (byItem.size === 0) return 0;

    // Snapshot the current metadata for every referenced item.
    const itemIds = [...byItem.keys()];
    const meta = await this.db.query<{
      id: string;
      body: string;
      response_type: string;
      response_options: unknown;
      risk_category: string | null;
      risk_trigger_values: unknown;
    }>(
      `SELECT id, body, response_type, response_options, risk_category, risk_trigger_values
       FROM public.counselling_items
       WHERE id = ANY($1)`,
      [itemIds],
    );
    if (meta.rows.length === 0) return 0;

    const rows: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    let written = 0;
    for (const it of meta.rows) {
      const response = byItem.get(it.id);
      if (!response) continue; // item exists but was not among the responses
      const value = response.responseValue;
      const triggers = Array.isArray(it.risk_trigger_values)
        ? (it.risk_trigger_values as unknown[])
        : [];
      const triggeredRisk = value !== null && triggers.includes(value);
      rows.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
      );
      params.push(
        input.outcomeRecordId,
        input.activityId,
        input.citizenId,
        it.id,
        it.body,
        it.response_type,
        it.response_options == null ? null : JSON.stringify(it.response_options),
        response.responseStatus,
        value,
        it.risk_category,
        triggeredRisk,
        input.recordedBy,
      );
      written++;
    }
    if (written === 0) return 0;

    await this.db.query(
      `INSERT INTO public.consultation_responses
         (outcome_record_id, worklist_item_id, citizen_id, counselling_item_id,
          question_text, response_type, response_options, response_status,
          response_value, risk_category, triggered_risk, recorded_by)
       VALUES ${rows.join(', ')}
       ON CONFLICT (outcome_record_id, counselling_item_id) DO UPDATE SET
         question_text    = EXCLUDED.question_text,
         response_type    = EXCLUDED.response_type,
         response_options = EXCLUDED.response_options,
         response_status  = EXCLUDED.response_status,
         response_value   = EXCLUDED.response_value,
         risk_category    = EXCLUDED.risk_category,
         triggered_risk   = EXCLUDED.triggered_risk,
         recorded_by      = EXCLUDED.recorded_by`,
      params,
    );
    return written;
  }

  // ── Consultation Notes (16A) ────────────────────────────────────────────────

  /** Returns the active DRAFT note for an activity, or null. */
  async findLatestDraftNote(activityId: string): Promise<ConsultationNoteDto | null> {
    const result = await this.db.query<NoteRow>(
      `SELECT id, worklist_item_id, outcome_record_id, generated_note,
              note_version, status, recorded_by, created_at, updated_at
       FROM public.consultation_notes
       WHERE worklist_item_id = $1 AND status = 'DRAFT'
       LIMIT 1`,
      [activityId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return ConsultationRepository.toNoteDto(row);
  }

  /**
   * Upserts a DRAFT note for an activity. Uses the partial unique index on
   * (worklist_item_id) WHERE status = 'DRAFT' so only one DRAFT exists at a time.
   * Safe to call frequently (auto-save debounce pattern).
   */
  async upsertDraftNote(
    activityId: string,
    generatedNote: string,
    recordedBy: string | null,
  ): Promise<ConsultationNoteDto> {
    const result = await this.db.query<NoteRow>(
      `INSERT INTO public.consultation_notes
         (worklist_item_id, generated_note, status, recorded_by)
       VALUES ($1, $2, 'DRAFT', $3)
       ON CONFLICT (worklist_item_id) WHERE status = 'DRAFT'
       DO UPDATE SET
         generated_note = EXCLUDED.generated_note,
         recorded_by    = EXCLUDED.recorded_by,
         updated_at     = NOW()
       RETURNING id, worklist_item_id, outcome_record_id, generated_note,
                 note_version, status, recorded_by, created_at, updated_at`,
      [activityId, generatedNote, recordedBy],
    );
    return ConsultationRepository.toNoteDto(result.rows[0]);
  }

  /**
   * Inserts a FINAL note, linking it to the outcome record. The DRAFT for this
   * activity (if any) is left unchanged — workers can view previous drafts in
   * the history panel. FINAL notes are never mutated after creation.
   */
  async insertFinalNote(
    activityId: string,
    generatedNote: string,
    outcomeRecordId: string,
    recordedBy: string | null,
  ): Promise<ConsultationNoteDto> {
    const result = await this.db.query<NoteRow>(
      `INSERT INTO public.consultation_notes
         (worklist_item_id, outcome_record_id, generated_note, status, recorded_by)
       VALUES ($1, $2, $3, 'FINAL', $4)
       RETURNING id, worklist_item_id, outcome_record_id, generated_note,
                 note_version, status, recorded_by, created_at, updated_at`,
      [activityId, outcomeRecordId, generatedNote, recordedBy],
    );
    return ConsultationRepository.toNoteDto(result.rows[0]);
  }

  /**
   * Activity lifecycle writes (status transitions, retries, scheduling) are NOT
   * performed here — they belong to the Activity module and are orchestrated by
   * the Workflow Rules Engine. This repository only records the consultation
   * (outcome_records + contact_outcomes + consultation_notes) and reads
   * context/timeline.
   */

  /** A patient's chronological journey: enrollments and their activities. */
  async findTimeline(citizenId: string): Promise<TimelineRow[]> {
    const result = await this.db.query<TimelineRow>(
      `SELECT * FROM (
         SELECT 'ENROLLMENT'::text AS kind,
                e.id::text AS id,
                COALESCE(p.name, 'Enrollment') AS title,
                p.name AS program,
                e.status AS status,
                COALESCE(e.start_date::timestamptz, e.created_at) AS date,
                NULL::text AS outcome,
                NULL::text AS priority,
                e.created_at AS sort_at
           FROM public.enrollments e
           LEFT JOIN public.programs p ON p.id = e.program_id
           WHERE e.citizen_id = $1
         UNION ALL
         SELECT 'ACTIVITY'::text AS kind,
                w.id::text AS id,
                COALESCE(ev.name, 'Activity') AS title,
                p.name AS program,
                w.status AS status,
                COALESCE(w.outcome_recorded_at, w.due_date::timestamptz, w.created_at) AS date,
                (
                  SELECT COALESCE(orr.data ->> 'outcomeName', orr.data ->> 'consultationStatus')
                  FROM public.outcome_records orr
                  WHERE orr.worklist_item_id = w.id
                  ORDER BY orr.recorded_at DESC
                  LIMIT 1
                ) AS outcome,
                w.priority AS priority,
                w.created_at AS sort_at
           FROM public.worklist_items w
           JOIN public.enrollments e ON e.id = w.enrollment_id
           LEFT JOIN public.events ev ON ev.id = w.event_id
           LEFT JOIN public.programs p ON p.id = COALESCE(w.program_id, e.program_id)
           WHERE e.citizen_id = $1
       ) feed
       ORDER BY date ASC NULLS LAST, sort_at ASC
       LIMIT 200`,
      [citizenId],
    );
    return result.rows;
  }

  /**
   * Returns enriched consultation history for a citizen: one row per activity
   * that has at least one outcome record. Includes the most recent outcome,
   * structured clinical data, and the latest FINAL note if one was generated.
   * Ordered newest-first, limited to 15 entries (history panel use only).
   */
  async findConsultationHistory(citizenId: string): Promise<ConsultationHistoryEntryDto[]> {
    const result = await this.db.query<{
      activity_id: string;
      event_name: string;
      program: string | null;
      date: Date | null;
      activity_status: string;
      outcome_name: string | null;
      outcome_category: string | null;
      clinical_notes: string | null;
      remarks: string | null;
      recorded_by: string | null;
      clinical_data: unknown;
      generated_note: string | null;
    }>(
      `SELECT
         w.id                AS activity_id,
         COALESCE(ev.name, 'Activity')
                             AS event_name,
         p.name              AS program,
         COALESCE(w.outcome_recorded_at,
                  w.due_date::timestamptz,
                  w.created_at)  AS date,
         w.status            AS activity_status,
         ot.name             AS outcome_name,
         ot.category         AS outcome_category,
         orr.data ->> 'clinicalNotes'
                             AS clinical_notes,
         orr.data ->> 'remarks'
                             AS remarks,
         orr.recorded_by     AS recorded_by,
         orr.data            AS clinical_data,
         cn.generated_note   AS generated_note
       FROM public.worklist_items w
       JOIN public.enrollments e ON e.id = w.enrollment_id
       LEFT JOIN public.events ev ON ev.id = w.event_id
       LEFT JOIN public.programs p
         ON p.id = COALESCE(w.program_id, e.program_id)
       LEFT JOIN LATERAL (
         SELECT id, outcome_type_id, data, recorded_by
         FROM public.outcome_records
         WHERE worklist_item_id = w.id
         ORDER BY recorded_at DESC
         LIMIT 1
       ) orr ON true
       LEFT JOIN public.outcome_types ot ON ot.id = orr.outcome_type_id
       LEFT JOIN LATERAL (
         SELECT generated_note
         FROM public.consultation_notes
         WHERE worklist_item_id = w.id AND status = 'FINAL'
         ORDER BY created_at DESC
         LIMIT 1
       ) cn ON true
       WHERE e.citizen_id = $1
         AND orr.id IS NOT NULL
       ORDER BY COALESCE(w.outcome_recorded_at,
                         w.due_date::timestamptz,
                         w.created_at) DESC NULLS LAST
       LIMIT 15`,
      [citizenId],
    );
    return result.rows.map((row) => ({
      activityId: row.activity_id,
      eventName: row.event_name,
      program: row.program,
      date: row.date ? new Date(row.date).toISOString() : null,
      activityStatus: row.activity_status,
      outcomeName: row.outcome_name,
      outcomeCategory: row.outcome_category,
      clinicalNotes: row.clinical_notes,
      remarks: row.remarks,
      recordedBy: row.recorded_by,
      clinicalData: ConsultationRepository.extractFields(row.clinical_data),
      generatedNote: row.generated_note,
    }));
  }

  /**
   * Aggregates the full Clinical Journey for a citizen: enrollments, activity
   * events (with or without outcomes), and consultation notes — all from
   * existing tables, ordered newest first. Read-only; nothing is created or
   * modified. No schema changes required.
   */
  async findClinicalJourney(citizenId: string): Promise<ClinicalJourneyEntryDto[]> {
    const result = await this.db.query<{
      event_type: string;
      id: string;
      activity_status: string | null;
      program: string | null;
      disease: string | null;
      enrollment_status: string | null;
      event_name: string | null;
      date: Date | null;
      outcome_name: string | null;
      outcome_category: string | null;
      clinical_notes: string | null;
      remarks: string | null;
      generated_note: string | null;
      clinical_data: unknown;
      recorded_by: string | null;
      call_count: number;
    }>(
      `SELECT * FROM (
         -- Enrollment events
         SELECT
           'ENROLLMENT'::text                                  AS event_type,
           e.id::text                                          AS id,
           NULL::text                                          AS activity_status,
           p.name                                              AS program,
           d.name                                              AS disease,
           e.status                                            AS enrollment_status,
           NULL::text                                          AS event_name,
           COALESCE(e.start_date::timestamptz, e.created_at)  AS date,
           NULL::text                                          AS outcome_name,
           NULL::text                                          AS outcome_category,
           NULL::text                                          AS clinical_notes,
           NULL::text                                          AS remarks,
           NULL::text                                          AS generated_note,
           NULL::jsonb                                         AS clinical_data,
           NULL::text                                          AS recorded_by,
           0::int                                              AS call_count
         FROM public.enrollments e
         LEFT JOIN public.programs p  ON p.id = e.program_id
         LEFT JOIN public.diseases d  ON d.id = e.disease_id
         WHERE e.citizen_id = $1

         UNION ALL

         -- Activity / Consultation events
         SELECT
           CASE WHEN orr.id IS NOT NULL THEN 'CONSULTATION' ELSE 'ACTIVITY' END AS event_type,
           w.id::text                                                             AS id,
           w.status                                                               AS activity_status,
           p.name                                                                 AS program,
           d.name                                                                 AS disease,
           enr.status                                                             AS enrollment_status,
           ev.name                                                                AS event_name,
           COALESCE(w.outcome_recorded_at,
                    w.due_date::timestamptz,
                    w.created_at)                                                 AS date,
           ot.name                                                                AS outcome_name,
           ot.category                                                            AS outcome_category,
           orr.data ->> 'clinicalNotes'                                          AS clinical_notes,
           orr.data ->> 'remarks'                                                AS remarks,
           cn.generated_note                                                      AS generated_note,
           orr.data                                                               AS clinical_data,
           orr.recorded_by                                                        AS recorded_by,
           COALESCE(co.call_count, 0)::int                                       AS call_count
         FROM public.worklist_items w
         JOIN  public.enrollments enr ON enr.id = w.enrollment_id
         LEFT JOIN public.events ev   ON ev.id  = w.event_id
         LEFT JOIN public.programs p  ON p.id   = COALESCE(w.program_id, enr.program_id)
         LEFT JOIN public.diseases d  ON d.id   = COALESCE(w.disease_id, enr.disease_id)
         LEFT JOIN LATERAL (
           SELECT id, outcome_type_id, data, recorded_by
           FROM public.outcome_records
           WHERE worklist_item_id = w.id
           ORDER BY recorded_at DESC
           LIMIT 1
         ) orr ON true
         LEFT JOIN public.outcome_types ot ON ot.id = orr.outcome_type_id
         LEFT JOIN LATERAL (
           SELECT generated_note
           FROM public.consultation_notes
           WHERE worklist_item_id = w.id AND status = 'FINAL'
           ORDER BY created_at DESC
           LIMIT 1
         ) cn ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS call_count
           FROM public.contact_outcomes
           WHERE worklist_item_id = w.id
         ) co ON true
         WHERE enr.citizen_id = $1
       ) feed
       ORDER BY date DESC NULLS LAST
       LIMIT 100`,
      [citizenId],
    );

    return result.rows.map((row) => {
      const eventType = row.event_type as 'ENROLLMENT' | 'CONSULTATION' | 'ACTIVITY';

      let summary: string;
      if (eventType === 'ENROLLMENT') {
        summary = row.program ? `Enrolled in ${row.program}` : 'Program enrollment';
        if (row.disease) summary += ` · ${row.disease}`;
      } else if (row.outcome_name) {
        summary = row.outcome_name;
        if (row.event_name) summary += ` — ${row.event_name}`;
      } else {
        summary = row.event_name ?? (eventType === 'CONSULTATION' ? 'Consultation' : 'Activity');
      }

      return {
        id: row.id,
        eventType,
        date: row.date ? new Date(row.date).toISOString() : null,
        program: row.program,
        disease: row.disease,
        summary,
        activityStatus: row.activity_status,
        outcomeName: row.outcome_name,
        outcomeCategory: row.outcome_category,
        clinicalNotes: row.clinical_notes,
        remarks: row.remarks,
        generatedNote: row.generated_note,
        clinicalData: ConsultationRepository.extractFields(row.clinical_data),
        recordedBy: row.recorded_by,
        callCount: row.call_count,
        enrollmentStatus: row.enrollment_status,
        eventName: row.event_name,
      } satisfies ClinicalJourneyEntryDto;
    });
  }

  /**
   * Returns the first pending or in-progress worklist activity for a citizen.
   * Used by the Citizens module to check whether a scheduled consultation exists
   * before offering "Continue Scheduled" or "Start New" options.
   */
  async findActiveActivity(citizenId: string): Promise<{
    activity_id: string;
    event_name: string | null;
    program_name: string | null;
  } | null> {
    const result = await this.db.query<{
      activity_id: string;
      event_name: string | null;
      program_name: string | null;
    }>(
      `SELECT wi.id           AS activity_id,
              ev.name         AS event_name,
              p.name          AS program_name
       FROM public.worklist_items wi
       JOIN public.enrollments enr ON enr.id = wi.enrollment_id
       LEFT JOIN public.events ev  ON ev.id  = wi.event_id
       LEFT JOIN public.programs p ON p.id   = COALESCE(wi.program_id, enr.program_id)
       WHERE enr.citizen_id = $1
         AND wi.status IN ('PENDING', 'IN_PROGRESS', 'OVERDUE', 'ESCALATED')
       ORDER BY wi.due_date ASC NULLS LAST
       LIMIT 1`,
      [citizenId],
    );
    return result.rows[0] ?? null;
  }

  /** Extracts the structured clinical `fields` sub-object from outcome_records.data. */
  private static extractFields(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const obj = data as Record<string, unknown>;
    if (obj.fields && typeof obj.fields === 'object' && !Array.isArray(obj.fields)) {
      return obj.fields as Record<string, unknown>;
    }
    return null;
  }

  private static toNoteDto(row: NoteRow): ConsultationNoteDto {
    return {
      id: row.id,
      generatedNote: row.generated_note,
      noteVersion: row.note_version,
      status: row.status as 'DRAFT' | 'FINAL',
      recordedBy: row.recorded_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /** Normalises template fields jsonb into typed defs (tolerant of variants). */
  private static normaliseFields(raw: unknown): ClinicalFieldDef[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((f, i) => {
        const obj = (f ?? {}) as Record<string, unknown>;
        return {
          type: typeof obj.type === 'string' ? obj.type : 'text',
          label: typeof obj.label === 'string' ? obj.label : `Field ${i + 1}`,
          options: Array.isArray(obj.options)
            ? obj.options.filter((o): o is string => typeof o === 'string')
            : [],
          required: obj.required === true,
          sortOrder: typeof obj.sort_order === 'number' ? obj.sort_order : i,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
