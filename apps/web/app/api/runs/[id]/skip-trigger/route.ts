import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import type { ProgramSchema } from "@flowos/schema";

// POST /api/runs/[id]/skip-trigger — mark the trigger node as completed so the runtime proceeds
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const serviceClient = createServiceClient();
  const supabase = await createServerClient();

  // Fetch run + verify ownership via program
  const { data: runRaw, error: runError } = await serviceClient
    .from("runs")
    .select("id, program_id, status")
    .eq("id", params.id)
    .single();

  if (runError || !runRaw) return apiError("Run not found", 404);

  const run = runRaw as { id: string; program_id: string; status: string };

  const { data: program, error: progError } = await supabase
    .from("programs")
    .select("id, schema")
    .eq("id", run.program_id)
    .eq("user_id", user.id)
    .single();

  if (progError || !program) return apiError("Not found", 404);

  if (!["running", "pending"].includes(run.status)) {
    return apiError("Run is not active", 422);
  }

  const schema = (program as unknown as { schema: ProgramSchema }).schema;
  const triggerNode = schema.nodes.find((n) => n.type === "trigger");
  if (!triggerNode) return apiError("No trigger node in this program", 422);

  // Check it hasn't already completed. Use limit(1) (not maybeSingle) so any
  // legacy duplicate rows — which can exist because node_executions has no
  // unique constraint on (run_id, node_id) — don't crash this endpoint.
  const { data: existingRows } = await serviceClient
    .from("node_executions")
    .select("id, status")
    .eq("run_id", run.id)
    .eq("node_id", triggerNode.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const existingRow =
    (existingRows?.[0] as { id: string; status: string } | undefined) ?? null;

  if (existingRow && ["completed", "success"].includes(existingRow.status)) {
    return apiError("Trigger node already completed", 422);
  }

  const now = new Date().toISOString();

  if (existingRow) {
    await serviceClient
      .from("node_executions")
      .update({
        status: "completed",
        output_payload: { skipped: true, reason: "user_manual_skip" },
        completed_at: now,
      })
      .eq("id", existingRow.id);
  } else {
    await serviceClient.from("node_executions").insert({
      run_id: run.id,
      node_id: triggerNode.id,
      status: "completed",
      output_payload: { skipped: true, reason: "user_manual_skip" },
      started_at: now,
      completed_at: now,
    } as unknown as never);
  }

  // Release any resource locks held by this run — a previous dispatch task may
  // have died while holding them, which would block the re-dispatch below.
  await serviceClient
    .from("resource_locks")
    .delete()
    .eq("locked_by_run_id", run.id);

  // Re-dispatch to the runtime so it picks up from the completed trigger and runs downstream nodes
  const { data: linkedConns } = await serviceClient
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", run.program_id);

  const connectionIds = (linkedConns ?? []).map((r: { connection_id: string }) => r.connection_id);

  type ConnectionRow = { id: string; name: string };
  let connections: ConnectionRow[] = [];
  if (connectionIds.length > 0) {
    const { data } = await serviceClient
      .from("connections")
      .select("id, name")
      .in("id", connectionIds)
      .eq("user_id", user.id);
    connections = (data ?? []) as ConnectionRow[];
  }

  const runtimeUrl = process.env.RUNTIME_URL ?? "http://localhost:8000";
  const runtimeSecret = process.env.RUNTIME_SECRET ?? "";

  try {
    const runtimeRes = await fetch(`${runtimeUrl}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-runtime-secret": runtimeSecret },
      body: JSON.stringify({
        run_id: run.id,
        program_id: run.program_id,
        user_id: user.id,
        schema,
        triggered_by: "manual",
        connections: Object.fromEntries(connections.map((c) => [c.name, c.id])),
      }),
      cache: "no-store",
    });
    if (!runtimeRes.ok) {
      const body = await runtimeRes.text().catch(() => "");
      return apiError(
        `Runtime rejected re-dispatch (${runtimeRes.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
        502
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return apiError(`Runtime is unreachable — is the runtime service running? (${msg})`, 503);
  }

  return NextResponse.json({ ok: true });
}
