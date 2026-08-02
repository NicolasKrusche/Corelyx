-- Migration: admin finance — credit funding split + real cash aggregations
-- Created: 2026-08-02
--
-- Why
-- ---
-- /admin/finances called SUM(billed_credits)/1000 "Revenue". That is not
-- revenue, it is *credit value consumed*, and it conflates four things with
-- completely different cash meanings:
--
--   * credits drawn from a paid top-up  → cash, but collected at PURCHASE time
--                                         (consuming it draws down a liability)
--   * credits drawn from a plan's monthly included allowance
--                                       → no cash event at all; the subscription
--                                         was the revenue
--   * credits consumed on the Free tier → no cash event ever; this is customer
--                                         acquisition cost, money strictly out
--   * credits "charged" to admin / unlimited accounts
--                                       → never actually deducted (see
--                                         apps/web/lib/credits.ts: deductUserCredits
--                                         returns true without charging), yet the
--                                         runtime still logs billed_credits
--
-- Worse, billed_credits is DERIVED from cost (ceil(cost * PLATFORM_MARKUP *
-- CREDITS_PER_USD)), so "profit = billed - cost" was the arithmetic identity
-- cost*9 and "margin" was pinned at ~90% forever regardless of how the business
-- actually performed.
--
-- These three functions give the finances page the numbers it actually needs:
-- where consumed credits were funded from, real cash from credit-pack sales,
-- and the outstanding credit liability valued at what users really paid.
--
-- All three are service-role only (SECURITY DEFINER, called with the service
-- client from server components behind hasFounderAccess).

-- ============================================================================
-- 1. Funding split — where did consumed platform credits come from?
-- ============================================================================
--
-- tier_allowances is a JSONB map of tier -> monthly included credits, passed in
-- from apps/web/lib/entitlements.ts so ENTITLEMENTS stays the single source of
-- truth and this function cannot drift from it.
--
-- Included-vs-purchased split: credits drain included-first and the included
-- counter resets monthly (apps/web/lib/credits.ts), so for a calendar-month
-- window a user's first `allowance` credits came from the plan and the rest came
-- from their top-up balance. That is exact for a full-month window and an
-- approximation for any other window — the caller labels it accordingly.
--
-- Tier is read as-of NOW, not as-of consumption. A user who upgraded mid-window
-- is attributed at their current allowance. Acceptable: the alternative is
-- storing the pool split per call, which the deduction RPC does not return.
--
-- BYOK rows are excluded outright — the user's own key paid the provider, so
-- there is no cost of ours to attribute and no credits were charged.

CREATE OR REPLACE FUNCTION admin_llm_funding_split(since TIMESTAMPTZ, tier_allowances JSONB)
RETURNS TABLE (
    bucket            TEXT,
    billed_credits    BIGINT,
    platform_cost_usd NUMERIC,
    user_count        BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH platform_rows AS (
    SELECT
        l.user_id,
        l.billed_credits,
        COALESCE(l.estimated_cost_usd, 0) AS cost
    FROM llm_usage_logs l
    WHERE l.created_at >= since
      AND l.billing = 'platform'
),
-- Real platform cost that never produced a credit charge: Genesis (metered by
-- the genesis_uses quota, logged with billed_credits = 0) and any call whose
-- provider reported no cost. Money out, no credit ledger movement.
unbilled AS (
    SELECT
        'unbilled'::TEXT                    AS bucket,
        0::BIGINT                           AS billed_credits,
        COALESCE(SUM(cost), 0)              AS platform_cost_usd,
        COUNT(DISTINCT user_id)::BIGINT     AS user_count
    FROM platform_rows
    WHERE billed_credits = 0
),
per_user AS (
    SELECT
        r.user_id,
        SUM(r.billed_credits)::BIGINT AS credits,
        SUM(r.cost)                   AS cost
    FROM platform_rows r
    WHERE r.billed_credits > 0
    GROUP BY r.user_id
),
classified AS (
    SELECT
        pu.user_id,
        pu.credits,
        pu.cost,
        -- Mirrors deductUserCredits exactly: admins and the unlimited tier are
        -- never charged, so their billed_credits are notional.
        (p.is_admin IS TRUE OR COALESCE(p.tier, 'free') = 'unlimited') AS comped,
        COALESCE(p.tier, 'free') = 'free'                              AS is_free_tier,
        COALESCE((tier_allowances ->> COALESCE(p.tier, 'free'))::BIGINT, 0) AS allowance
    FROM per_user pu
    LEFT JOIN profiles p ON p.id = pu.user_id
),
allocated AS (
    SELECT
        c.user_id,
        c.comped,
        c.is_free_tier,
        c.credits,
        c.cost,
        CASE WHEN c.comped THEN 0 ELSE LEAST(c.credits, c.allowance) END      AS included_credits,
        CASE WHEN c.comped THEN 0 ELSE GREATEST(c.credits - c.allowance, 0) END AS purchased_credits
    FROM classified c
),
-- Provider cost follows credits proportionally. Exact up to the per-call
-- ceil() rounding in the runtime, because credits are a fixed multiple of cost.
costed AS (
    SELECT
        a.*,
        CASE WHEN a.credits > 0 THEN a.cost * a.included_credits::NUMERIC  / a.credits ELSE 0 END AS included_cost,
        CASE WHEN a.credits > 0 THEN a.cost * a.purchased_credits::NUMERIC / a.credits ELSE 0 END AS purchased_cost
    FROM allocated a
)
SELECT * FROM unbilled
UNION ALL
SELECT
    'comped',
    COALESCE(SUM(credits), 0)::BIGINT,
    COALESCE(SUM(cost), 0),
    COUNT(*)::BIGINT
FROM costed WHERE comped
UNION ALL
SELECT
    'free_included',
    COALESCE(SUM(included_credits), 0)::BIGINT,
    COALESCE(SUM(included_cost), 0),
    COUNT(*) FILTER (WHERE included_credits > 0)::BIGINT
FROM costed WHERE NOT comped AND is_free_tier
UNION ALL
SELECT
    'plan_included',
    COALESCE(SUM(included_credits), 0)::BIGINT,
    COALESCE(SUM(included_cost), 0),
    COUNT(*) FILTER (WHERE included_credits > 0)::BIGINT
FROM costed WHERE NOT comped AND NOT is_free_tier
UNION ALL
SELECT
    'purchased',
    COALESCE(SUM(purchased_credits), 0)::BIGINT,
    COALESCE(SUM(purchased_cost), 0),
    COUNT(*) FILTER (WHERE purchased_credits > 0)::BIGINT
FROM costed WHERE NOT comped;
$$;

COMMENT ON FUNCTION admin_llm_funding_split(TIMESTAMPTZ, JSONB) IS
  'Splits consumed platform credits by funding source (unbilled / comped / free_included / plan_included / purchased) with the provider cost attributable to each. Admin only.';

-- ============================================================================
-- 2. Credit pack sales — real cash, exactly as charged
-- ============================================================================
--
-- credit_purchases.price_usd is what Stripe actually collected. It is NOT
-- amount_credits/1000: the 25 and 50 dollar packs carry +5% / +10% bonus
-- credits (apps/web/lib/credit-packs.ts), so the realized rate is 1050 and 1100
-- credits per USD respectively. Valuing consumption at a flat 1000/USD
-- overstates by 5-10% for every credit bought from a bonus pack, which is why
-- the finances page reads cash from here instead of inferring it from credits.

CREATE OR REPLACE FUNCTION admin_credit_sales(since TIMESTAMPTZ)
RETURNS TABLE (
    purchase_count  BIGINT,
    distinct_buyers BIGINT,
    gross_usd       NUMERIC,
    refunded_usd    NUMERIC,
    credits_sold    BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT
        COUNT(*) FILTER (WHERE status = 'completed')::BIGINT,
        COUNT(DISTINCT user_id) FILTER (WHERE status = 'completed')::BIGINT,
        COALESCE(SUM(price_usd) FILTER (WHERE status = 'completed'), 0),
        COALESCE(SUM(price_usd) FILTER (WHERE status = 'refunded'), 0),
        COALESCE(SUM(amount_credits) FILTER (WHERE status = 'completed'), 0)::BIGINT
    FROM credit_purchases
    WHERE created_at >= since;
$$;

COMMENT ON FUNCTION admin_credit_sales(TIMESTAMPTZ) IS
  'Real cash from credit-pack purchases in a window, read from credit_purchases.price_usd (never inferred from credits — bonus packs break the 1000:1 rate). Admin only.';

-- ============================================================================
-- 3. Outstanding credit liability
-- ============================================================================
--
-- Credits users have paid for but not yet consumed: cash already collected for
-- service not yet delivered. Valued at the blended rate users actually paid
-- (lifetime price_usd / amount_credits across all completed purchases) rather
-- than a nominal 1000/USD, so bonus-pack credits are carried at their true
-- ~0.91-0.95 USD per 1000.
--
-- Only the purchased pool counts. Unused plan allowance is not a liability —
-- it expires monthly and was never separately paid for.

CREATE OR REPLACE FUNCTION admin_credit_liability()
RETURNS TABLE (
    outstanding_credits   BIGINT,
    holder_count          BIGINT,
    realized_usd_per_1k   NUMERIC,
    liability_usd         NUMERIC
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH outstanding AS (
    SELECT
        COALESCE(SUM(purchased_credits), 0)::BIGINT AS credits,
        COUNT(*) FILTER (WHERE purchased_credits > 0)::BIGINT AS holders
    FROM profiles
),
rate AS (
    -- Fall back to the nominal 1000 credits = $1 until the first pack is sold.
    SELECT CASE
        WHEN COALESCE(SUM(amount_credits), 0) > 0
            THEN SUM(price_usd) * 1000.0 / SUM(amount_credits)
        ELSE 1.0
    END AS usd_per_1k
    FROM credit_purchases
    WHERE status = 'completed'
)
SELECT
    o.credits,
    o.holders,
    ROUND(r.usd_per_1k, 6),
    ROUND(o.credits * r.usd_per_1k / 1000.0, 6)
FROM outstanding o CROSS JOIN rate r;
$$;

COMMENT ON FUNCTION admin_credit_liability() IS
  'Unconsumed purchased credits valued at the blended rate users actually paid (bonus packs included). Deferred revenue, not income. Admin only.';

-- ============================================================================
-- Grants — service role only. These read across every user's billing data and
-- must never be reachable from an anon or authenticated PostgREST call.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION admin_llm_funding_split(TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_credit_sales(TIMESTAMPTZ)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_credit_liability()                    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_llm_funding_split(TIMESTAMPTZ, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION admin_credit_sales(TIMESTAMPTZ)             TO service_role;
GRANT EXECUTE ON FUNCTION admin_credit_liability()                    TO service_role;
