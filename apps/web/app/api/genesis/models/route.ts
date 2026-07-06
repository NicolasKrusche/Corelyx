import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";
import { PLATFORM_MODEL_CATALOG, getAllowedPlatformModels, PLATFORM_DEFAULT_MODEL } from "@/lib/genesis/request";
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

  // Dev accounts get every platform model unlocked (run on the funded platform
  // key) so they can test with a capable model without a personal billing tier.
  const isDev = await hasTechnicalAccess(user.id, user.email);
  const allowedIds = isDev
    ? new Set(PLATFORM_MODEL_CATALOG.map((m) => m.id))
    : new Set(getAllowedPlatformModels(modelTier).map((m) => m.id));

  const models = PLATFORM_MODEL_CATALOG.map((m) => ({
    ...m,
    locked: !allowedIds.has(m.id),
  }));

  return NextResponse.json({
    tier: modelTier,
    // Devs default to a capable model (funded platform key) so V2 testing gets a
    // model that actually follows instructions, without having to pick one.
    defaultModel: isDev ? "anthropic/claude-3-haiku" : PLATFORM_DEFAULT_MODEL,
    models,
    // Genesis V2 is dev-gated: the client only shows the V2 toggle when true.
    v2Available: isDev,
  });
}
