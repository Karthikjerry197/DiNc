# DiNC v1.8 — Post-Deployment Verification Report

**Mode:** read-only verification of the deployed database. No objects created, no data changed, no SQL artifacts generated — catalog and count queries only.
**Target:** the PostgreSQL 16.2 instance carrying the audited v1.8 deployment.
**Result: ALL 8 VERIFICATION TASKS PASS.**

## 1. Schemas — PASS (4/4)
`dinc_metadata`, `dinc_runtime`, `dinc_security`, `dinc_audit` all exist.

## 2. Metadata tables — PASS (22/22)
All 21 workbook-derived tables present (`programme`, `event`, `activity`, `schedule_rule`, `schedule_rule_override`, `outcome_template`, `outcome_template_field`, `call_outcome`, `event_call_outcome`, `call_outcome_rule`, `guidebook`, `guidebook_section`, `guidebook_discovery_rule`, `guidebook_mapping`, `faq`, `faq_mapping`, `nutrition_advice`, `nutrition_advice_mapping`, `training_module`, `training_module_mapping`, `enum_reference`) plus the approved `metadata_release` provenance table.

## 3. Runtime tables — PASS (9/9)
`patient`, `programme_enrolment`, `patient_condition`, `event_instance`, `activity_instance`, `outcome_response`, `call_log`, `followup_task`, `notification`. All empty, as expected pre-launch (runtime-generated category).

## 4. Security tables — PASS (1/1)
`dinc_security.app_user` (operationally provisioned; empty as expected).

## 5. Audit tables — PASS (1/1)
`dinc_audit.audit_log` (append-only ledger; empty as expected).

## 6. Resolver views — PASS (7/7)
`v_schedule_rule_effective`, `v_event_call_outcome_resolved`, `v_call_outcome_rule_resolved`, `v_guidebook_placement`, `v_faq_placement`, `v_nutrition_advice_placement`, `v_training_module_placement`.

## 7. Metadata row counts vs frozen v1.8 workbook — PASS (22/22 MATCH)

| Table | DB | Workbook | | Table | DB | Workbook | |
|---|---|---|---|---|---|---|---|
| enum_reference | 21 | 21 | ✓ | guidebook | 15 | 15 | ✓ |
| programme | 12 | 12 | ✓ | guidebook_section | 45 | 45 | ✓ |
| event | 65 | 65 | ✓ | guidebook_discovery_rule | 15 | 15 | ✓ |
| activity | 193 | 193 | ✓ | guidebook_mapping | 16 | 16 | ✓ |
| schedule_rule | 65 | 65 | ✓ | faq | 27 | 27 | ✓ |
| schedule_rule_override | 3 | 3 | ✓ | faq_mapping | 27 | 27 | ✓ |
| outcome_template | 193 | 193 | ✓ | nutrition_advice | 45 | 45 | ✓ |
| outcome_template_field | 193 | 193 | ✓ | nutrition_advice_mapping | 51 | 51 | ✓ |
| call_outcome | 6 | 6 | ✓ | training_module | 6 | 6 | ✓ |
| event_call_outcome | 6 | 6 | ✓ | training_module_mapping | 7 | 7 | ✓ |
| call_outcome_rule | 6 | 6 | ✓ | metadata_release | 1 | 1 | ✓ |

**Total: 1,018 rows = 1,018 expected** (1,017 workbook rows + 1 provenance row). Enum_reference is 21 by design: the workbook's `condition_code | (null)` documentation row is intentionally not loaded (NULL semantics are documented, not stored as a lookup value).

## Supplementary confirmations (read-only)
- **Provenance:** `metadata_release` records `v1.8`, workbook SHA-256 `c25641bbcb77fbf2…` — the running database can state which frozen specification it embodies.
- **Validation suite re-run:** 54 checks, **0 violations** (consistent with the deployment-time gate).
- Earlier audits additionally proved the seeded contents are **cell-identical** to the workbook (roundtrip diff) — row counts above are the summary confirmation, not the only evidence.

**Conclusion:** the deployed database structurally and numerically matches the approved design and the frozen `DiNC_Metadata_Master_v1.8.xlsx` exactly. Nothing was modified during verification.
