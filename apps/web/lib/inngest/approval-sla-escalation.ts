import { NonRetriableError, cron } from "inngest";
import { inngest } from "@/lib/inngest";
import { createServiceClient } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";
import { sendApprovalEmail } from "@/lib/email";
import { notifyUserPush } from "@/lib/notify";
import { isNotificationEnabled } from "@/lib/notification-prefs";

const DEFAULT_SLA_HOURS = 24;

type PendingApproval = {
  id: string;
  user_id: string;
  node_execution_id: string;
  created_at: string;
  sla_hours: number | null;
  context: {
    node_label?: string;
    program_id?: string;
    approver?: string;
    timeout_hours?: number;
    [k: string]: unknown;
  } | null;
  node_executions: {
    runs: {
      programs: { name: string };
    };
  };
};

type EscalationRow = {
  approval_id: string;
  escalated_to: string;
  escalation_reason: string;
  created_at: string;
};

/**
 * Inngest function: runs every 5 minutes.
 * Finds pending approvals whose SLA has elapsed but that haven't been auto-rejected
 * yet (that's the separate approval-timeout function). This function handles the
 * *escalation* step: when an approval breaches its SLA, it notifies workspace
 * admins and records an escalation event for audit trails.
 *
 * Escalation flow:
 *   1. Find pending approvals where now > created_at + sla_hours
 *   2. Check if already escalated (no duplicate escalations for same SLA breach)
 *   3. Find workspace admins for the approval's program
 *   4. Send escalation email + push to each admin
 *   5. Record the escalation in approval_escalations
 */
export const approvalSlaEscalation = inngest.createFunction(
  {
    id: "approval-sla-escalation",
    name: "Approval SLA Escalation Checker",
    triggers: cron("*/5 * * * *"),
  },
  async ({ step, logger }) => {
    const db = createServiceClient();

    // 1. Fetch pending approvals with SLA info
    const pending = await step.run("fetch-pending-with-sla", async () => {
      const { data, error } = await db
        .from("approvals")
        .select(
          `
          id,
          user_id,
          node_execution_id,
          created_at,
          sla_hours,
          context,
          node_executions (
            runs (
              programs ( name, id )
            )
          )
        `
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(200);

      if (error) throw new NonRetriableError(`DB error: ${error.message}`);
      return (data ?? []) as unknown as PendingApproval[];
    });

    if (pending.length === 0) return { escalated: 0 };

    // 2. Filter to those that have breached SLA
    const now = Date.now();
    const breached = pending.filter((approval) => {
      const slaHours = approval.sla_hours ?? DEFAULT_SLA_HOURS;
      const createdAt = new Date(approval.created_at).getTime();
      const slaDeadline = createdAt + slaHours * 60 * 60 * 1000;
      return now >= slaDeadline;
    });

    if (breached.length === 0) return { escalated: 0 };

    let escalated = 0;

    for (const approval of breached) {
      await step.run(`escalate-${approval.id}`, async () => {
        // Check if already escalated for this SLA breach
        const slaHours = approval.sla_hours ?? DEFAULT_SLA_HOURS;
        const createdAt = new Date(approval.created_at).getTime();
        const slaDeadline = new Date(createdAt + slaHours * 60 * 60 * 1000);

        const { data: existingEscalations } = await db
          .from("approval_escalations")
          .select("id")
          .eq("approval_id", approval.id)
          .gte("created_at", slaDeadline.toISOString())
          .limit(1);

        if (existingEscalations && existingEscalations.length > 0) {
          // Already escalated for this SLA window — skip
          return;
        }

        // Find workspace admins for this program
        const programId =
          approval.context &&
          typeof approval.context.program_id === "string"
            ? approval.context.program_id
            : null;

        let adminEmails: string[] = [];
        let adminUserIds: string[] = [];

        if (programId) {
          // Get workspace_id from programs table
          const { data: programData } = await db
            .from("programs")
            .select("workspace_id")
            .eq("id", programId)
            .single();

          if (programData && typeof programData === "object" && "workspace_id" in programData) {
            const workspaceId = programData.workspace_id as string;

            // Get workspace admin users
            const { data: members } = await db
              .from("workspace_members")
              .select("user_id, role")
              .eq("workspace_id", workspaceId)
              .eq("role", "admin");

            if (members && Array.isArray(members)) {
              for (const member of members) {
                if (member.user_id !== approval.user_id) {
                  // Don't escalate to the original approver
                  adminUserIds.push(member.user_id);
                  // Fetch email
                  const { data: userData } = await db.auth.admin.getUserById(
                    member.user_id
                  );
                  if (userData?.user?.email) {
                    adminEmails.push(userData.user.email);
                  }
                }
              }
            }
          }
        }

        // If no admins found, try to escalate to any workspace member with admin role
        // For the program owner's workspace
        if (adminUserIds.length === 0 && approval.context) {
          // Fallback: notify the original user that their SLA has been breached
          // This ensures at least someone is notified
          const { data: userData } = await db.auth.admin.getUserById(
            approval.user_id
          );
          if (userData?.user?.email) {
            adminEmails = [userData.user.email];
            adminUserIds = [approval.user_id];
          }
        }

        if (adminUserIds.length === 0) {
          logger.warn(
            `No escalation targets found for approval ${approval.id}`
          );
          return;
        }

        const nodeLabel =
          approval.context?.node_label ?? "Unknown step";
        const programName =
          (approval.node_executions as unknown as PendingApproval["node_executions"])
            ?.runs?.programs?.name ?? "Unknown program";
        const approvalsUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.corelyx.app"}/approvals`;

        // Send escalation notifications to each admin
        for (let i = 0; i < adminUserIds.length; i++) {
          const adminUserId = adminUserIds[i];
          const adminEmail = adminEmails[i];

          try {
            // Email escalation notification
            if (
              await isNotificationEnabled(adminUserId, "approvals")
            ) {
              await sendApprovalEmail({
                to: adminEmail,
                nodeLabel: `[ESCALATED] ${nodeLabel}`,
                programName,
                approvalId: approval.id,
                reason: `This approval has breached its ${slaHours}h SLA and has been escalated to you.`,
              });
            }

            // Push notification
            void notifyUserPush(adminUserId, "approvals", {
              title: "Approval escalated",
              body: `${nodeLabel} in ${programName} has breached its SLA and needs urgent attention.`,
              data: {
                kind: "approval_escalation",
                approval_id: approval.id,
                program_id: programId,
              },
            });
          } catch (err) {
            logger.error(
              `Failed to send escalation notification to ${adminUserId}: ${String(err)}`
            );
          }
        }

        // Record escalation events
        const now_iso = new Date().toISOString();
        for (const adminUserId of adminUserIds) {
          await db.from("approval_escalations").insert({
            approval_id: approval.id,
            escalated_to: adminUserId,
            escalation_reason: "sla_breach",
          } as never);
        }

        // Write audit log
        await writeAppLog(db, {
          userId: approval.user_id,
          level: "warning",
          source: "Approvals",
          event: "approval.sla_escalated",
          status: "escalated",
          message: `Approval for "${nodeLabel}" escalated after ${slaHours}h SLA breach. Escalated to ${adminUserIds.length} admin(s).`,
          programId,
          details: {
            approval_id: approval.id,
            node_execution_id: approval.node_execution_id,
            sla_hours: slaHours,
            breached_at: now_iso,
            escalated_to: adminUserIds,
            context_at_escalation: approval.context,
          },
        });

        escalated++;
        logger.info(
          `Escalated approval ${approval.id} to ${adminUserIds.length} admin(s) after ${slaHours}h SLA breach`
        );
      });
    }

    return { escalated };
  }
);
