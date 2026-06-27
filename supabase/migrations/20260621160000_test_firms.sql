-- Test firms: an explicit, admin-curated registry of firms that granted us inbox
-- access for testing. A firm is NOT inferred from having a Thunderbird (or any)
-- connection — regular users connect those too — so designation is a deliberate
-- admin action recorded here, keyed by workspace.

CREATE TABLE IF NOT EXISTS public.test_firms (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label        TEXT,
  notes        TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS enabled with NO policy → only the service role (the admin API) can read or
-- write. Test-firm designation must never be self-serve.
ALTER TABLE public.test_firms ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.test_firms IS
  'Admin-curated registry of firms granting inbox access for testing (keyed by workspace). Never inferred from connectors.';
