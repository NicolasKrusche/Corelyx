import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace, canContributeToWorkspace } from "@/lib/workspaces";
import { indexKnowledgeDoc } from "@/lib/agents/knowledge-index";

type Service = ReturnType<typeof createServiceClient> & { from(t: string): any };

const KNOWLEDGE_DOC_FIELDS =
  "id, title, content, source_type, source_name, embedding_status, created_at, updated_at";

// PATCH /api/agents/knowledge/[id] — edit a knowledge entry. Body: { title?, content? }
// Content edits re-chunk and re-embed the doc.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot edit knowledge.", 403);

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; content?: unknown };
  const patch: Record<string, string> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 200);
  }
  const hasContent = typeof body.content === "string";
  if (hasContent) {
    const content = (body.content as string).trim().slice(0, 100_000);
    if (!content) return apiError("content cannot be empty.", 400);
    patch.content = content;
  }
  if (Object.keys(patch).length === 0) return apiError("Nothing to update.", 400);
  patch.updated_at = new Date().toISOString();

  const service = createServiceClient() as Service;
  const { data, error } = await service
    .from("agent_knowledge")
    .update(patch as never)
    .eq("id", id)
    .eq("workspace_id", ws.workspaceId)
    .select(KNOWLEDGE_DOC_FIELDS)
    .maybeSingle();
  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Not found", 404);

  let doc = data as Record<string, unknown> & { id: string; content: string };
  if (patch.content !== undefined) {
    const indexed = await indexKnowledgeDoc(service, {
      id: doc.id,
      workspaceId: ws.workspaceId,
      content: patch.content,
    });
    doc = { ...doc, embedding_status: indexed.status };
  }
  return NextResponse.json({ knowledge: doc });
}

// DELETE /api/agents/knowledge/[id] — remove a knowledge entry from the workspace.
// Its chunks cascade-delete with it.
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
