import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { isAdmin } from "@/lib/admin";

const UpdateFeedbackSchema = z.object({
  status: z.enum(["new", "planned", "in_progress", "done", "declined"]).optional(),
  admin_notes: z.string().max(4000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!(await isAdmin(user.id, user.email ?? undefined))) return apiError("Forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = UpdateFeedbackSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", 400);
  if (Object.keys(parsed.data).length === 0) return apiError("No fields to update", 400);

  const db = createServiceClient();
  const { data, error } = await db
    .from("feedback")
    .update({ ...parsed.data, updated_at: new Date().toISOString() } as never)
    .eq("id", params.id)
    .select("id, status, admin_notes, updated_at")
    .single();

  if (error || !data) return apiError(error?.message ?? "Feedback not found", 404);
  return NextResponse.json({ feedback: data });
}
