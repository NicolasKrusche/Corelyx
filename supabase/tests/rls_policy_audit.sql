-- ============================================================================
-- Corelyx RLS Policy Audit Script
-- ============================================================================
-- Run against any Supabase Postgres database to audit Row-Level Security
-- coverage, identify missing RLS, and flag overly permissive policies.
--
-- Usage:
--   psql "$DATABASE_URL" -f supabase/tests/rls_policy_audit.sql
--   or via Supabase SQL Editor
--
-- Output: Seven report sections with pass/fail indicators.
-- ============================================================================

-- --------------------------------------------------------------------------
-- SECTION 1: Tables WITHOUT RLS (SECURITY RISK)
-- --------------------------------------------------------------------------
-- Any table in the public schema that does NOT have RLS enabled is a risk —
-- service-role or anon access can read/write freely.

DO $$
DECLARE
  _rec RECORD;
  _count INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'SECTION 1: Tables WITHOUT Row-Level Security (SECURITY RISK)';
  RAISE NOTICE '================================================================';

  FOR _rec IN
    SELECT
      t.tablename,
      t.rowsecurity,
      t.forcerowsecurity
    FROM pg_catalog.pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename NOT LIKE 'pg_%'
      AND t.tablename NOT LIKE '__%'
    ORDER BY t.rowsecurity ASC, t.tablename ASC
  LOOP
    IF NOT _rec.rowsecurity THEN
      _count := _count + 1;
      RAISE NOTICE '  [FAIL] Table "%" — RLS DISABLED (force_rls=%)', _rec.tablename, _rec.forcerowsecurity;
    END IF;
  END LOOP;

  IF _count = 0 THEN
    RAISE NOTICE '  [PASS] All public tables have RLS enabled.';
  ELSE
    RAISE NOTICE '  ⚠️  % table(s) without RLS — remediate immediately!', _count;
  END IF;

  RAISE NOTICE '';
END $$;

-- --------------------------------------------------------------------------
-- SECTION 2: Complete RLS Status per Table
-- --------------------------------------------------------------------------
-- Lists every public table with its RLS and FORCE RLS status.

DO $$
DECLARE
  _rec RECORD;
  _total INTEGER := 0;
  _with_rls INTEGER := 0;
  _with_force INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'SECTION 2: RLS Status for All Public Tables';
  RAISE NOTICE '================================================================';

  FOR _rec IN
    SELECT
      t.tablename,
      t.rowsecurity,
      t.forcerowsecurity,
      (SELECT count(*)
       FROM pg_catalog.pg_policies p
       WHERE p.schemaname = 'public'
         AND p.tablename = t.tablename
      ) AS policy_count
    FROM pg_catalog.pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename NOT LIKE 'pg_%'
      AND t.tablename NOT LIKE '__%'
    ORDER BY t.tablename
  LOOP
    _total := _total + 1;
    IF _rec.rowsecurity THEN _with_rls := _with_rls + 1; END IF;
    IF _rec.forcerowsecurity THEN _with_force := _with_force + 1; END IF;

    RAISE NOTICE '  %-35s RLS: %-7s FORCE: %-4s Policies: %',
      _rec.tablename,
      CASE WHEN _rec.rowsecurity THEN 'YES' ELSE 'NO ⚠️' END,
      CASE WHEN _rec.forcerowsecurity THEN 'YES' ELSE 'no' END,
      _rec.policy_count;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '  Total tables: % | RLS enabled: % | FORCE RLS: %',
    _total, _with_rls, _with_force;

  IF _total > _with_rls THEN
    RAISE NOTICE '  [FAIL] % table(s) missing RLS', _total - _with_rls;
  ELSE
    RAISE NOTICE '  [PASS] All % tables have RLS enabled.', _total;
  END IF;

  RAISE NOTICE '';
END $$;

-- --------------------------------------------------------------------------
-- SECTION 3: Policy Detail per Table
-- --------------------------------------------------------------------------
-- Lists every policy with its command type and USING/WITH CHECK expressions.
-- Flags policies that use bare `true` (overly permissive).

DO $$
DECLARE
  _rec RECORD;
  _table_rec RECORD;
  _overly_permissive INTEGER := 0;
  _total_policies INTEGER := 0;
  _using_open BOOLEAN;
  _check_open BOOLEAN;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'SECTION 3: Policy Detail & Overly-Permissive Detection';
  RAISE NOTICE '================================================================';

  FOR _table_rec IN
    SELECT DISTINCT t.tablename
    FROM pg_catalog.pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename NOT LIKE 'pg_%'
      AND t.tablename NOT LIKE '__%'
    ORDER BY t.tablename
  LOOP
    RAISE NOTICE '';
    RAISE NOTICE '  Table: %', _table_rec.tablename;

    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = _table_rec.tablename
    ) THEN
      RAISE NOTICE '    [WARN] No policies defined for this table!';
      CONTINUE;
    END IF;

    FOR _rec IN
      SELECT
        p.policyname,
        p.cmd::text AS command,
        CASE
          WHEN p.cmd = 'ALL' THEN 'ALL ⚠️'
          ELSE p.cmd::text
        END AS command_display,
        p.qual AS using_expr,
        p.with_check AS with_check_expr,
        p.roles::text AS applies_to
      FROM pg_catalog.pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = _table_rec.tablename
      ORDER BY p.cmd, p.policyname
    LOOP
      _total_policies := _total_policies + 1;

      -- Check for overly permissive policies: `true` or `true::boolean` as qualifier
      _using_open := (
        _rec.using_expr IS NULL
        OR trim(_rec.using_expr) = 'true'
        OR trim(_rec.using_expr) = 'true::boolean'
        OR trim(_rec.using_expr) = ''
      );
      _check_open := (
        _rec.with_check_expr IS NULL
        OR trim(_rec.with_check_expr) = 'true'
        OR trim(_rec.with_check_expr) = 'true::boolean'
        OR trim(_rec.with_check_expr) = ''
      );

      -- Only flag NULL USING on non-SELECT policies as concerning
      -- (SELECT with NULL USING means unrestricted read)
      IF _using_open AND _rec.command = 'SELECT' THEN
        _overly_permissive := _overly_permissive + 1;
        RAISE NOTICE '    [WARN] "%" (%) — USING: % | Roles: %',
          _rec.policyname,
          _rec.command_display,
          COALESCE(_rec.using_expr, 'NULL — unrestricted read'),
          _rec.applies_to;
      ELSIF _using_open AND _rec.command = 'ALL' THEN
        _overly_permissive := _overly_permissive + 1;
        RAISE NOTICE '    [WARN] "%" (ALL) — USING: % | Roles: %',
          _rec.policyname,
          COALESCE(_rec.using_expr, 'NULL — unrestricted access'),
          _rec.applies_to;
      ELSE
        RAISE NOTICE '    [OK]   "%" (%) — Roles: %',
          _rec.policyname,
          _rec.command_display,
          _rec.applies_to;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '  Total policies: % | Overly permissive: %',
    _total_policies, _overly_permissive;

  IF _overly_permissive > 0 THEN
    RAISE NOTICE '  [WARN] % policy(ies) appear overly permissive — review for security.', _overly_permissive;
  ELSE
    RAISE NOTICE '  [PASS] No overly permissive policies detected.';
  END IF;

  RAISE NOTICE '';
END $$;

-- --------------------------------------------------------------------------
-- SECTION 4: Policy Coverage Matrix (command types per table)
-- --------------------------------------------------------------------------
-- Shows which CRUD operations are covered by policies for each table.

DO $$
DECLARE
  _rec RECORD;
  _has_select BOOLEAN;
  _has_insert BOOLEAN;
  _has_update BOOLEAN;
  _has_delete BOOLEAN;
  _has_all BOOLEAN;
  _unprotected INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'SECTION 4: Policy Coverage Matrix (CRUD per Table)';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '  %-35s SEL  INS  UPD  DEL  ALL', 'TABLE';
  RAISE NOTICE '  %-35s ---  ---  ---  ---  ---', repeat('-', 35);

  FOR _rec IN
    SELECT t.tablename
    FROM pg_catalog.pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename NOT LIKE 'pg_%'
      AND t.tablename NOT LIKE '__%'
    ORDER BY t.tablename
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = _rec.tablename AND cmd = 'SELECT'
    ) INTO _has_select;

    SELECT EXISTS(
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = _rec.tablename AND cmd = 'INSERT'
    ) INTO _has_insert;

    SELECT EXISTS(
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = _rec.tablename AND cmd = 'UPDATE'
    ) INTO _has_update;

    SELECT EXISTS(
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = _rec.tablename AND cmd = 'DELETE'
    ) INTO _has_delete;

    SELECT EXISTS(
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = _rec.tablename AND cmd = 'ALL'
    ) INTO _has_all;

    RAISE NOTICE '  %-35s %    %    %    %    %',
      _rec.tablename,
      CASE WHEN _has_select THEN ' ✓ ' ELSE ' ✗ ' END,
      CASE WHEN _has_insert THEN ' ✓ ' ELSE ' ✗ ' END,
      CASE WHEN _has_update THEN ' ✓ ' ELSE ' ✗ ' END,
      CASE WHEN _has_delete THEN ' ✓ ' ELSE ' ✗ ' END,
      CASE WHEN _has_all   THEN ' ✓ ' ELSE '   ' END;

    -- Flag tables with no read policy (potential data exposure if RLS is off)
    IF NOT _has_select AND NOT _has_all THEN
      _unprotected := _unprotected + 1;
      RAISE NOTICE '    ⚠️  Table "%" has no SELECT policy — anon may read freely if RLS is OFF.', _rec.tablename;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  IF _unprotected > 0 THEN
    RAISE NOTICE '  [WARN] % table(s) missing SELECT policy.', _unprotected;
  ELSE
    RAISE NOTICE '  [PASS] All tables have at least a SELECT policy.';
  END IF;

  RAISE NOTICE '';
END $$;

-- --------------------------------------------------------------------------
-- SECTION 5: Public/Anon Access Analysis
-- --------------------------------------------------------------------------
-- Detects policies that grant access to 'anon' or 'public' roles.

DO $$
DECLARE
  _rec RECORD;
  _anon_count INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'SECTION 5: Public/Anon Role Access (Potential Data Leak)';
  RAISE NOTICE '================================================================';

  FOR _rec IN
    SELECT
      tablename,
      policyname,
      cmd::text AS command,
      qual AS using_expr
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        'anon'::regrole = ANY(roles)
        OR 'public'::regrole = ANY(roles)
      )
    ORDER BY tablename, policyname
  LOOP
    _anon_count := _anon_count + 1;
    RAISE NOTICE '  [INFO] Table "%" policy "%" — % access for anon/public role',
      _rec.tablename, _rec.policyname, _rec.command;
    RAISE NOTICE '         USING: %', COALESCE(_rec.using_expr, 'NULL');
  END LOOP;

  RAISE NOTICE '';
  IF _anon_count > 0 THEN
    RAISE NOTICE '  [INFO] % policy(ies) grant access to anon/public role — verify intent.', _anon_count;
  ELSE
    RAISE NOTICE '  [PASS] No policies grant access to anon/public role.';
  END IF;

  RAISE NOTICE '';
END $$;

-- --------------------------------------------------------------------------
-- SECTION 6: Vault & Secrets Table Check
-- --------------------------------------------------------------------------
-- Verify that sensitive tables (tokens, secrets, credentials) have strict RLS.

DO $$
DECLARE
  _sensitive_tables TEXT[] := ARRAY[
    'personal_api_tokens',
    'connection_webhook_secrets',
    'credential_locks',
    'auto_recharge_configs',
    'credit_purchases',
    'workspace_env_vars',
    'security_events',
    'security_locks',
    'two_factor_challenges',
    'redemption_codes',
    'redemptions'
  ];
  _tbl TEXT;
  _has_rls BOOLEAN;
  _policy_count INTEGER;
  _missing_rls INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'SECTION 6: Sensitive Table RLS Verification';
  RAISE NOTICE '================================================================';

  FOREACH _tbl IN ARRAY _sensitive_tables
  LOOP
    SELECT t.rowsecurity INTO _has_rls
    FROM pg_catalog.pg_tables t
    WHERE t.schemaname = 'public' AND t.tablename = _tbl;

    SELECT count(*) INTO _policy_count
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = _tbl;

    IF _has_rls IS NULL THEN
      _missing_rls := _missing_rls + 1;
      RAISE NOTICE '  [FAIL] "%": TABLE DOES NOT EXIST — verify migration.', _tbl;
    ELSIF _has_rls THEN
      RAISE NOTICE '  [PASS] "%": RLS=enabled, policies=%', _tbl, _policy_count;
    ELSE
      _missing_rls := _missing_rls + 1;
      RAISE NOTICE '  [FAIL] "%": RLS=DISABLED — CRITICAL SECURITY RISK!', _tbl;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  IF _missing_rls > 0 THEN
    RAISE NOTICE '  [FAIL] % sensitive table(s) have issues!', _missing_rls;
  ELSE
    RAISE NOTICE '  [PASS] All sensitive tables have RLS enabled.';
  END IF;

  RAISE NOTICE '';
END $$;

-- --------------------------------------------------------------------------
-- SECTION 7: Workspace Isolation Check
-- --------------------------------------------------------------------------
-- Verify that workspace-scoped tables use workspace_id or auth.uid() in policies.

DO $$
DECLARE
  _ws_tables TEXT[] := ARRAY[
    'programs', 'runs', 'node_executions', 'connections',
    'trigger_events', 'webhook_endpoints', 'webhook_deliveries',
    'workspace_folders', 'workspace_memberships', 'workspace_invitations',
    'workspace_env_vars', 'devices', 'device_folder_grants',
    'agent_knowledge', 'agent_knowledge_chunks', 'agent_knowledge_links',
    'agent_relations', 'agent_flags', 'agent_reports',
    'file_snapshots', 'file_operations', 'genesis_sessions'
  ];
  _tbl TEXT;
  _has_ws_policy BOOLEAN;
  _not_isolated INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'SECTION 7: Workspace Isolation Verification';
  RAISE NOTICE '================================================================';

  FOREACH _tbl IN ARRAY _ws_tables
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = _tbl
        AND (
          p.qual ILIKE '%workspace_id%'
          OR p.with_check ILIKE '%workspace_id%'
          OR p.qual ILIKE '%auth.uid%'
          OR p.qual ILIKE '%member%'
        )
    ) INTO _has_ws_policy;

    IF _has_ws_policy THEN
      RAISE NOTICE '  [PASS] "%" — workspace/user isolation policy found.', _tbl;
    ELSE
      _not_isolated := _not_isolated + 1;
      RAISE NOTICE '  [WARN] "%" — no workspace_id or auth.uid() check detected in policies.', _tbl;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  IF _not_isolated > 0 THEN
    RAISE NOTICE '  [WARN] % table(s) may lack workspace isolation.', _not_isolated;
  ELSE
    RAISE NOTICE '  [PASS] All workspace tables have proper isolation.';
  END IF;

  RAISE NOTICE '';
END $$;

-- --------------------------------------------------------------------------
-- SECTION 8: FORCE RLS Analysis (Superuser Bypass Protection)
-- --------------------------------------------------------------------------
-- Tables with FORCE ROW LEVEL SECURITY enforce RLS even for table owners.
-- This prevents accidental data exposure through owner-role queries.

DO $$
DECLARE
  _rec RECORD;
  _force_count INTEGER := 0;
  _no_force_count INTEGER := 0;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'SECTION 8: FORCE ROW LEVEL SECURITY Coverage';
  RAISE NOTICE '================================================================';

  FOR _rec IN
    SELECT
      t.tablename,
      t.rowsecurity,
      t.forcerowsecurity
    FROM pg_catalog.pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename NOT LIKE 'pg_%'
      AND t.tablename NOT LIKE '__%'
      AND t.rowsecurity = true
    ORDER BY t.tablename
  LOOP
    IF _rec.forcerowsecurity THEN
      _force_count := _force_count + 1;
      RAISE NOTICE '  [PASS] "%" — FORCE RLS enabled.', _rec.tablename;
    ELSE
      _no_force_count := _no_force_count + 1;
      RAISE NOTICE '  [INFO] "%" — FORCE RLS not enabled (owner can bypass).', _rec.tablename;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '  Tables with FORCE RLS: % | Without: %', _force_count, _no_force_count;

  IF _no_force_count > 0 THEN
    RAISE NOTICE '  [INFO] Consider FORCE RLS on sensitive tables to prevent owner-role bypass.';
  ELSE
    RAISE NOTICE '  [PASS] All tables have FORCE RLS enabled.';
  END IF;

  RAISE NOTICE '';
END $$;

-- --------------------------------------------------------------------------
-- FINAL SUMMARY
-- --------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'AUDIT COMPLETE — Corelyx RLS Policy Audit';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Review sections above for any [FAIL] or [WARN] indicators.';
  RAISE NOTICE '';
  RAISE NOTICE 'Recommended actions:';
  RAISE NOTICE '  1. Fix any [FAIL] items immediately before production launch.';
  RAISE NOTICE '  2. Review [WARN] items for intentional design decisions.';
  RAISE NOTICE '  3. Run this audit after every migration that touches RLS.';
  RAISE NOTICE '  4. Add this to CI/CD pipeline as a migration validation step.';
  RAISE NOTICE '  5. Schedule quarterly re-audits for compliance evidence.';
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
END $$;
