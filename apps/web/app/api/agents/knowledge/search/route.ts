import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { searchKnowledgeBase } from "@/lib/agents/knowledge-search";

type Service = ReturnType<typeof createServiceClient> & {
  from(t: string): any;
  rpc(fn: string, args: Record<string, unknown>): any;
};

// GET /api/agents/knowledge/search?q=… — retrieval preview for the knowledge
// page. Runs the exact same search agents use (corelyx.search_knowledge), so
// users can test what their agents will actually see.
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  const ws = await getActiveWorkspace(user.id);
  if (!ws) return NextResponse.json({ results: [], searched: 0, method: "keyword" });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return apiError("q (query) is required.", 400);

  const service = createServiceClient() as Service;
  const result = await searchKnowledgeBase(service, [ws.workspaceId], q.slice(0, 500), 5);
  if ("error" in result) return apiError(result.error, 500);
  return NextResponse.json(result);
}
