import { NonRetriableError, cron } from "inngest";
import { inngest } from "@/lib/inngest";
import { createServiceClient } from "@/lib/api";

const DEFAULT_PAYLOAD_RETENTION_DAYS = 30;
const DEFAULT_RUN_RETENTION_DAYS = 90;
const DEFAULT_AUDIT_RETENTION_DAYS = 365;

type RetentionRpcResult = {
  data: unknown;
  error: { message: string } | null;
};

function positiveIntFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function intervalDays(days: number) {
  return `${days} days`;
}

export const dataRetentionPurge = inngest.createFunction(
  { id: "data-retention-purge", name: "Data Retention Purge", triggers: cron("17 2 * * *") },
  async ({ step, logger }) => {
    const payloadRetentionDays = positiveIntFromEnv(
      "EXECUTION_PAYLOAD_RETENTION_DAYS",
      DEFAULT_PAYLOAD_RETENTION_DAYS
    );
    const runRetentionDays = positiveIntFromEnv(
      "EXECUTION_RUN_RETENTION_DAYS",
      DEFAULT_RUN_RETENTION_DAYS
    );
    const auditRetentionDays = positiveIntFromEnv(
      "RETENTION_AUDIT_RETENTION_DAYS",
      DEFAULT_AUDIT_RETENTION_DAYS
    );

    const result = await step.run("purge-expired-operational-data", async () => {
      const db = createServiceClient();
      const rpc = db.rpc as unknown as (
        fn: string,
        args: Record<string, string>
      ) => PromiseLike<RetentionRpcResult>;
      const { data, error } = await rpc("purge_expired_operational_data", {
        p_payload_retention: intervalDays(payloadRetentionDays),
        p_run_retention: intervalDays(runRetentionDays),
        p_audit_retention: intervalDays(auditRetentionDays),
      });

      if (error) {
        throw new NonRetriableError(`Data retention purge failed: ${error.message}`);
      }

      return data;
    });

    logger.info("Data retention purge completed", {
      result,
      payloadRetentionDays,
      runRetentionDays,
      auditRetentionDays,
    });

    return {
      result,
      payloadRetentionDays,
      runRetentionDays,
      auditRetentionDays,
    };
  }
);
