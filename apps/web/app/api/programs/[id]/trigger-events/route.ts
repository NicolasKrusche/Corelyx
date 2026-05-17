import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { canView, getProgramAccess } from "@/lib/workspaces";

/**
 * GET /api/programs/[id]/trigger-events
 *
 * Returns the 50 most recent trigger_events for this program.
 * Requires the caller to have at least view access to the program.
 */
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const { id } = await routeParams;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const db = createServiceClient();
  const { data, error } = await db
    .from("trigger_events")
    .select("id, trigger_id, run_id, fired_at, source, status, message")
    .eq("program_id", id)
    .order("fired_at", { ascending: false })
    .limit(50);

  if (error) return apiError(error.message, 500);
  return NextResponse.json(data ?? []);
}
