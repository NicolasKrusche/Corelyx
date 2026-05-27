import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { serverLog } from "@/lib/server-log";

// POST /api/dev/seed-approval
// Dev-only: creates a fake program → run → node_execution → approval
// so you can see the approval UI without needing a real workflow run.
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return apiError("Not available in production", 403);
  }

  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const db = createServiceClient();

  // Look up the user's workspace (programs.workspace_id is NOT NULL)
  const { data: membership } = await db
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!membership) return apiError("No workspace found for user", 400);
  const workspaceId = (membership as { workspace_id: string }).workspace_id;

  // 1. Create a throwaway program
  const { data: program, error: programErr } = await db
    .from("programs")
    .insert({
      user_id: user.id,
      workspace_id: workspaceId,
      name: "[Test] Approval seed",
      description: "Created by the dev seed tool — safe to delete.",
      schema: { nodes: [], edges: [] },
      execution_mode: "supervised",
    } as never)
    .select("id")
    .single();

  if (programErr || !program) {
    serverLog({ level: "error", event: "dev.seed_approval.program_insert_failed", message: "Dev seed: program insert failed." });
    return apiError(programErr?.message ?? "Failed to create program", 500);
  }

  // 2. Create a run under that program
  const { data: run, error: runErr } = await db
    .from("runs")
    .insert({
      program_id: (program as { id: string }).id,
      triggered_by: "manual",
      status: "paused",
      started_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();

  if (runErr || !run) {
    serverLog({ level: "error", event: "dev.seed_approval.run_insert_failed", message: "Dev seed: run insert failed." });
    return apiError(runErr?.message ?? "Failed to create run", 500);
  }

  // 3. Create a node_execution waiting for approval
  const { data: nodeExec, error: nodeErr } = await db
    .from("node_executions")
    .insert({
      run_id: (run as { id: string }).id,
      node_id: "agent-1",
      status: "waiting_approval",
      input_payload: {
        to: "customer@example.com",
        subject: "Your order has shipped",
        body: "Hi there! Your order #1042 has been shipped and will arrive in 2–3 business days.",
      },
      started_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();

  if (nodeErr || !nodeExec) {
    serverLog({ level: "error", event: "dev.seed_approval.node_execution_insert_failed", message: "Dev seed: node_execution insert failed." });
    return apiError(nodeErr?.message ?? "Failed to create node execution", 500);
  }

  // 4. Create the approval row
  const { data: approval, error: approvalErr } = await db
    .from("approvals")
    .insert({
      node_execution_id: (nodeExec as { id: string }).id,
      user_id: user.id,
      status: "pending",
      context: {
        node_label: "Send shipping confirmation email",
        program_id: (program as { id: string }).id,
        reason: "Approval required before sending email to customer.",
        input: {
          to: "customer@example.com",
          subject: "Your order has shipped",
          body: "Hi there! Your order #1042 has been shipped and will arrive in 2–3 business days.",
        },
      },
    } as never)
    .select("id")
    .single();

  if (approvalErr || !approval) {
    serverLog({ level: "error", event: "dev.seed_approval.approval_insert_failed", message: "Dev seed: approval insert failed." });
    return apiError(approvalErr?.message ?? "Failed to create approval", 500);
  }

  return NextResponse.json({ ok: true, approvalId: (approval as { id: string }).id });
}
