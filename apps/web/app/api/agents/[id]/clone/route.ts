import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";
import { checkAgentAccess, checkProgramLimit } from "@/lib/limits";
import { cloneAgentProgram } from "@/lib/agents/dispatch";

// POST /api/agents/[id]/clone — spin up a fresh one-time agent from an existing
// agent's plan. This is how an agent "repeats" without becoming a workflow: each
// clone is a new one-time run awaiting approval. Lineage is tracked in
// schema.metadata.agent_lineage_id so prior reports can carry over (cross-run
// memory). The new agent starts paused at "awaiting_approval".
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = (await request.json().catch(() => ({}))) as { adjustment?: unknown };
  const adjustment = typeof body.adjustment === "string" ? body.adjustment : null;

  const access = await getProgramAccess(sourceId, user.id);
  if (!canView(access)) return apiError("Agent not found", 404);
  if (!canEdit(access)) return apiError("Only editors can re-run this agent.", 403);

  const workspaceId = access!.workspaceId;

  // Agents are Solo+, and a clone is a new program — enforce both gates.
  const agentAccess = await checkAgentAccess(user.id, workspaceId);
  if (!agentAccess.allowed) {
    return NextResponse.json(
      { error: "AGENTS_REQUIRE_UPGRADE", message: agentAccess.upgradeMessage ?? "Agents require an upgrade." },
      { status: 403 }
    );
  }
  const programLimit = await checkProgramLimit(user.id, workspaceId);
  if (!programLimit.allowed) {
    return NextResponse.json(
      { error: "PROGRAM_LIMIT_REACHED", message: programLimit.upgradeMessage ?? "Program limit reached." },
      { status: 403 }
    );
  }

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };
  const { data: src } = await service
    .from("programs")
    .select("id, name, description, program_type, schema, execution_mode")
    .eq("id", sourceId)
    .maybeSingle();
  const source = src as {
    id: string;
    name: string;
    description: string | null;
    program_type: string | null;
    schema: Record<string, unknown> | null;
    execution_mode: string | null;
  } | null;
  if (!source || source.program_type !== "agent") return apiError("Agent not found", 404);

  const cloned = await cloneAgentProgram(service, source, user.id, workspaceId, adjustment);
  if (!cloned.ok) return apiError(cloned.error, 500);

  return NextResponse.json({ agent: cloned.program });
}
