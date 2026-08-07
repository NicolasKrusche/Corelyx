import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { canView, canRun, getProgramAccess } from "@/lib/workspaces";
import { POST as replayFromNode } from "@/app/api/runs/[id]/replay-from-node/route";

// GET /api/programs/[id]/dead-letter — list dead letter entries
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const { searchParams } = new URL(_request.url);
  const status = searchParams.get("status");
  const node_id = searchParams.get("node_id");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  const serviceClient = createServiceClient();

  let query = serviceClient
    .from("dead_letter_entries")
    .select("*")
    .eq("program_id", params.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }
  if (node_id) {
    query = query.eq("node_id", node_id);
  }

  const { data: entries, error } = await query;

  if (error) {
    console.error("Dead letter list error:", error);
    return apiError("Failed to fetch dead letter entries", 500);
  }

  // Also get total count for pagination
  let countQuery = serviceClient
    .from("dead_letter_entries")
    .select("id", { count: "exact", head: true })
    .eq("program_id", params.id);

  if (status) countQuery = countQuery.eq("status", status);
  if (node_id) countQuery = countQuery.eq("node_id", node_id);

  const { count } = await countQuery;

  return NextResponse.json({
    entries: entries || [],
    pagination: {
      limit,
      offset,
      total: count || 0,
    },
  });
}

// POST /api/programs/[id]/dead-letter — retrigger a dead letter entry
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canRun(access)) return apiError("You cannot retrigger executions for this program.", 403);

  const body = await request.json().catch(() => ({}));
  const { entry_id } = body as { entry_id?: string };

  if (!entry_id) {
    return apiError("entry_id is required", 400);
  }

  const serviceClient = createServiceClient();

  // Verify entry exists and belongs to this program
  const { data: entry, error: entryError } = await serviceClient
    .from("dead_letter_entries")
    .select("*")
    .eq("id", entry_id)
    .eq("program_id", params.id)
    .single();

  if (entryError || !entry) {
    return apiError("Dead letter entry not found", 404);
  }

  if (entry.status === "purged") {
    return apiError("Cannot retrigger a purged entry", 400);
  }

  // Retriggering means re-running the workflow from the node that died, with
  // the input it died on — which is exactly replay-from-node. It used to go
  // through admin_retrigger_dead_letter instead, and that RPC could never work:
  // it inserts `node_executions.input_data` and `runs.trigger_type`, neither of
  // which is a real column, so every retrigger raised inside Postgres and came
  // back as a 500. Even had it applied, it only wrote a 'running' run row and a
  // 'pending' node_executions row — nothing dispatched to the runtime and
  // nothing polls for pending executions, so the run would have hung forever.
  // Delegating keeps one dispatch path under test rather than two, and inherits
  // its pre-flight validation and runtime error handling.
  if (!entry.run_id) {
    return apiError("This entry has no originating run to replay.", 422);
  }

  const replayResponse = await replayFromNode(
    new Request(new URL(request.url).origin + `/api/runs/${entry.run_id}/replay-from-node`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ node_id: entry.node_id, edited_input: entry.input_data ?? {} }),
    }),
    { params: Promise.resolve({ id: entry.run_id as string }) }
  );

  // Only count it as retried once the runtime has actually accepted the work,
  // so a failed dispatch leaves the entry pending and retriggerable.
  if (!replayResponse.ok) return replayResponse;

  await serviceClient
    .from("dead_letter_entries")
    .update({
      status: "retried",
      retried_at: new Date().toISOString(),
      retry_count: (entry.retry_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entry_id);

  const replayBody = (await replayResponse.json()) as { run_id?: string };
  return NextResponse.json({
    success: true,
    new_run_id: replayBody.run_id ?? null,
    message: "Dead letter entry retriggered successfully",
  });
}

// DELETE /api/programs/[id]/dead-letter — purge a dead letter entry
export async function DELETE(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canRun(access)) return apiError("You cannot purge entries for this program.", 403);

  const { searchParams } = new URL(request.url);
  const entry_id = searchParams.get("entry_id");
  const all_pending = searchParams.get("all_pending") === "true";

  const serviceClient = createServiceClient();

  if (entry_id) {
    // Purge specific entry
    const { data: entry, error: entryError } = await serviceClient
      .from("dead_letter_entries")
      .select("id, status")
      .eq("id", entry_id)
      .eq("program_id", params.id)
      .single();

    if (entryError || !entry) {
      return apiError("Dead letter entry not found", 404);
    }

    if (entry.status === "purged") {
      return apiError("Entry already purged", 400);
    }

    const { error } = await serviceClient
      .from("dead_letter_entries")
      .update({
        status: "purged",
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry_id);

    if (error) {
      console.error("Purge error:", error);
      return apiError("Failed to purge dead letter entry", 500);
    }

    return NextResponse.json({
      success: true,
      message: "Dead letter entry purged successfully",
    });
  } else if (all_pending) {
    // Purge all pending entries for this program
    const { data: entries, error: fetchError } = await serviceClient
      .from("dead_letter_entries")
      .select("id")
      .eq("program_id", params.id)
      .eq("status", "pending");

    if (fetchError) {
      console.error("Fetch entries error:", fetchError);
      return apiError("Failed to fetch dead letter entries", 500);
    }

    const entryIds = (entries as { id: string }[] | null)?.map((e) => e.id) || [];

    if (entryIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending entries to purge",
        count: 0,
      });
    }

    const { error } = await serviceClient
      .from("dead_letter_entries")
      .update({
        status: "purged",
        updated_at: new Date().toISOString(),
      })
      .in("id", entryIds);

    if (error) {
      console.error("Bulk purge error:", error);
      return apiError("Failed to purge dead letter entries", 500);
    }

    return NextResponse.json({
      success: true,
      message: `Purged ${entryIds.length} pending entries`,
      count: entryIds.length,
    });
  } else {
    return apiError("Provide entry_id or all_pending=true", 400);
  }
}