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
  const allowedIds = new Set(getAllowedPlatformModels(modelTier).map((m) => m.id));

  const models = PLATFORM_MODEL_CATALOG.map((m) => ({
    ...m,
    locked: !allowedIds.has(m.id),
  }));

  // Genesis V2 is dev-gated: the client only shows the V2 toggle when true.
  const v2Available = await hasTechnicalAccess(user.id, user.email);

  return NextResponse.json({
    tier: modelTier,
    defaultModel: PLATFORM_DEFAULT_MODEL,
    models,
    v2Available,
  });
}
