import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";
import { getAllowedPlatformModels, PLATFORM_DEFAULT_MODEL } from "@/lib/genesis/request";

/**
 * GET /api/genesis/models
 *
 * Returns the list of platform Genesis models available to the current user,
 * based on their billing tier. Free users only see free models; paid users
 * (Solo / Team / Scale) see all models including Claude and GPT-4o.
 */
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tier = await getUserTier(user.id);
  const ent = getEntitlements(tier);
  const modelTier = ent.genesisPlatformModelTier;
  const models = getAllowedPlatformModels(modelTier);

  return NextResponse.json({
    tier: modelTier,
    defaultModel: PLATFORM_DEFAULT_MODEL,
    models,
  });
}
