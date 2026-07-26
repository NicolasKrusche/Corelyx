import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";

// GET /api/approvals/[id]/timeline
// Returns the full audit trail / timeline for an approval
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const serviceClient = createServiceClient();
  const { id: approvalId } = params;

  // Fetch the approval itself
  const { data: approval, error: approvalError } = await serviceClient
    .from("approvals")
    .select("id, user_id, status, context, created_at, decided_at, decision_note, sla_hours")
    .eq("id", approvalId)
    .single();

  if (approvalError || !approval) return apiError("Approval not found", 404);

  // Verify the user has access (owner or workspace member)
  const programId =
    approval.context &&
    typeof approval.context.program_id === "string"
      ? approval.context.program_id
      : null;

  let hasAccess = approval.user_id === user.id;

  if (!hasAccess && programId) {
    const { data: programData } = await serviceClient
      .from("programs")
      .select("workspace_id")
      .eq("id", programId)
      .single();

    if (
      programData &&
      typeof programData === "object" &&
      "workspace_id" in programData
    ) {
      const { data: memberData } = await serviceClient
        // `workspace_members` does not exist — the table is
        // `workspace_memberships`, and it has a composite (workspace_id,
        // user_id) primary key rather than an `id` column.
        .from("workspace_memberships")
        .select("user_id")
        .eq("workspace_id", programData.workspace_id as string)
        .eq("user_id", user.id)
        .limit(1);

      if (memberData && Array.isArray(memberData) && memberData.length > 0) {
        hasAccess = true;
      }
    }
  }

  if (!hasAccess) return apiError("Unauthorized", 403);

  // Fetch escalation history
  const { data: escalations } = await serviceClient
    .from("approval_escalations")
    .select("id, approval_id, escalated_to, escalation_reason, created_at")
    .eq("approval_id", approvalId)
    .order("created_at", { ascending: true });

  // Build timeline events
  type TimelineEvent = {
    id: string;
    type: string;
    timestamp: string;
    actor: string;
    details: Record<string, unknown>;
  };

  const events: TimelineEvent[] = [];

  // 1. Approval created
  events.push({
    id: `created-${approvalId}`,
    type: "created",
    timestamp: approval.created_at,
    actor: "system",
    details: {
      sla_hours: approval.sla_hours ?? 24,
      context: approval.context,
    },
  });

  // 2. Escalations
  if (escalations && Array.isArray(escalations)) {
    for (const esc of escalations) {
      events.push({
        id: `escalation-${esc.id}`,
        type: "escalated",
        timestamp: esc.created_at,
        actor: esc.escalated_to,
        details: {
          reason: esc.escalation_reason,
        },
      });
    }
  }

  // 3. Decision
  if (approval.status !== "pending" && approval.decided_at) {
    events.push({
      id: `decision-${approvalId}`,
      type: "decided",
      timestamp: approval.decided_at,
      actor: user.id,
      details: {
        status: approval.status,
        decision_note: approval.decision_note,
      },
    });
  }

  // Sort by timestamp
  events.sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return NextResponse.json({
    approval_id: approvalId,
    status: approval.status,
    sla_hours: approval.sla_hours ?? 24,
    created_at: approval.created_at,
    timeline: events,
  });
}
