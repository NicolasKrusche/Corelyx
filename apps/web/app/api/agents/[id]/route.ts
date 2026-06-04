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
  };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.agent_saved_template === "boolean") update.agent_saved_template = body.agent_saved_template;
  if (typeof body.agent_discard_after_run === "boolean") update.agent_discard_after_run = body.agent_discard_after_run;
  if (Object.keys(update).length === 1) return apiError("No valid fields to update.", 400);

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };
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
  const { error } = await service
    .from("programs")
    .delete()
    .eq("id", programId)
    .eq("program_type", "agent");
  if (error) return apiError(error.message, 500);
  return NextResponse.json({ deleted: true });
}
