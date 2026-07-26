-- 2026-07-26 — fix billing RLS policies that were open to every authenticated user.
--
-- 20260723150000_hybrid_pricing_billing.sql created three policies whose names
-- and comments say "only service_role", but which have no `TO` clause. Postgres
-- defaults a policy's role list to PUBLIC, and permissive policies are OR'd
-- together — so each of these overrode the carefully scoped policy above it and
-- granted the access to `authenticated` as well:
--
--   CREATE POLICY "service role manages subscriptions"
--     ON org_subscriptions FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "service role insert usage"
--     ON usage_records FOR INSERT WITH CHECK (true);
--
-- Concretely, any signed-in user could hit PostgREST with their own JWT and
-- read, modify or delete ANY organization's subscription row — including
-- setting their own org's plan_id to the top plan, pushing current_period_end
-- years out, or flipping status to 'active' — and could fabricate usage_records
-- rows against any org.
--
-- The policies were never needed in the first place: service_role holds
-- BYPASSRLS, so it is unaffected by RLS entirely, and every billing route
-- (/api/billing/{subscription,usage,plans}, the Stripe webhooks) already goes
-- through createServiceClient(). Dropping them restores the intent.
--
-- 20260724160000_approval_sla_escalation.sql shows the correct form for
-- comparison: `USING (auth.role() = 'service_role')`.


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 1 — org_subscriptions
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "service role manages subscriptions" ON org_subscriptions;

-- Also drop the org-manager UPDATE policy. It is the same class of hole one
-- level down: RLS is row-granular, so "a manager may update their org's
-- subscription row" means a manager may rewrite every column of it — plan_id,
-- status, seats_count, current_period_end, stripe_subscription_id. That is a
-- self-serve upgrade to any plan, for free, straight from the browser console.
--
-- A subscription row is Stripe-owned state. It is written by the checkout route
-- and the Stripe webhook under service_role, and never by a client: there is no
-- non-service-role write to org_subscriptions anywhere in apps/web. Making the
-- table read-only to clients costs the app nothing.
DROP POLICY IF EXISTS "org managers update subscriptions" ON org_subscriptions;

-- What remains: "org members read subscriptions" (SELECT via is_org_member).
-- No INSERT/UPDATE/DELETE policy exists, so RLS denies all three for clients.


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 2 — usage_records
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "service role insert usage" ON usage_records;

-- What remains: "org members read usage" (SELECT via is_org_member). Usage rows
-- are written by the runtime under service_role.


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 3 — belt and braces
--
-- Strip the table-level write grants as well, so these tables stay read-only to
-- clients even if a permissive policy is reintroduced later. This mirrors
-- 20260725130000_client_write_privilege_hardening.sql, and is the reason that
-- migration's protections could not be undone by a single stray policy.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE ON
  public.org_subscriptions,
  public.usage_records,
  public.billing_plans
FROM anon, authenticated;

-- billing_plans is the price list. It already had only a SELECT policy, but the
-- default Supabase grants still handed authenticated table-level write
-- privileges, so revoke those too — a user rewriting seat_price_monthly or
-- flipping is_active would corrupt the public pricing page.
