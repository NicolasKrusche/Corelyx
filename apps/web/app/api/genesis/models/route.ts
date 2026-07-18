import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";
import { getAllowedPlatformModels, PLATFORM_DEFAULT_MODEL } from "@/lib/genesis/request";
import { getOpenRouterModelCatalog } from "@/lib/genesis/openrouter-models";
import { hasTechnicalAccess } from "@/lib/admin-auth";

/**
 * GET /api/genesis/models
 *
 * Returns ALL platform Genesis models. Each model has a `locked` flag
 * indicating whether the user's current plan allows it. Locked models
 * are shown in the UI with a lock icon and an upgrade prompt.
 */
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tier = await getUserTier(user.id);
  const ent = getEntitlements(tier);
  const modelTier = ent.genesisPlatformModelTier;
  const catalog = await getOpenRouterModelCatalog();

  // Dev accounts get every platform model unlocked (run on the funded platform
  // key) so they can test with a capable model without a personal billing tier.
  const isDev = await hasTechnicalAccess(user.id, user.email);
  const allowedIds = isDev
    ? new Set(catalog.map((m) => m.id))
    : new Set(getAllowedPlatformModels(modelTier, catalog).map((m) => m.id));

  const models = catalog.map((m) => ({
    ...m,
    locked: !allowedIds.has(m.id),
  }));

  return NextResponse.json({
    tier: modelTier,
    // Devs default to a strong model (funded platform key) so V2 testing gets a
    // model that actually leverages the introspected data and emits clarifying
    // questions — Haiku is too weak for that. Without having to pick one.
    defaultModel: isDev && allowedIds.has("anthropic/claude-sonnet-4.6")
      ? "anthropic/claude-sonnet-4.6"
      : PLATFORM_DEFAULT_MODEL,
    models,
    // Genesis V2 access = dev (testing) OR the top plan(s); the client shows the
    // V2 toggle only when true.
    v2Available: isDev || getEntitlements(tier).genesisV2,
  });
}
