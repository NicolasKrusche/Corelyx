import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getUserNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs";

const PatchBodyZ = z.object({
  run_failures:       z.boolean().optional(),
  approvals:          z.boolean().optional(),
  run_limit_warnings: z.boolean().optional(),
  security_alerts:    z.boolean().optional(),
  product_updates:    z.boolean().optional(),
});

// GET /api/notification-preferences
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const prefs = await getUserNotificationPrefs(user.id);
  return NextResponse.json(prefs);
}

// PATCH /api/notification-preferences
export async function PATCH(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = PatchBodyZ.safeParse(body);
  if (!parsed.success) return apiError("Invalid body", 400);

  // Fetch current prefs and merge
  const current = await getUserNotificationPrefs(user.id);
  const updated: NotificationPrefs = { ...current, ...parsed.data };

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ notification_preferences: updated } as never)
    .eq("id", user.id);

  if (error) return apiError(error.message, 500);
  return NextResponse.json(updated);
}
