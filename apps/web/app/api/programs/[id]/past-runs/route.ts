import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canView, getProgramAccess } from "@/lib/workspaces";

// GET /api/programs/[id]/past-runs
// Returns list of past runs for a program — used to populate the replay run selector.
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const { id: programId } = params;

  const access = await getProgramAccess(programId, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const serviceClient = createServiceClient();

  type RunRow = {
    id: string;
    status: string;
    triggered_by: string;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    total_tokens: number;
    billed_cost_usd: number;
    created_at: string;
  };

  const { data: runsRaw, error: runsError } = await serviceClient
    .from("runs")
    .select(
      "id, status, triggered_by, started_at, completed_at, error_message, total_tokens, billed_cost_usd, created_at"
    )
    .eq("program_id", programId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (runsError) return apiError(runsError.message, 500);

  const runs = ((runsRaw ?? []) as unknown as RunRow[]).map((r) => ({
    id: r.id,
    status: r.status,
    triggered_by: r.triggered_by,
    started_at: r.started_at,
    completed_at: r.completed_at,
    error_message: r.error_message,
    total_tokens: r.total_tokens,
    billed_cost_usd: r.billed_cost_usd,
    created_at: r.created_at,
  }));

  return NextResponse.json({ runs });
}
