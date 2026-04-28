import { NonRetriableError } from "inngest";
import { inngest } from "@/lib/inngest";
import { createServiceClient } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";

const DEFAULT_TIMEOUT_HOURS = 24;

type PendingApproval = {
  id: string;
  user_id: string;
  node_execution_id: string;
  created_at: string;
  context: {
    timeout_hours?: number;
    node_label?: string;
    program_id?: string;
    [k: string]: unknown;
  } | null;
};

/**
 * Inngest function: runs every minute.
 * Finds pending approvals whose timeout has elapsed and auto-rejects them,
 * then fails the associated node_execution so the runtime polling loop
 * sees the rejection and unblocks (treating it as a rejection).
 *
 * Timeout is read from approval.context.timeout_hours (stored by the runtime
 * executor). Falls back to DEFAULT_TIMEOUT_HOURS (24h) for older approvals.
 */
export const approvalTimeout = inngest.createFunction(
  { id: "approval-timeout", name: "Approval Timeout Enforcer" },
  { cron: "* * * * *" },
  async ({ step, logger }) => {
    const db = createServiceClient();

    const pending = await step.run("fetch-pending", async () => {
      const { data, error } = await db
        .from("approvals")
        .select("id, user_id, node_execution_id, created_at, context")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(200);

      if (error) throw new NonRetriableError(`DB error: ${error.message}`);
      return (data ?? []) as unknown as PendingApproval[];
    });

    if (pending.length === 0) return { expired: 0 };

    const now = Date.now();
    const expired = pending.filter((approval) => {
      const timeoutHours = approval.context?.timeout_hours ?? DEFAULT_TIMEOUT_HOURS;
      const createdAt = new Date(approval.created_at).getTime();
      const expiresAt = createdAt + timeoutHours * 60 * 60 * 1000;
      return now >= expiresAt;
    });

    if (expired.length === 0) return { expired: 0 };

    let count = 0;

    for (const approval of expired) {
      await step.run(`expire-${approval.id}`, async () => {
        const now_iso = new Date().toISOString();

        // Mark approval as rejected with an auto-timeout note
        const { error: approvalErr } = await db
          .from("approvals")
          .update({
            status: "rejected",
            decision_note: "Auto-rejected: approval timeout elapsed.",
            decided_at: now_iso,
          } as never)
          .eq("id", approval.id)
          .eq("status", "pending"); // Guard against race with human decision

        if (approvalErr) {
          logger.warn(`Failed to expire approval ${approval.id}: ${approvalErr.message}`);
          return;
        }

        // Fail the associated node_execution so the runtime polling loop unblocks
        await db
          .from("node_executions")
          .update({ status: "failed", error_message: "Approval timed out." } as never)
          .eq("id", approval.node_execution_id);

        // Immutable audit-log entry mirroring the manual-decision path. AI Act
        // Art. 14 requires that auto-rejections from missed deadlines are also
        // attributable in the audit trail — not silently dropped.
        const programIdFromContext =
          approval.context && typeof approval.context.program_id === "string"
            ? approval.context.program_id
            : null;
        const nodeLabel =
          approval.context && typeof approval.context.node_label === "string"
            ? approval.context.node_label
            : "unknown";
        await writeAppLog(db, {
          userId: approval.user_id,
          level: "warning",
          source: "Approvals",
          event: "approval.auto_rejected_timeout",
          status: "rejected",
          message: `Approval auto-rejected (timeout elapsed) for node "${nodeLabel}".`,
          programId: programIdFromContext,
          durationMs: new Date(now_iso).getTime() - new Date(approval.created_at).getTime(),
          details: {
            approval_id: approval.id,
            node_execution_id: approval.node_execution_id,
            decided_by: "system:approval-timeout-enforcer",
            decided_at: now_iso,
            requested_at: approval.created_at,
            timeout_hours: approval.context?.timeout_hours ?? DEFAULT_TIMEOUT_HOURS,
            context_at_decision: approval.context,
          },
        });

        count++;
        logger.info(`Expired approval ${approval.id} (timeout elapsed)`);
      });
    }

    return { expired: count };
  }
);
