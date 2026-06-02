import { NextResponse } from "next/server";
import { createServiceClient, apiError } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { writeAppLog } from "@/lib/app-logs";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/admin/users/[id]  body: { action: "ban" | "unban", reason?: string }
export async function POST(request: Request, { params: routeParams }: RouteContext) {
  const { id: targetUserId } = await routeParams;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return apiError("Forbidden", 403);

  const body = await request.json().catch(() => null) as { action?: string; reason?: string } | null;
  const action = body?.action;
  if (action !== "ban" && action !== "unban") {
    return apiError("action must be 'ban' or 'unban'", 400);
  }

  const service = createServiceClient();

  // Prevent admins from banning themselves
  if (targetUserId === user.id) return apiError("You cannot ban your own account.", 400);

  const { error } = await service.auth.admin.updateUserById(targetUserId, {
    ban_duration: action === "ban" ? "876000h" : "none",
  });

  if (error) return apiError(error.message, 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "warning",
    source: "Admin",
    event: `admin.user.${action}`,
    status: "completed",
    message: `Admin ${action}ned user ${targetUserId}.`,
    details: { target_user_id: targetUserId, reason: body?.reason ?? null },
  });

  return NextResponse.json({ ok: true, action, target_user_id: targetUserId });
}
