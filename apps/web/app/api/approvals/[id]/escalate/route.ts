import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { checkHITLAccess } from "@/lib/limits";
import { writeAppLog } from "@/lib/app-logs";

// POST /api/approvals/[id]/escalate
// Manually escalate an approval to workspace admins
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
  const escalationReason =
    body?.reason ?? "Manual escalation";

  const serviceClient = createServiceClient();
  const { id: approvalId } = params;

  // Fetch approval
  type ApprovalRow = {
    id: string;
    user_id: string;
    status: string;
    node_execution_id: string;
    context: Record<string, unknown> | null;
    created_at: string;
    sla_hours: number | null;
  };

  const { data: approvalRaw, error: fetchError } = await serviceClient
    .from("approvals")
    .select("id, user_id, status, node_execution_id, context, created_at, sla_hours")
    .eq("id", approvalId)
    .single();

  if (fetchError || !approvalRaw) return apiError("Approval not found", 404);
  const approval = approvalRaw as unknown as ApprovalRow;

  if (approval.status !== "pending") {
    return apiError("Approval has already been decided", 409);
  }

  // Only the owner or a workspace admin can escalate
  const programId =
    approval.context &&
    typeof approval.context.program_id === "string"
      ? (approval.context.program_id as string)
      : null;

  let isWorkspaceAdmin = false;
  if (programId) {
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
      const workspaceId = programData.workspace_id as string;
      const { data: memberData } = await serviceClient
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .single();

      if (memberData && typeof memberData === "object" && "role" in memberData) {
        isWorkspaceAdmin = memberData.role === "admin";
      }
    }
  }

  if (approval.user_id !== user.id && !isWorkspaceAdmin) {
    return apiError("Unauthorized", 403);
  }

  // Find workspace admins to escalate to
  type AdminMember = { user_id: string; role: string };
  let adminUserIds: string[] = [];

  if (programId) {
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
      const workspaceId = programData.workspace_id as string;
      const { data: members } = await serviceClient
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspaceId)
        .eq("role", "admin");

      if (members && Array.isArray(members)) {
        adminUserIds = (members as unknown as AdminMember[])
          .filter((m) => m.user_id !== approval.user_id)
          .map((m) => m.user_id);
      }
    }
  }

  if (adminUserIds.length === 0) {
    // Fallback: re-notify the original user
    adminUserIds = [approval.user_id];
  }

  // Record escalations
  const now = new Date().toISOString();
  for (const adminUserId of adminUserIds) {
    await serviceClient.from("approval_escalations").insert({
      approval_id: approvalId,
      escalated_to: adminUserId,
      escalation_reason: `manual:${escalationReason}`,
    } as never);
  }

  // Audit log
  const nodeLabel =
    approval.context &&
    typeof approval.context.node_label === "string"
      ? (approval.context.node_label as string)
      : "unknown";

  await writeAppLog(serviceClient, {
    userId: user.id,
    level: "warning",
    source: "Approvals",
    event: "approval.manual_escalation",
    status: "escalated",
    message: `Approval for "${nodeLabel}" manually escalated by user.`,
    programId,
    details: {
      approval_id: approvalId,
      node_execution_id: approval.node_execution_id,
      escalated_by: user.id,
      escalated_at: now,
      escalated_to: adminUserIds,
      escalation_reason: escalationReason,
      context_at_escalation: approval.context,
    },
  });

  return NextResponse.json({
    success: true,
    escalated_to: adminUserIds.length,
    reason: escalationReason,
  });
}
