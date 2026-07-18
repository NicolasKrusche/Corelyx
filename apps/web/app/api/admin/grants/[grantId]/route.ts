import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { writeAppLog } from "@/lib/app-logs";

// GET /api/admin/grants/[grantId]
// Returns program details + recent runs for a valid active grant.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ grantId: string }> }
) {
  const { grantId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return apiError("Unauthorized", 401);

  const service = createServiceClient();

  // Verify grant is active
  const { data: grant } = await service
    .from("support_access_grants")
    .select("id, user_id, program_id, expires_at, revoked_at")
    .eq("id", grantId)
    .single();

  if (!grant) return apiError("Grant not found", 404);
  const g = grant as { user_id: string; program_id: string; expires_at: string; revoked_at: string | null };
  if (g.revoked_at || new Date(g.expires_at) < new Date()) return apiError("Grant expired or revoked", 403);

  // Fetch program
  const { data: program } = await service
    .from("programs")
    .select("id, name, description, schema, execution_mode, is_active, created_at, updated_at")
    .eq("id", g.program_id)
    .single();

  if (!program) return apiError("Program not found", 404);

  // Fetch recent runs
  const { data: runs } = await service
    .from("runs")
    .select("id, status, triggered_by, started_at, completed_at, created_at")
    .eq("program_id", g.program_id)
    .order("created_at", { ascending: false })
    .limit(10);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Admin",
    event: "admin.grant.viewed",
    status: "completed",
    message: `Admin viewed program ${g.program_id} under support grant ${grantId}.`,
    programId: g.program_id,
    details: { grant_id: grantId, grant_user_id: g.user_id },
  });

  return NextResponse.json({ program, runs: runs ?? [], grant: { id: grantId, expires_at: g.expires_at, user_id: g.user_id } });
}
