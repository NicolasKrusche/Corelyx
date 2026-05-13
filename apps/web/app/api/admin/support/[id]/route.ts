import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";

const PatchSchema = z.object({ status: z.enum(["open", "closed"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!isAdminEmail(user.email) && !(await isUserAdmin(user.id))) {
    return apiError("Forbidden", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", 400);

  const db = createServiceClient();
  const { error } = await db
    .from("support_tickets")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ ok: true });
}
