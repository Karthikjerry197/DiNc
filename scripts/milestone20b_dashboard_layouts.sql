-- Milestone 20B — Dashboard Layouts
-- Stores one layout row per role. Administrators update rows via the API;
-- every user with that role sees the updated layout automatically.
-- Default layouts are seeded here so no TypeScript fallback is needed.

CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  role        VARCHAR(50)  PRIMARY KEY,
  layout      JSONB        NOT NULL DEFAULT '[]',
  updated_by  VARCHAR(100),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Default layouts seeded by role.
-- ON CONFLICT DO NOTHING so existing admin customisations survive re-runs.
INSERT INTO public.dashboard_layouts (role, layout) VALUES

('ADMIN', '[
  {"widgetId":"quick-actions","visible":true,"collapsed":false},
  {"widgetId":"kpi-cards","visible":true,"collapsed":false},
  {"widgetId":"worklist","visible":true,"collapsed":false},
  {"widgetId":"programs","visible":true,"collapsed":false},
  {"widgetId":"services","visible":true,"collapsed":false},
  {"widgetId":"activity","visible":true,"collapsed":false}
]'::jsonb),

('CLINICIAN', '[
  {"widgetId":"worklist","visible":true,"collapsed":false},
  {"widgetId":"kpi-cards","visible":true,"collapsed":false},
  {"widgetId":"programs","visible":true,"collapsed":false}
]'::jsonb),

('CARE_ASSISTANT', '[
  {"widgetId":"quick-actions","visible":true,"collapsed":false},
  {"widgetId":"worklist","visible":true,"collapsed":false}
]'::jsonb),

('ANM', '[
  {"widgetId":"quick-actions","visible":true,"collapsed":false},
  {"widgetId":"worklist","visible":true,"collapsed":false},
  {"widgetId":"programs","visible":true,"collapsed":false}
]'::jsonb)

ON CONFLICT (role) DO NOTHING;
