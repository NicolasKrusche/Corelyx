import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { hasTechnicalAccess } from "@/lib/admin-auth";

// GET /api/genesis/sessions?program_id=<uuid>
// Open clarifying-question sessions for the caller (Genesis V2). Used by the
// editor to pin unanswered questions to nodes, and by the building page to
// resume a session after navigation. RLS limits reads to the owner; expired
// sessions are lazily marked abandoned here so clients never see stale pins.
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  // V2 is dev-gated: non-dev users have no sessions, so short-circuit to empty.
  if (!(await hasTechnicalAccess(user.id, user.email))) {
    return NextResponse.json({ sessions: [] });
  }

  const url = new URL(request.url);
  const programId = url.searchParams.get("program_id");

  let query = supabase
    .from("genesis_sessions")
    .select("id, program_id, status, clarifications, created_at, expires_at")
    .eq("user_id", user.id)
    .eq("status", "awaiting_clarification")
    .order("created_at", { ascending: false })
    .limit(20);
  if (programId) query = query.eq("program_id", programId);

  const { data, error } = await query;
  if (error) return apiError(error.message, 500);

  const rows = (data ?? []) as Array<{
    id: string;
    program_id: string;
    status: string;
    clarifications: unknown;
    created_at: string;
    expires_at: string;
  }>;

  const now = Date.now();
  const open = rows.filter((row) => new Date(row.expires_at).getTime() > now);
  const expired = rows.filter((row) => new Date(row.expires_at).getTime() <= now);

  if (expired.length > 0) {
    const serviceClient = createServiceClient();
    await serviceClient
      .from("genesis_sessions")
      .update({ status: "abandoned", updated_at: new Date().toISOString() } as unknown as never)
      .in("id", expired.map((row) => row.id));
  }

  return NextResponse.json({ sessions: open });
}
