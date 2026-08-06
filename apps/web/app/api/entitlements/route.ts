import { NextResponse } from "next/server";
import { apiError, getAuthUser } from "@/lib/api";
import { getEntitlements } from "@/lib/entitlements";
import { getRunUsage, getGenesisGrant } from "@/lib/limits";
import { isAdminEmail } from "@/lib/admin";
import { parseTier } from "@/lib/entitlements";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";

// GET /api/entitlements — return the current user's plan entitlements + live usage
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const serviceClient = createServiceClient();
  const activeWorkspace = await getActiveWorkspace(user.id);
  const [{ data: profileData }, { data: workspaceData }, { data: authData }] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("tier, bonus_runs, is_beta_tester, genesis_uses_this_month, genesis_month_reset_at")
      .eq("id", user.id)
      .single(),
    activeWorkspace
      ? serviceClient
          .from("workspaces")
          .select("tier, bonus_runs, is_beta_tester, genesis_uses_this_month, genesis_month_reset_at")
          .eq("id", activeWorkspace.workspaceId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    serviceClient.auth.admin.getUserById(user.id),
  ]);
  const billingData = (workspaceData ?? profileData) as { tier?: string } | null;

  const tier = isAdminEmail(authData?.user?.email)
    ? "unlimited" as const
    : parseTier(billingData?.tier);

  const entitlements = getEntitlements(tier);
  const [runUsage, genesisAccess] = await Promise.all([
    getRunUsage(user.id, activeWorkspace?.workspaceId ?? null),
    getGenesisGrant(user.id, activeWorkspace?.workspaceId ?? null),
  ]);

  return NextResponse.json({
    tier,
    entitlements,
    usage: {
      runs: {
        current: runUsage.current,
        total: runUsage.total,
      },
      genesis: {
        usesThisMonth: genesisAccess.usesThisMonth,
        bonusRemaining: genesisAccess.bonusRemaining,
      },
    },
  });
}
