import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { checkHITLAccess } from "@/lib/limits";
import { writeAppLog } from "@/lib/app-logs";
import { ensureProcessingAllowed } from "@/lib/compliance";

// POST /api/approvals/[id]
// Body: { decision: "approved" | "rejected"; note?: string }
// Updates approval status and node_execution accordingly.
//
// Compliance: every decision (approved | rejected) is also written to app_logs as
// an immutable audit record per EU AI Act Art. 14 / GDPR Art. 32 ("audit log of
// all admin actions"). The approvals row itself is mutable (status flips, decision_note
// can be edited via DB), so the app_logs entry is the durable trail of who decided
// what, when, and what context was visible at decision time.
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const hitlCheck = await checkHITLAccess(user.id);
  if (!hitlCheck.allowed) {
    return NextResponse.json(
      { error: "FEATURE_NOT_AVAILABLE", message: hitlCheck.upgradeMessage },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || !["approved", "rejected"].includes(body.decision)) {
    return apiError('decision must be "approved" or "rejected"', 400);
  }

  const { decision, note } = body as { decision: "approved" | "rejected"; note?: string };
  const { id: approvalId } = params;

  const serviceClient = createServiceClient();

  if (decision === "approved") {
    const processingRestriction = await ensureProcessingAllowed(user.id, serviceClient);
    if (processingRestriction) return processingRestriction;
  }

  // Fetch approval to verify ownership and capture decision-time context snapshot
  type ApprovalRow = {
    id: string;
    user_id: string;
    status: string;
    node_execution_id: string;
    context: Record<string, unknown> | null;
    created_at: string;
  };

  const { data: approvalRaw, error: fetchError } = await serviceClient
    .from("approvals")
    .select("id, user_id, status, node_execution_id, context, created_at")
    .eq("id", approvalId)
    .single();

  if (fetchError || !approvalRaw) return apiError("Approval not found", 404);

  const approval = approvalRaw as unknown as ApprovalRow;

  if (approval.user_id !== user.id) return apiError("Unauthorized", 403);
  if (approval.status !== "pending") {
    return apiError("Approval has already been decided", 409);
  }

  const now = new Date().toISOString();

  // Update approval
  const { error: updateApprovalError } = await serviceClient
    .from("approvals")
    .update({
      status: decision,
      decision_note: note ?? null,
      decided_at: now,
    } as unknown as never)
    .eq("id", approvalId);

  if (updateApprovalError) return apiError(updateApprovalError.message, 500);

  // Update node_execution status
  const nodeExecStatus = decision === "approved" ? "running" : "failed";
  const { error: updateExecError } = await serviceClient
    .from("node_executions")
    .update({ status: nodeExecStatus } as unknown as never)
    .eq("id", approval.node_execution_id);

  if (updateExecError) return apiError(updateExecError.message, 500);

  // Immutable audit-log entry. Captures who decided, when, what they saw at
  // decision time (the context snapshot stored when the approval was requested),
  // and the resulting node_execution state. This is the AI Act Art. 14 /
  // GDPR Art. 32 audit trail — distinct from the mutable approvals row.
  const programIdFromContext =
    approval.context && typeof approval.context["program_id"] === "string"
      ? (approval.context["program_id"] as string)
      : null;
  await writeAppLog(serviceClient, {
    userId: user.id,
    level: decision === "approved" ? "info" : "warning",
    source: "Approvals",
    event: `approval.${decision}`,
    status: decision,
    message: `Approval ${decision} for node "${
      approval.context && typeof approval.context["node_label"] === "string"
        ? (approval.context["node_label"] as string)
        : "unknown"
    }".`,
    programId: programIdFromContext,
    durationMs: new Date(now).getTime() - new Date(approval.created_at).getTime(),
    details: {
      approval_id: approvalId,
      node_execution_id: approval.node_execution_id,
      decided_by: user.id,
      decided_at: now,
      requested_at: approval.created_at,
      decision_note: note ?? null,
      // Snapshot of what the approver saw at decision time.
      // input is the upstream-node payload visible in the approval card.
      context_at_decision: approval.context,
    },
  });

  return NextResponse.json({ success: true, decision });
}
