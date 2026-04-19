import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";

// DELETE /api/settings/account — permanently deletes the authenticated user's account
export async function DELETE() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();

  // Delete auth user — cascades to profiles, programs, runs, connections, api_keys via ON DELETE CASCADE
  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) return apiError(error.message, 500);

  return NextResponse.json({ deleted: true });
}
