import { cron } from "inngest";
import { inngest } from "@/lib/inngest";
import { createServiceClient } from "@/lib/api";
import { sendSecurityAlertEmail } from "@/lib/email";

type AppLogAlertRow = {
  id: string;
  level: string;
  source: string;
  event: string;
  status: string;
  message: string;
  created_at: string;
};

type DeletionAlertRow = {
  id: string;
  deleted_user_id: string;
  status: string;
  errors: unknown;
  created_at: string;
};

export const securityMonitor = inngest.createFunction(
  { id: "security-monitor", name: "Security Monitoring Alerts", triggers: cron("*/15 * * * *") },
  async ({ step, logger }) => {
    const db = createServiceClient();
    const alertEmail =
      process.env.SECURITY_ALERT_EMAIL ??
      process.env.SECURITY_EMAIL ??
      "security@corelyx.app";
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const result = await step.run("collect-security-signals", async () => {
      const [logsRes, deletionRes] = await Promise.all([
        db
          .from("app_logs")
          .select("id, level, source, event, status, message, created_at")
          .in("level", ["warning", "error"])
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(25),
        db
          .from("account_deletion_audit")
          .select("id, deleted_user_id, status, errors, created_at")
          .eq("status", "failed")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      return {
        logs: (logsRes.data ?? []) as unknown as AppLogAlertRow[],
        deletions: (deletionRes.data ?? []) as unknown as DeletionAlertRow[],
      };
    });

    if (result.logs.length === 0 && result.deletions.length === 0) {
      return { alerted: false, logs: 0, deletions: 0 };
    }

    await step.run("send-security-alert", async () => {
      await sendSecurityAlertEmail({
        to: alertEmail,
        subject: `Corelyx security monitor: ${result.logs.length + result.deletions.length} signal(s)`,
        summary: `Security monitor found ${result.logs.length} warning/error app log(s) and ${result.deletions.length} failed deletion audit record(s) since ${since}.`,
        items: [
          ...result.logs.map((log) => ({
            title: `${log.level.toUpperCase()} ${log.source}.${log.event}`,
            body: `${log.message}\nStatus: ${log.status}\nCreated: ${log.created_at}\nLog ID: ${log.id}`,
          })),
          ...result.deletions.map((deletion) => ({
            title: `Failed account deletion audit ${deletion.id}`,
            body: `Deleted user ID: ${deletion.deleted_user_id}\nCreated: ${deletion.created_at}\nErrors: ${JSON.stringify(deletion.errors)}`,
          })),
        ],
      });
    });

    logger.warn(`Security monitor sent alert to ${alertEmail}`);
    return { alerted: true, logs: result.logs.length, deletions: result.deletions.length };
  }
);
