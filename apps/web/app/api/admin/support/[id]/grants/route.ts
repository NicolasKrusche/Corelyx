import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { writeAppLog } from "@/lib/app-logs";

type GrantRow = {
  id: string;
  user_id: string;
  program_id: string;
  expires_at: string;
  created_at: string;
  programs: { id: string; name: string; description: string | null } | null;
};

// GET /api/admin/support/[id]/grants
// List active access grants associated with a support ticket.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return apiError("Unauthorized", 401);

  const service = createServiceClient();
  const { data, error } = await service
    .from("support_access_grants")
    .select("id, user_id, program_id, expires_at, created_at, programs(id, name, description)")
    .eq("ticket_id", ticketId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) return apiError("Failed to fetch grants", 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Admin",
    event: "admin.support.grants_viewed",
    status: "completed",
    message: `Admin viewed access grants for support ticket ${ticketId}.`,
    details: { ticket_id: ticketId, grant_count: (data ?? []).length },
  });

  return NextResponse.json({ grants: (data ?? []) as GrantRow[] });
}
