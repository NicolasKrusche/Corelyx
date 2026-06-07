import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";
import { checkAgentAccess, checkProgramLimit } from "@/lib/limits";
import { buildClonedAgentSchema } from "@/lib/agents/lineage";

// POST /api/agents/[id]/clone — spin up a fresh one-time agent from an existing
// agent's plan. This is how an agent "repeats" without becoming a workflow: each
// clone is a new one-time run awaiting approval. Lineage is tracked in
// schema.metadata.agent_lineage_id so prior reports can carry over (cross-run
// memory). The new agent starts paused at "awaiting_approval".
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

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

  // Copy the plan, give it a fresh program_id, and stamp lineage so the run path
  // can find prior reports from earlier runs of the same agent.
  const schema = buildClonedAgentSchema(source.schema, source.id, crypto.randomUUID());

  const { data: rawProgram, error: insertError } = await service
    .from("programs")
    .insert({
      user_id: user.id,
      workspace_id: workspaceId,
      name: source.name,
      description: source.description ?? "",
      schema: schema as unknown as Record<string, unknown>,
      execution_mode: source.execution_mode ?? "supervised",
      program_type: "agent",
      agent_state: "awaiting_approval",
      is_active: false,
    } as never)
    .select("id, name")
    .single();
  const program = rawProgram as { id: string; name: string } | null;
  if (insertError || !program) return apiError(insertError?.message ?? "Could not create the agent.", 500);

  // Carry over editor membership and the source's connection links so the new
  // agent's steps resolve the same connections.
  const { data: srcConns } = await service
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", sourceId);
  const connRows = (srcConns ?? []) as Array<{ connection_id: string }>;

  await Promise.all([
    service.from("program_memberships").insert({
      program_id: program.id,
      user_id: user.id,
      role: "editor",
      created_by: user.id,
    } as never),
    connRows.length > 0
      ? service.from("program_connections").insert(
          connRows.map((c) => ({ program_id: program.id, connection_id: c.connection_id })) as never
        )
      : Promise.resolve({ error: null }),
  ]);

  return NextResponse.json({ agent: program });
}
