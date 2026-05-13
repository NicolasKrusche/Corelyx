import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!isAdminEmail(user.email) && !(await isUserAdmin(user.id))) {
    return apiError("Forbidden", 403);
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("support_tickets")
    .select("id, user_id, user_email, user_tier, type, subject, status, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ tickets: data ?? [] });
}
