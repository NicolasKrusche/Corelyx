import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";

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
  };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.agent_saved_template === "boolean") update.agent_saved_template = body.agent_saved_template;
  if (typeof body.agent_discard_after_run === "boolean") update.agent_discard_after_run = body.agent_discard_after_run;

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };

  // Capability scope lives in schema.metadata.capabilities so the runtime can
  // enforce it. Read-modify-write the schema when any capability changes.
  const setsAllowWrites = typeof body.allow_writes === "boolean";
  const setsMaxCost = typeof body.max_cost_usd === "number" || body.max_cost_usd === null;
  if (setsAllowWrites || setsMaxCost) {
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
