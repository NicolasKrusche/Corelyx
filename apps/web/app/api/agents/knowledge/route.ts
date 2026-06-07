import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace, canContributeToWorkspace } from "@/lib/workspaces";
import { checkAgentAccess } from "@/lib/limits";

type Service = ReturnType<typeof createServiceClient> & { from(t: string): any };

// GET /api/agents/knowledge — list the active workspace's knowledge entries.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return NextResponse.json({ knowledge: [] });

  const service = createServiceClient() as Service;
  const { data, error } = await service
    .from("agent_knowledge")
    .select("id, title, content, created_at")
    .eq("workspace_id", ws.workspaceId)
    .order("created_at", { ascending: false });
  if (error) return apiError(error.message, 500);
  return NextResponse.json({ knowledge: data ?? [] });
}

// POST /api/agents/knowledge — add a knowledge entry. Body: { title, content }
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) return apiError("Viewers cannot add knowledge.", 403);

  // Knowledge powers agents, which are Solo+.
  const agentAccess = await checkAgentAccess(user.id, ws.workspaceId);
  if (!agentAccess.allowed) {
    return NextResponse.json(
      { error: "AGENTS_REQUIRE_UPGRADE", message: agentAccess.upgradeMessage ?? "Agents require an upgrade." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; content?: unknown };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 100_000) : "";
  if (!content) return apiError("content is required.", 400);

  const service = createServiceClient() as Service;
  const { data, error } = await service
    .from("agent_knowledge")
    .insert({
      workspace_id: ws.workspaceId,
      user_id: user.id,
      title: title || "Untitled",
      content,
    } as never)
    .select("id, title, content, created_at")
    .single();
  if (error) return apiError(error.message, 500);
  return NextResponse.json({ knowledge: data }, { status: 201 });
}
