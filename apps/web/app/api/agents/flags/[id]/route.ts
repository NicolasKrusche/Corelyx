import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";

// PATCH /api/agents/flags/[id] — resolve a critical-signal flag.
// Body: { status: "kept" | "dismissed" }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = (await request.json().catch(() => ({}))) as { status?: unknown };
  if (body.status !== "kept" && body.status !== "dismissed") {
    return apiError("status must be 'kept' or 'dismissed'", 400);
  }

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & {
    from(t: string): any;
  };

  const { data: flagRow } = await service
    .from("agent_flags")
    .select("id, workspace_id")
    .eq("id", id)
    .maybeSingle();
  const flag = flagRow as { id: string; workspace_id: string } | null;
  if (!flag) return apiError("Flag not found", 404);

  // Authorize: the acting user must belong to the flag's workspace.
  const { data: mem } = await service
    .from("workspace_memberships")
    .select("user_id")
    .eq("workspace_id", flag.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mem) return apiError("Flag not found", 404);

  const { data, error } = await service
    .from("agent_flags")
    .update({ status: body.status, resolved_at: new Date().toISOString(), resolved_by: user.id } as never)
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
  if (error) return apiError(error.message, 500);
  return NextResponse.json({ flag: data });
}
