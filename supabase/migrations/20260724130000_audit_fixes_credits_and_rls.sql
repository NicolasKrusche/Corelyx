-- 2026-07-24 audit fix batch — combined migration.
-- Bundles three independent, order-agnostic changes:
--   Section 1 (W6)  — atomic included/purchased credit split inside the RPC.
--   Section 2 (S1)  — role-aware RLS for devices + device_folder_grants.
--   Section 3 (S2)  — role-aware RLS for agent_knowledge{,_chunks,_links}.
-- Sections 2 and 3 reuse the is_workspace_member / is_workspace_contributor
-- helpers from 20240020 / 20240021.


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 1 (W6): compute the included/purchased credit split INSIDE
-- deduct_user_credits_raw, under the row lock, instead of in the app from a
-- pre-lock snapshot.
--
-- Before this, lib/credits.ts read the balance, computed how much to draw from
-- the monthly "included" allowance vs the "purchased" pool, then passed both
-- figures to the RPC. Two concurrent deductions both read the same snapshot and
-- both computed the same "from_included" amount; whichever ran second could then
-- ask to spend included allowance that the first had already consumed, and the
-- function's `included_used + add > limit` guard failed it as "insufficient
-- credits" even though the purchased pool could have covered it — spuriously
-- failing a workflow step.
--
-- The function now takes only the TOTAL to deduct plus the plan's included
-- limit, and derives the split after taking `FOR UPDATE` on the row, so the
-- decision always reflects the true current balances. The caller is simplified
-- to match (see lib/credits.ts). The legacy USD-denominated path (pre
-- 20260531150000) is untouched — that DECIMAL-signature function was already
-- dropped, and lib/credits.ts only reaches the legacy branch on databases that
-- never ran the credit-unit migration.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.deduct_user_credits_raw(UUID, BIGINT, BIGINT, BIGINT);

CREATE OR REPLACE FUNCTION public.deduct_user_credits_raw(
  p_user_id        UUID,
  p_amount         BIGINT,
  p_included_limit BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_included_used  BIGINT;
  v_purchased      BIGINT;
  v_available_incl BIGINT;
  v_from_included  BIGINT;
  v_from_purchased BIGINT;
BEGIN
  IF p_amount < 0 OR p_included_limit < 0 THEN
    RETURN FALSE;
  END IF;
  IF p_amount = 0 THEN
    RETURN TRUE;
  END IF;

  SELECT included_credits_used, purchased_credits
  INTO v_included_used, v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Split derived here, holding the row lock, so it reflects the true current
  -- balances rather than a caller snapshot. Included allowance is drained first,
  -- then the never-expiring purchased pool covers the remainder.
  v_available_incl := GREATEST(0, p_included_limit - v_included_used);
  v_from_included  := LEAST(p_amount, v_available_incl);
  v_from_purchased := p_amount - v_from_included;

  IF v_purchased < v_from_purchased THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
  SET included_credits_used = included_credits_used + v_from_included,
      purchased_credits     = purchased_credits - v_from_purchased
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_user_credits_raw(UUID, BIGINT, BIGINT) FROM PUBLIC;
-- The server calls this via the service_role key (createServiceClient → PostgREST
-- rpc). Supabase's default privileges normally re-grant EXECUTE to service_role
-- for migration-created functions, but grant it explicitly so callability never
-- depends on that ambient behavior — this is money-path code.
GRANT EXECUTE ON FUNCTION public.deduct_user_credits_raw(UUID, BIGINT, BIGINT) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 2 (S1): role-aware RLS for devices + device_folder_grants.
--
-- Both tables shipped with a role-blind `FOR ALL USING (workspace membership)`
-- policy and no WITH CHECK, so any workspace member — including a read-only
-- viewer — could INSERT/UPDATE/DELETE rows by hitting PostgREST directly with
-- their own JWT (the browser holds the anon key). For device_folder_grants that
-- means a viewer could widen a device's filesystem sandbox (e.g. add a
-- C:\ read_write grant), which the desktop Bridge would then honor for
-- agent/workflow file nodes. The app routes already block viewers; this brings
-- the database's own enforcement in line.
--
-- Replace with the role-aware split used for connections/api_keys (20240021):
-- every member may SELECT; only contributors (owner/admin/member, not viewer)
-- may INSERT/UPDATE/DELETE, with WITH CHECK so a contributor can't write a row
-- into a workspace they don't contribute to.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── devices ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "workspace members manage devices" ON public.devices;

CREATE POLICY "members read devices" ON public.devices
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "contributors insert devices" ON public.devices
  FOR INSERT WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors update devices" ON public.devices
  FOR UPDATE USING (public.is_workspace_contributor(workspace_id))
  WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors delete devices" ON public.devices
  FOR DELETE USING (public.is_workspace_contributor(workspace_id));

-- ─── device_folder_grants ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "workspace members manage device_folder_grants"
  ON public.device_folder_grants;

CREATE POLICY "members read device_folder_grants" ON public.device_folder_grants
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "contributors insert device_folder_grants" ON public.device_folder_grants
  FOR INSERT WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors update device_folder_grants" ON public.device_folder_grants
  FOR UPDATE USING (public.is_workspace_contributor(workspace_id))
  WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors delete device_folder_grants" ON public.device_folder_grants
  FOR DELETE USING (public.is_workspace_contributor(workspace_id));


-- ═══════════════════════════════════════════════════════════════════════════
-- Section 3 (S2): role-aware RLS for agent_knowledge, agent_knowledge_chunks,
-- agent_knowledge_links.
--
-- All three shipped with a role-blind `FOR ALL USING (workspace membership)`
-- policy and no WITH CHECK, so any workspace member — including a read-only
-- viewer — could edit or delete workspace knowledge (and its chunks/links cascade)
-- straight through PostgREST with their own JWT. Bring the database in line with
-- the app layer (contributor-only writes) using the same member-read /
-- contributor-write split as connections/api_keys (20240021).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── agent_knowledge ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "workspace members manage agent_knowledge" ON public.agent_knowledge;

CREATE POLICY "members read agent_knowledge" ON public.agent_knowledge
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "contributors insert agent_knowledge" ON public.agent_knowledge
  FOR INSERT WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors update agent_knowledge" ON public.agent_knowledge
  FOR UPDATE USING (public.is_workspace_contributor(workspace_id))
  WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors delete agent_knowledge" ON public.agent_knowledge
  FOR DELETE USING (public.is_workspace_contributor(workspace_id));

-- ─── agent_knowledge_chunks ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "workspace members manage agent_knowledge_chunks"
  ON public.agent_knowledge_chunks;

CREATE POLICY "members read agent_knowledge_chunks" ON public.agent_knowledge_chunks
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "contributors insert agent_knowledge_chunks" ON public.agent_knowledge_chunks
  FOR INSERT WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors update agent_knowledge_chunks" ON public.agent_knowledge_chunks
  FOR UPDATE USING (public.is_workspace_contributor(workspace_id))
  WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors delete agent_knowledge_chunks" ON public.agent_knowledge_chunks
  FOR DELETE USING (public.is_workspace_contributor(workspace_id));

-- ─── agent_knowledge_links ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "workspace members manage agent_knowledge_links"
  ON public.agent_knowledge_links;

CREATE POLICY "members read agent_knowledge_links" ON public.agent_knowledge_links
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "contributors insert agent_knowledge_links" ON public.agent_knowledge_links
  FOR INSERT WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors update agent_knowledge_links" ON public.agent_knowledge_links
  FOR UPDATE USING (public.is_workspace_contributor(workspace_id))
  WITH CHECK (public.is_workspace_contributor(workspace_id));

CREATE POLICY "contributors delete agent_knowledge_links" ON public.agent_knowledge_links
  FOR DELETE USING (public.is_workspace_contributor(workspace_id));
