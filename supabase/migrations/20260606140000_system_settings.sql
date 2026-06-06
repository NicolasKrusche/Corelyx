-- Global, runtime-mutable system settings (maintenance mode, feature kill
-- switches). A single key/value row read by middleware lets us flip maintenance
-- mode on/off WITHOUT a redeploy — the value lives in the database, not in a
-- Vercel env var (which would require a rebuild to change).
--
-- RLS is enabled with NO policies, so only the service-role key (used server-
-- side and in middleware) can read or write this table. Anon/authenticated
-- clients get nothing.

CREATE TABLE IF NOT EXISTS public.system_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Seed the global flags row used by the maintenance gate.
INSERT INTO public.system_settings (key, value)
VALUES (
  'flags',
  '{"maintenanceMode": false, "maintenanceMessage": null, "disableGenesis": false, "disableExecution": false, "disabledAreas": []}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
