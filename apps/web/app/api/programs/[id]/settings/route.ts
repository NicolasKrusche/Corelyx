import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { checkConflictDetectionAccess } from "@/lib/limits";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  execution_mode: z.enum(["autonomous", "supervised", "manual"]).optional(),
  conflict_policy: z.enum(["queue", "skip", "fail"]).optional(),
});

// PATCH /api/programs/[id]/settings
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { id } = await params;

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("You do not have permission to edit this program.", 403);

  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  if (parsed.data.conflict_policy && parsed.data.conflict_policy !== "queue") {
    const conflictCheck = await checkConflictDetectionAccess(user.id, access!.workspaceId);
    if (!conflictCheck.allowed) {
      return NextResponse.json(
        { error: "FEATURE_NOT_AVAILABLE", message: conflictCheck.upgradeMessage },
        { status: 403 }
      );
    }
  }

  const { error } = await supabase
    .from("programs")
    .update({ ...parsed.data, updated_at: new Date().toISOString() } as never)
    .eq("id", id);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ ok: true });
}
