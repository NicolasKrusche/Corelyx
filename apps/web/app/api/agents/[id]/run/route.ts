import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { canRun, canView, canRunAgentInWorkspace, getProgramAccess } from "@/lib/workspaces";
import { checkAgentAccess } from "@/lib/limits";
import { dispatchAgentRun } from "@/lib/agents/dispatch";

// POST /api/agents/[id]/run — run a one-time agent (optionally as a dry run).
// Body: { dry_run?: boolean }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: programId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const processingRestriction = await ensureProcessingAllowed(user.id);
  if (processingRestriction) return processingRestriction;

  const body = (await request.json().catch(() => ({}))) as { dry_run?: unknown };
  const dryRun = body?.dry_run === true;

  const access = await getProgramAccess(programId, user.id);
  if (!canView(access)) return apiError("Agent not found", 404);
  if (!canRun(access)) return apiError("You do not have permission to run this agent.", 403);

  // Agents are a Solo+ feature — gate on the workspace's billing tier first.
  const agentAccess = await checkAgentAccess(user.id, access!.workspaceId);
  if (!agentAccess.allowed) {
    return NextResponse.json(
      { error: "AGENTS_REQUIRE_UPGRADE", message: agentAccess.upgradeMessage ?? "Agents require an upgrade." },
      { status: 403 }
    );
  }

  // Agents act on the workspace — enforce the workspace's agent permission.
  if (!(await canRunAgentInWorkspace(access!.workspaceId, user.id))) {
    return apiError("You don't have permission to run agents in this workspace.", 403);
  }

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };

  // One-time agents: once a real run has succeeded, the agent is done and can't
  // be run again. (Dry runs return the agent to "awaiting_approval", and failed
  // runs stay retryable, so neither of those is blocked here.)
  const { data: stateRow } = await service
    .from("programs")
    .select("agent_state, program_type")
    .eq("id", programId)
    .maybeSingle();
  const stateInfo = stateRow as { agent_state: string | null; program_type: string | null } | null;
  if (!stateInfo) return apiError("Agent not found", 404);
  if (stateInfo.program_type !== "agent") return apiError("This program is not an agent.", 400);
  if (stateInfo.agent_state === "completed") {
    return apiError("This agent has already completed and can't be run again.", 409);
  }

  const result = await dispatchAgentRun(service, {
    programId,
    userId: user.id,
    workspaceId: access!.workspaceId,
    triggeredBy: dryRun ? "agent_dry_run" : "agent_manual",
    dryRun,
  });
  if (!result.ok) return apiError(result.error, result.status);

  return NextResponse.json({ run_id: result.runId, dry_run: dryRun });
}
