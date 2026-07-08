# DiNC AI Decision-Support Layer — Reference & Port Spec

> **Purpose of this file.** DiNC is the master public-health operations platform.
> A sister project, **HealthOps KM**, built an *explainable AI-assisted
> decision-support layer* that DiNC does not have. This document is the durable
> reference for porting that layer onto DiNC. Drop it in the repo (e.g.
> `docs/AI-LAYER-SPEC.md`) and read it at the start of any AI-layer work session.

---

## 0. TL;DR

Add an **explainable, ML-ready clinical decision-support layer** to DiNC:
- **Risk score (0–100)** with a *why* — on top of DiNC's existing Severe/Moderate/Low.
- **Follow-up default prediction** — probability a citizen misses their next follow-up.
- **Care recommendation engine** — per-citizen "next best actions" linked to guidebooks.
- **Patient Intelligence Panel** — one pane combining all three on the citizen page.
- **Worklist AI prioritisation** — rank/sort/flag by risk & default probability.

It is **additive**. It changes no existing API, permission, workflow rule, scheduler,
or data model. The engines are **hand-weighted, explainable heuristics** — *not trained
ML* — but are wrapped in a swap seam so a real Python ML model can replace them later
with zero UI change.

---

## 1. What HealthOps KM is (context)

HealthOps KM is a patient/population-health management app in the same domain as DiNC
(CPHC / community health, Assam). Stack: pnpm + Turborepo monorepo; NestJS 10 + Prisma
5 + PostgreSQL backend; Next.js 14 (App Router) + React 18 + React Query + Zustand +
Tailwind frontend; a shared `@cphc/shared` package holding pure domain logic.

Most of HealthOps KM's features **already exist in DiNC and are often more built-out**
(bulk import, knowledge hub, guidebooks, master-detail patients, timeline/journey,
dynamic outcomes + call workflow, notifications, reports, admin/workflow-rules,
scheduler). **Do not port those.** The single net-new differentiator is the AI /
intelligence layer described here.

### Honesty statement (carry this into the UI copy)
No ML model was trained. The engines are weighted formulas with manually chosen
weights (e.g. `attendance×26 + priorMissed×20 + …`). The "confidence" value reflects
**data completeness**, not model certainty. Label the UI **"AI-assisted decision
support."** Do not claim trained ML to stakeholders. The value is (a) explainability
and (b) an architecture that a real model can slot into later.

---

## 2. Architecture — the swap seam (why it's "ML-ready")

```
UI  →  Predictor (interface)  →  LocalRuleBasedPredictor   (default, in-process rules)
                               ↘  RemotePredictor          (POST features → Python ML)
```

- `Predictor` interface: `predict(features): Promise<PatientIntelligence>` and optional
  `predictMany(features[])`.
- `LocalRuleBasedPredictor` — default; calls the pure composer `computePatientIntelligence`.
- `RemotePredictor(endpoint, authHeader?)` — POSTs `{ features }` to a future backend
  route (e.g. `POST /intelligence/predict`) that proxies a Python service. Implement it
  but leave it unwired.
- `getPredictor()` / `setPredictor(next)` — swapping rules → ML is **one call, zero UI
  change**. The `PatientIntelligence` object shape **is the contract** the future ML
  service must return.
- This mirrors a provider-abstraction pattern (HealthOps used the same idea for its
  telephony provider). Keep predictions **async** even though rules resolve instantly,
  so the remote path is a drop-in.

The engines themselves are **pure and dependency-free** so they can run in-process now
and be reimplemented in Python later from the same spec.

---

## 3. The engines (exact designs)

### 3.1 Shared primitives (`ai-common`)
- `PredictionEngine = 'rule-based' | 'ml'`
- `MODEL_VERSIONS = { risk:'risk-rules-1.0.0', followup:'followup-rules-1.0.0', care:'care-rules-1.0.0' }`
- `PredictionFactor = { key, label, points, max, active, reason }`
- `PredictionMeta = { engine, modelVersion, generatedAt }`
- `confidenceFromCoverage(present, total, floor=55)` → number 0–100, **capped at 98**.
  Rises with the fraction of expected inputs actually present. This is data
  completeness, NOT certainty.
- `recommendedActionForRisk(level)`:
  | level    | urgency    | label                              | withinHours |
  |----------|------------|------------------------------------|-------------|
  | Critical | Immediate  | Escalate & contact within 24 hours | 24          |
  | High     | Priority   | Call within 24 hours               | 24          |
  | Medium   | Soon       | Contact within 7 days              | 168         |
  | Low      | Routine    | Routine follow-up                  | 720         |
- Small helpers: `nowISO()`, `clamp01`, `pct`, `plural`.

### 3.2 Follow-up Default engine (`predictFollowupDefault`)
**Input** `FollowupInput`:
`{ priorMissed, priorReschedules, attendanceRate (0–1 | null), followUpGapDays (| null),
chronicConditions, age (| null), overdueNow, daysSinceContact (| null), defaulterSignals }`

**Weighted factors** — points sum to the probability; each capped at its weight; weights
sum to 100:

| factor         | weight | fires when…                                  |
|----------------|--------|----------------------------------------------|
| attendance     | 26     | low historical attendance rate               |
| priorMissed    | 20     | missed appointments in history               |
| reschedules    | 14     | prior reschedules                            |
| followUpGap    | 12     | long interval to next follow-up              |
| overdue        | 12     | currently overdue                            |
| contactGap     | 8      | long time since last contact                 |
| multiCondition | 5      | multiple chronic conditions                  |
| age            | 3      | older age band                               |

**Output** `FollowupResult`:
`{ probability 0–100, band, factors[] (with reason, sorted by contribution desc),
priority, confidence, meta }`
- `band`: `Low` (<34) · `Medium` (34–59) · `High` (≥60). (`bandForProbability` helper.)
- `priority`: `{ label, rank }` — **Call Today** (High) / **Call This Week** (Medium) /
  **Routine Outreach** (Low).

**Invariants (add as tests):** probability never exceeds 100; **monotonic** — more
missed appointments must never lower the probability; every active factor has a
non-empty human reason; factor points sum exactly to `probability`.

### 3.3 Care Recommendation engine (`recommendCare`)
**Input** `CareInput`:
`{ riskLevel, riskScore, followupBand, followupProbability, conditions[], overdueCount,
missedFollowups, nonAdherenceSignals, daysSinceContact, severeConditions, hasOpenVisit,
hasOpenCall }`

**Output** `CareResult = { recommendations: CareRecommendation[], priority }` where
`CareRecommendation = { key, action, reason, priority ('High'|'Medium'|'Low'),
factors[] (supporting signals), link?: { kind:'guidebook'|'faq', label, query } }`.

**Rules** — emit each that applies, then sort High → Low priority:
| key                    | fires when…                                       | priority | link |
|------------------------|---------------------------------------------------|----------|------|
| call-today             | high follow-up default OR stale contact           | High     | —    |
| home-visit             | critical risk + non-adherence / very stale contact| High     | —    |
| medication-counselling | non-adherence signals present                     | High/Med | guidebook |
| bp-review              | conditions match hypertension (regex)             | Medium   | guidebook (BP) |
| diet-counselling       | conditions match diabetes (regex)                 | Medium   | guidebook (diabetes) |
| physician-review       | critical risk OR multiple severe conditions       | High     | — |
| check-in               | moderate risk, no urgent driver                   | Low      | — |
| continue               | fallback — nothing urgent, "stay the course"      | Low      | — |

Every recommendation MUST carry a `reason` and ≥1 supporting `factor`.
**Integration rule:** `link` and `action` must deep-link into DiNC's **actual**
guidebooks and worklist actions — do not build a parallel action list that duplicates
DiNC's workflow. Config knobs: `urgentOutreachProbability≈60`, `staleContactDays≈45`.

### 3.4 Explainable Risk (0–100) — augment, don't replace
DiNC already stores Severe/Moderate/Low. Layer a **0–100 score** with ~7 weighted
factors (overdue count, missed follow-ups, condition count, severe conditions, top
priority, escalations, non-adherence / days-since-contact) **summing to 100**, each with
a `reason`. Map score → level so it stays **consistent** with DiNC's categories
(Severe ≈ Critical/High, Moderate ≈ Medium, etc.). **Do not overwrite DiNC's category
field** — add the score/factors/confidence alongside it. Attach `confidence` and
`recommendedActionForRisk(level)` and `modelVersion`.

### 3.5 Composer — Patient Intelligence (`computePatientIntelligence`)
Composes all three. **This shape is the future-ML contract — keep it stable:**
```
PatientIntelligence = {
  risk:     { score, level, factors[], confidence, recommended, modelVersion },
  followup: FollowupResult,
  care:     CareResult,
  confidence: ConfidenceResult,   // blended across engines
  engine:   'rule-based',
  generatedAt: ISOString
}
```

---

## 4. Feature builders (project DiNC's existing data → engine inputs)

Derive all inputs from DiNC's **existing** citizen + enrollment + worklist + outcome +
Clinical-Journey data. No new required schema. Signals to derive:
- age, gender, conditions / comorbidities
- adherence signals, missed follow-ups / calls / visits, overdue counts
- escalations, hospitalisations, previous outcomes
- last visit / last call date, days-since-contact, follow-up interval
- activity completion rate, open visit / open call flags

Provide two builders:
- `buildPatientFeatures(citizen, worklistItems, outcomes, journey)` — full, for the
  citizen detail page.
- `worklistFeatures(rows)` — lighter approximation from loaded worklist rows only (no
  outcome-text signals). **Document the approximation** in a comment.

Also provide a stable `featuresKey(id, features)` string to use as a hook dependency /
memo key.

---

## 5. UI to build

### 5.1 Patient Intelligence Panel (Citizen detail)
Add an **"Intelligence"** section/tab next to DiNC's Profile + Clinical Journey. Contains:
- **Risk gauge** — circular 0–100 with level + a confidence chip.
- **Follow-up default bar** — "X% likely to miss next follow-up" + top reasons.
- **Recommended Actions** — the care recs: action, priority, reason, supporting
  factors, and deep-links into DiNC guidebooks/worklist actions.
- **Top factors** — explainable "why" list for risk and follow-up.
- **Model meta footer** — engine (`rule-based`), model versions, generated-at timestamp.

### 5.2 Reusable badges
- `RiskScoreBadge(score, level)` and `DefaultProbBadge(probability, band)`.
- Put `DefaultProbBadge` on the citizen summary/header too.

### 5.3 Worklist enhancements
- Compute `Map<citizenId, PatientIntelligence>` by grouping worklist rows per citizen.
- **AI Insight column** — risk badge + default badge per row.
- **Sort control** — Default / Highest AI Risk / Highest Default Probability / Highest
  Priority.
- **Presets** — "AI High Risk" and "Needs Attention" (mark with a sparkle icon).
- **Row emphasis** — subtle red tint + left border on High/Severe rows.

All UI must reuse DiNC's own design-system primitives (cards, badges, buttons) — read
neighbouring components first and imitate them.

---

## 6. Guardrails & quality bar

**Preserve:** every existing API, role/permission, the workflow-rules engine, the
scheduler, reports, and admin. Do NOT touch them.

**Explainable-first:** never render a bare score. Always show top factors + reason +
confidence + timestamp + model version.

**Tests (engines are pure — test them):** engaged patient → Low band; defaulter → High
band; monotonicity (more missed → not lower); factor points sum to probability; care
escalation produces call-today + physician-review + medication-counselling for a
critical multi-morbid case; `confidenceFromCoverage` rises with coverage and caps at 98;
`recommendedActionForRisk` maps levels to urgency.

**Process:** explore DiNC and report a concept-mapping + plan BEFORE writing feature
code. Build incrementally; keep the app compiling and lint-clean at each step. When
done, run the build + tests and report what passed, the files added, and the DiNC
concepts you mapped onto.

---

## 7. Suggested build order
1. Explore DiNC; report data-model mapping + plan.
2. `ai-common` primitives + unit tests.
3. `predictFollowupDefault` + tests.
4. `recommendCare` + tests.
5. Explainable risk (0–100) layered over DiNC's category + tests.
6. `computePatientIntelligence` composer + the Predictor seam + hook.
7. Feature builders from DiNC data.
8. Patient Intelligence Panel + badges on the citizen page.
9. Worklist AI column / sort / presets / row emphasis.
10. Build + test + report.
