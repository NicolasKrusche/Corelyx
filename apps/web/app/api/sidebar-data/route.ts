import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getRunUsage, checkGenesisAccess } from "@/lib/limits";
import { isAdminEmail } from "@/lib/admin";
import { parseTier } from "@/lib/entitlements";

// GET /api/sidebar-data?since=<ms-timestamp>
// Combines approvals count, failed-runs count, workspace list, and usage into
// one request so the sidebar only needs a single round-trip on load instead of
// four separate fetches.
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const db = createServiceClient();
  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam
    ? new Date(parseInt(sinceParam, 10)).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Round 1 — things other queries depend on
  const [activeWorkspace, membershipsRes, profileRes] = await Promise.all([
    getActiveWorkspace(user.id),
    db
      .from("workspace_memberships")
      .select("workspace_id, role, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    db
      .from("profiles")
      .select("tier, org_id, genesis_uses_this_month, genesis_month_reset_at")
      .eq("id", user.id)
      .single(),
  ]);

  const workspaceId = activeWorkspace?.workspaceId ?? null;
  const memberships = (membershipsRes.data ?? []) as Array<{ workspace_id: string; role: string }>;
  const workspaceIds = memberships.map((m) => m.workspace_id);
  const activeWorkspaceId = (profileRes.data as { org_id?: string | null } | null)?.org_id
    ?? workspaceIds[0]
    ?? null;

  // Round 2 — all remaining queries in parallel
  const [approvalsRes, programsRes, workspacesRes, workspaceTierRes, authRes, runUsage, genesisAccess] =
    await Promise.all([
      db
        .from("approvals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending"),
      workspaceId
        ? db.from("programs").select("id").eq("workspace_id", workspaceId)
        : Promise.resolve({ data: [] }),
      workspaceIds.length > 0
        ? db.from("workspaces").select("id, name").in("id", workspaceIds)
        : Promise.resolve({ data: [] }),
      workspaceId
        ? db
            .from("workspaces")
            .select("tier, genesis_uses_this_month, genesis_month_reset_at")
            .eq("id", workspaceId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      db.auth.admin.getUserById(user.id),
      getRunUsage(user.id, workspaceId),
      checkGenesisAccess(user.id, workspaceId),
    ]);

  // Round 3 — failed-run count (depends on programIds)
  const programIds = ((programsRes as { data: Array<{ id: string }> | null }).data ?? []).map(
    (p) => p.id,
  );
  let failedRunsCount = 0;
  if (programIds.length > 0) {
    const { count } = await db
      .from("runs")
      .select("id", { count: "exact", head: true })
      .in("program_id", programIds)
      .eq("status", "failed")
      .gte("created_at", since);
    failedRunsCount = count ?? 0;
  }

  // Tier — workspace tier takes precedence over personal tier
  const billingData = ((workspaceTierRes as { data: { tier?: string } | null }).data
    ?? profileRes.data) as { tier?: string } | null;
  const tier = isAdminEmail((authRes as { user?: { email?: string } })?.user?.email)
    ? ("unlimited" as const)
    : parseTier(billingData?.tier);

  // Workspace list with roles
  const workspaceRows = ((workspacesRes as { data: Array<{ id: string; name: string }> | null })
    .data ?? []);
  const roleMap = new Map(memberships.map((m) => [m.workspace_id, m.role]));
  const workspaces = workspaceRows.map((w) => ({
    id: w.id,
    name: w.name,
    role: roleMap.get(w.id) ?? "member",
  }));

  return NextResponse.json({
    pendingApprovalsCount: (approvalsRes as { count: number | null }).count ?? 0,
    failedRunsCount,
    activeWorkspaceId,
    workspaces,
    usage: {
      runs: { current: runUsage.current, total: runUsage.total },
      genesis: { usesThisMonth: genesisAccess.usesThisMonth, maxUses: genesisAccess.maxUses },
    },
  });
}
