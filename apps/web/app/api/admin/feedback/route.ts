import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!(await isAdmin(user.id, user.email ?? undefined))) return apiError("Forbidden", 403);

  const db = createServiceClient();
  const { data, error } = await db
    .from("feedback")
    .select("id, user_email, type, message, page_path, status, admin_notes, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ feedback: data ?? [] });
}
