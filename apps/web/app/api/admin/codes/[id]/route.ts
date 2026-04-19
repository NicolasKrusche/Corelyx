import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";

// DELETE /api/admin/codes/[id] — deactivate a code
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return apiError("Forbidden", 403);

  const { id } = await params;
  const service = createServiceClient();

  const { error } = await service
    .from("redemption_codes")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ deactivated: true });
}
