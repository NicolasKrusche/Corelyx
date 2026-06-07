import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";

type Service = ReturnType<typeof createServiceClient> & { from(t: string): any };

// DELETE /api/agents/knowledge/[id] — remove a knowledge entry from the workspace.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);

  const service = createServiceClient() as Service;
  const { data, error } = await service
    .from("agent_knowledge")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ws.workspaceId)
    .select("id")
    .maybeSingle();
  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Not found", 404);
  return NextResponse.json({ deleted: true });
}
