import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";

// GET /api/agents/[id] — agent detail for Corelyx Mobile. Read-only mirror of
// the /agents/[id] server page: program + latest run + reports + pending
// questions + capabilities from schema.metadata.capabilities.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: programId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(programId, user.id);
  if (!canView(access)) return apiError("Agent not found", 404);

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };

  const { data: prog } = await service
    .from("programs")
    .select("id, name, description, program_type, agent_state, created_at, schema")
    .eq("id", programId)
    .maybeSingle();

  const program = prog as {
    id: string;
    name: string;
    description: string | null;
    program_type: string | null;
    agent_state: string | null;
    created_at: string;
    schema: Record<string, unknown> | null;
  } | null;

  if (!program || program.program_type !== "agent") return apiError("Agent not found", 404);

  const state = program.agent_state ?? "draft";
  const schemaMeta = (program.schema?.metadata && typeof program.schema.metadata === "object"
    ? (program.schema.metadata as Record<string, unknown>)
    : {});
  const capabilities = (schemaMeta.capabilities && typeof schemaMeta.capabilities === "object"
    ? (schemaMeta.capabilities as Record<string, unknown>)
    : {});

  // Scheduled when any active trigger is non-manual (mirrors the /agents list).
  const { data: trigRows } = await service
    .from("triggers")
    .select("type, is_active")
    .eq("program_id", programId)
    .eq("is_active", true);
  const scheduled = ((trigRows ?? []) as Array<{ type: string }>).some((t) => t.type !== "manual");

  const { data: runRows } = await service
    .from("runs")
    .select("id, status, error_message, triggered_by, created_at, billed_cost_usd")
    .eq("program_id", programId)
    .order("created_at", { ascending: false })
    .limit(1);
  const latestRun = (runRows?.[0] ?? null) as {
    id: string;
    status: string;
    error_message: string | null;
    triggered_by: string | null;
    created_at: string;
    billed_cost_usd: number | null;
  } | null;

  let reports: Array<{
    id: string;
    title: string;
    body: string;
    data: unknown;
    dry_run: boolean;
    created_at: string;
  }> = [];
  let pendingQuestions: Array<{ id: string; question: string }> = [];

  if (latestRun) {
    const { data: nodeExecs } = await service
      .from("node_executions")
      .select("id")
      .eq("run_id", latestRun.id);
    const nodeExecIds = ((nodeExecs ?? []) as Array<{ id: string | null }>)
      .map((ne) => ne.id)
      .filter((id): id is string => Boolean(id));

    const { data: reportRows } = await service
      .from("agent_reports")
      .select("id, title, body, data, dry_run, created_at")
      .eq("run_id", latestRun.id)
      .order("created_at", { ascending: true });
    reports = (reportRows ?? []) as typeof reports;

    // Pending questions the agent asked mid-run (corelyx.ask_user) — the run is
    // paused until these are answered.
    if (nodeExecIds.length > 0) {
      const { data: questionRows } = await service
        .from("approvals")
        .select("id, status, context, node_execution_id")
        .in("node_execution_id", nodeExecIds)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      pendingQuestions = ((questionRows ?? []) as Array<{ id: string; context: Record<string, unknown> | null }>)
        .filter((r) => r.context?.kind === "question" && typeof r.context?.question === "string")
        .map((r) => ({ id: r.id, question: r.context!.question as string }));
    }
  }

  return NextResponse.json({
    agent: {
      id: program.id,
      name: program.name,
      description: program.description,
      state,
      createdAt: program.created_at,
      scheduled,
      capabilities,
    },
    latestRun,
    reports,
    pendingQuestions,
  });
}

// PATCH /api/agents/[id] — update agent lifecycle settings.
// Body: { agent_saved_template?: boolean, agent_discard_after_run?: boolean }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: programId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(programId, user.id);
  if (!canView(access)) return apiError("Agent not found", 404);
  if (!canEdit(access)) return apiError("Only editors can change this agent.", 403);

  const body = (await request.json().catch(() => ({}))) as {
    agent_saved_template?: unknown;
    agent_discard_after_run?: unknown;
    allow_writes?: unknown;
    max_cost_usd?: unknown;
    allow_spawning?: unknown;
    max_spawns?: unknown;
  };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.agent_saved_template === "boolean") update.agent_saved_template = body.agent_saved_template;
  if (typeof body.agent_discard_after_run === "boolean") update.agent_discard_after_run = body.agent_discard_after_run;

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };

  // Capability scope lives in schema.metadata.capabilities so the runtime can
  // enforce it. Read-modify-write the schema when any capability changes.
  const setsAllowWrites = typeof body.allow_writes === "boolean";
  const setsMaxCost = typeof body.max_cost_usd === "number" || body.max_cost_usd === null;
  const setsAllowSpawning = typeof body.allow_spawning === "boolean";
  const setsMaxSpawns = typeof body.max_spawns === "number" || body.max_spawns === null;
  if (setsAllowWrites || setsMaxCost || setsAllowSpawning || setsMaxSpawns) {
    const { data: progRow } = await service
      .from("programs")
      .select("schema")
      .eq("id", programId)
      .eq("program_type", "agent")
      .maybeSingle();
    if (!progRow) return apiError("Agent not found", 404);
    const schema = ((progRow as { schema: Record<string, unknown> | null }).schema ?? {}) as Record<string, unknown>;
    const metadata = (schema.metadata && typeof schema.metadata === "object" ? schema.metadata : {}) as Record<string, unknown>;
    const capabilities = (metadata.capabilities && typeof metadata.capabilities === "object" ? metadata.capabilities : {}) as Record<string, unknown>;
    const nextCaps = { ...capabilities };
    if (setsAllowWrites) nextCaps.allow_writes = body.allow_writes;
    if (setsMaxCost) {
      // null clears the cap; a positive number sets it (bounded for sanity).
      nextCaps.max_cost_usd = body.max_cost_usd === null
        ? null
        : Math.max(0, Math.min(Number(body.max_cost_usd), 1000));
    }
    if (setsAllowSpawning) nextCaps.allow_spawning = body.allow_spawning;
    if (setsMaxSpawns) {
      // null restores the default cap; a number (0–20) sets a per-run limit
      // (0 effectively disables spawning).
      nextCaps.max_spawns = body.max_spawns === null
        ? null
        : Math.max(0, Math.min(Math.floor(Number(body.max_spawns)), 20));
    }
    schema.metadata = { ...metadata, capabilities: nextCaps };
    update.schema = schema;
  }

  if (Object.keys(update).length === 1) return apiError("No valid fields to update.", 400);

  const { data, error } = await service
    .from("programs")
    .update(update as never)
    .eq("id", programId)
    .eq("program_type", "agent")
    .select("id, agent_saved_template, agent_discard_after_run")
    .maybeSingle();
  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Agent not found", 404);
  return NextResponse.json({ agent: data });
}

// DELETE /api/agents/[id] — delete a one-time agent.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: programId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(programId, user.id);
  if (!canView(access)) return apiError("Agent not found", 404);
  if (!canEdit(access)) return apiError("Only editors can delete this agent.", 403);

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };
  const { data, error } = await service
    .from("programs")
    .delete()
    .eq("id", programId)
    .eq("program_type", "agent")
    .select("id")
    .maybeSingle();
  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Agent not found", 404);
  return NextResponse.json({ deleted: true });
}
