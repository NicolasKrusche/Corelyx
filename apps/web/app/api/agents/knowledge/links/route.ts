import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace, canContributeToWorkspace } from "@/lib/workspaces";

type Service = ReturnType<typeof createServiceClient> & { from(t: string): any };

/**
 * POST /api/agents/knowledge/links — draw a reference between two knowledge docs.
 * Body: { from_id, to_id, label? }
 */
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot edit the knowledge canvas.", 403);

  const body = (await request.json().catch(() => ({}))) as {
    from_id?: unknown;
    to_id?: unknown;
    label?: unknown;
  };
  const fromId = typeof body.from_id === "string" ? body.from_id : "";
  const toId = typeof body.to_id === "string" ? body.to_id : "";
  if (!fromId || !toId) return apiError("from_id and to_id are required.", 400);
  if (fromId === toId) return apiError("A doc can't reference itself.", 400);

  const service = createServiceClient() as Service;

  // Both endpoints must be docs in this workspace.
  const { data: docs } = await service
    .from("agent_knowledge")
    .select("id")
    .eq("workspace_id", ws.workspaceId)
    .in("id", [fromId, toId]);
  if (!docs || (docs as Array<{ id: string }>).length < 2) {
    return apiError("Both docs must exist in this workspace.", 404);
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
  const { data, error } = await service
    .from("agent_knowledge_links")
    .insert({ workspace_id: ws.workspaceId, from_id: fromId, to_id: toId, label } as never)
    .select("id, from_id, to_id, label")
    .maybeSingle();

  if (error) {
    if (/duplicate|unique/i.test((error as { message?: string }).message ?? "")) {
      return apiError("That reference already exists.", 409);
    }
    return apiError((error as { message: string }).message, 500);
  }
  return NextResponse.json({ link: data }, { status: 201 });
}

/**
 * DELETE /api/agents/knowledge/links?id=<linkId> — remove a reference.
 */
export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot edit the knowledge canvas.", 403);

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError("Missing link id.", 400);

  const service = createServiceClient() as Service;
  const { data, error } = await service
    .from("agent_knowledge_links")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ws.workspaceId)
    .select("id")
    .maybeSingle();
  if (error) return apiError((error as { message: string }).message, 500);
  if (!data) return apiError("Not found", 404);
  return NextResponse.json({ deleted: true });
}
