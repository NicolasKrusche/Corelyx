import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";

// DELETE /api/support/grants/[id]
// Revoke a support access grant.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();
  const { error } = await service
    .from("support_access_grants")
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return apiError("Failed to revoke grant", 500);
  return NextResponse.json({ ok: true });
}
