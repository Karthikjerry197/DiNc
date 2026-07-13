-- ─────────────────────────────────────────────────────────────────────────────
-- Contextual Guidebook Navigation — schema + seed (Milestone 42)
--
-- Creates the CONFIGURABLE guidebook mapping table and seeds it, plus refreshes
-- placeholder guidebook summaries with meaningful clinical text.
--
-- The application NEVER hardcodes programme/disease/guidebook associations — the
-- worklist/dashboard resolver reads them from `public.guidebook_mappings`. The
-- backend queries this table defensively (falling back to the legacy
-- `guide_rules` text rules if it is absent), so the app keeps working before and
-- after this script is applied.
--
-- SAFE TO RUN REPEATEDLY: all DDL is IF NOT EXISTS, all seed INSERTs use
-- ON CONFLICT DO NOTHING, and the summary UPDATE only touches placeholder rows.
-- Review before running; nothing here is executed automatically.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Configurable mapping table ────────────────────────────────────────────────
--    scope decides which entity id is used:
--      PROGRAMME → program_id, DISEASE → disease_id, EVENT → event_id.
--    priority: lower number = higher priority (opened first; the rest become
--    "Related Guidebooks"). EVENT is future-ready — a worklist item already
--    carries an event, so event-level rows resolve automatically once added.
CREATE TABLE IF NOT EXISTS public.guidebook_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         VARCHAR(20) NOT NULL CHECK (scope IN ('PROGRAMME', 'DISEASE', 'EVENT')),
  program_id    UUID REFERENCES public.programs(id)   ON DELETE CASCADE,
  disease_id    UUID REFERENCES public.diseases(id)   ON DELETE CASCADE,
  event_id      UUID REFERENCES public.events(id)     ON DELETE CASCADE,
  guidebook_id  UUID NOT NULL REFERENCES public.guidebooks(id) ON DELETE CASCADE,
  priority      INTEGER NOT NULL DEFAULT 100,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly the scope's own entity id is set; the other two are NULL.
  CONSTRAINT guidebook_mappings_scope_target CHECK (
    (scope = 'PROGRAMME' AND program_id IS NOT NULL AND disease_id IS NULL     AND event_id IS NULL) OR
    (scope = 'DISEASE'   AND disease_id IS NOT NULL AND program_id IS NULL     AND event_id IS NULL) OR
    (scope = 'EVENT'     AND event_id   IS NOT NULL AND program_id IS NULL     AND disease_id IS NULL)
  )
);

-- Prevent duplicate mappings for the same target + guidebook, per scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gbmap_programme
  ON public.guidebook_mappings (program_id, guidebook_id) WHERE scope = 'PROGRAMME';
CREATE UNIQUE INDEX IF NOT EXISTS uq_gbmap_disease
  ON public.guidebook_mappings (disease_id, guidebook_id) WHERE scope = 'DISEASE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_gbmap_event
  ON public.guidebook_mappings (event_id, guidebook_id)   WHERE scope = 'EVENT';

-- Fast context lookups.
CREATE INDEX IF NOT EXISTS idx_gbmap_program ON public.guidebook_mappings (program_id) WHERE scope = 'PROGRAMME';
CREATE INDEX IF NOT EXISTS idx_gbmap_disease ON public.guidebook_mappings (disease_id) WHERE scope = 'DISEASE';
CREATE INDEX IF NOT EXISTS idx_gbmap_event   ON public.guidebook_mappings (event_id)   WHERE scope = 'EVENT';

-- 2) Seed structured mappings from the EXISTING curated text rules ─────────────
--    This bridges the current `guide_rules` regex configuration into the new
--    structured table, keyed to real programme/disease/event ids — no ids are
--    hardcoded here. priority carries over from the rule's sort_order. Runs only
--    if guide_rules exists. Admins can add/adjust rows afterwards.
DO $$
BEGIN
  IF to_regclass('public.guide_rules') IS NOT NULL THEN

    -- Programme → Guidebook
    INSERT INTO public.guidebook_mappings (scope, program_id, guidebook_id, priority)
    SELECT 'PROGRAMME', p.id, g.id, MIN(gr.sort_order)
    FROM public.programs p
    JOIN public.guide_rules gr
      ON (COALESCE(p.name, '') || ' ' || COALESCE(p.code, '')) ~* gr.pattern
    JOIN public.guidebooks g ON g.id = gr.guidebook_id AND g.is_active = true
    WHERE p.is_active = true
    GROUP BY p.id, g.id
    ON CONFLICT DO NOTHING;

    -- Disease → Guidebook
    INSERT INTO public.guidebook_mappings (scope, disease_id, guidebook_id, priority)
    SELECT 'DISEASE', d.id, g.id, MIN(gr.sort_order)
    FROM public.diseases d
    JOIN public.guide_rules gr
      ON (COALESCE(d.name, '') || ' ' || COALESCE(d.code, '')) ~* gr.pattern
    JOIN public.guidebooks g ON g.id = gr.guidebook_id AND g.is_active = true
    WHERE d.is_active = true
    GROUP BY d.id, g.id
    ON CONFLICT DO NOTHING;

    -- Event → Guidebook (future-ready; seeded where an event name matches a rule)
    INSERT INTO public.guidebook_mappings (scope, event_id, guidebook_id, priority)
    SELECT 'EVENT', ev.id, g.id, MIN(gr.sort_order)
    FROM public.events ev
    JOIN public.guide_rules gr ON COALESCE(ev.name, '') ~* gr.pattern
    JOIN public.guidebooks g ON g.id = gr.guidebook_id AND g.is_active = true
    WHERE ev.is_active = true
    GROUP BY ev.id, g.id
    ON CONFLICT DO NOTHING;

  END IF;
END $$;

-- 3) Replace placeholder guidebook summaries with meaningful clinical text ─────
--    Data-driven: derives a 2-line purpose/when-to-use summary from each
--    guidebook's own title and category. Touches ONLY placeholder / empty /
--    stub rows — real curated summaries are never overwritten. Edit individual
--    rows afterwards if you want bespoke wording.
UPDATE public.guidebooks g
SET summary =
      'Clinical guidance for ' || g.title || '. '
   || 'Use this guidebook during ' || lower(g.category)
   || ' care to standardise assessment, counselling, and referral decisions for enrolled citizens.',
    updated_at = now()
WHERE g.summary IS NULL
   OR btrim(g.summary) = ''
   OR length(btrim(g.summary)) < 25
   OR g.summary ILIKE '%placeholder%'
   OR g.summary ILIKE '%coming soon%'
   OR g.summary ILIKE '%lorem%'
   OR g.summary ILIKE '%tbd%'
   OR g.summary ILIKE '%to be added%'
   OR g.summary ILIKE '%to be updated%';

-- 4) Verify (optional) ─────────────────────────────────────────────────────────
-- SELECT scope, count(*) FROM public.guidebook_mappings GROUP BY scope ORDER BY scope;
-- SELECT code, left(summary, 80) AS summary_preview FROM public.guidebooks ORDER BY category, title;
