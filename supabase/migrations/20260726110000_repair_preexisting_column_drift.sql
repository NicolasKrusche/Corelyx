-- 2026-07-26 — schema repair: three columns their migrations define but the
-- live database never got. Found by diffing every column in the migration
-- history against the live schema, rather than by waiting for the next error.
--
-- These are independent of the 2026-07-19..25 feature batch. They are older
-- drift, and the batch does not touch them, so applying the batch alone would
-- leave them broken.
--
--   profiles.analytics_opt_out      <- 20260604150000_analytics_opt_out.sql
--   runs.llm_token_count            <- 20260111120000_launch_readiness.sql
--   runs.node_execution_count       <- 20260111120000_launch_readiness.sql
--
-- 20260111120000 is only partially applied: it also defines
-- llm_usage_logs.run_id / .workspace_id (repaired in 20260722110000) and these
-- two `runs` counters. The table it creates exists, so a re-run of its
-- `CREATE TABLE IF NOT EXISTS` is a no-op and never adds the missing columns —
-- IF NOT EXISTS guarantees the table, not its shape.


-- ─── profiles.analytics_opt_out ─────────────────────────────────────────────
-- This one is actively broken, not merely absent. /api/settings/analytics both
-- reads and writes it:
--
--   GET  .select("analytics_opt_out")            -> PostgREST errors, data is
--        null, and the route reports opt_out: false — so a user who has opted
--        out reads back as opted IN.
--   PUT  .update({ analytics_opt_out: ... })     -> errors, so the preference is
--        silently discarded and never persists.
--
-- It is a privacy preference, so the failure mode is the wrong direction:
-- silently treating an opted-out user as consenting.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS analytics_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.analytics_opt_out IS
  'User has opted out of product analytics. Server-managed via /api/settings/analytics.';

-- The 20260725130000 hardening revoked blanket write privileges on profiles and
-- re-granted only the self-editable columns. analytics_opt_out is deliberately
-- NOT added to that grant list: the route writes it with the service client, so
-- it stays server-managed like every other privileged profile column. The
-- guard trigger from that migration does not name it either, which is correct —
-- clients cannot write it at all, so there is nothing to guard.


-- ─── runs.llm_token_count / runs.node_execution_count ───────────────────────
-- Denormalised counters from 20260111120000. No code reads or writes them today
-- (grepped across apps/web and apps/runtime), so this is purely to make the
-- database match its own migration history and keep the drift audit clean —
-- future code that expects them will find them.
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS llm_token_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS node_execution_count INTEGER NOT NULL DEFAULT 0;
