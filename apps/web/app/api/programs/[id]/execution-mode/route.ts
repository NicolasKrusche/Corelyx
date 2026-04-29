import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";

/**
 * PATCH /api/programs/[id]/execution-mode
 *
 * Update a program's execution_mode and/or conflict_policy.
 */
export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("You do not have permission to edit this program.", 403);

  const body = await request.json().catch(() => ({}));

  type UpdatePayload = {
    execution_mode?: string;
    conflict_policy?: string;
    updated_at: string;
  };
  const updates: UpdatePayload = { updated_at: new Date().toISOString() };

  if (body.execution_mode) {
    const validModes = ["autonomous", "supervised", "manual"];
    if (!validModes.includes(body.execution_mode)) {
      return apiError(`Invalid execution_mode. Must be: ${validModes.join(", ")}`, 400);
    }
    updates.execution_mode = body.execution_mode;
  }

  if (body.conflict_policy) {
    const validPolicies = ["queue", "skip", "fail"];
    if (!validPolicies.includes(body.conflict_policy)) {
      return apiError(`Invalid conflict_policy. Must be: ${validPolicies.join(", ")}`, 400);
    }
    updates.conflict_policy = body.conflict_policy;
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("programs")
    .update(updates as never)
    .eq("id", params.id)
    .select("id, execution_mode, conflict_policy")
    .single();

  if (error || !data) return apiError("Update failed", 500);

  return NextResponse.json({ program: data });
}
