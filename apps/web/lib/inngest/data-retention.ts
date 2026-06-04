import { NonRetriableError, cron } from "inngest";
import { inngest } from "@/lib/inngest";
import { createServiceClient } from "@/lib/api";

const DEFAULT_PAYLOAD_RETENTION_DAYS = 30;
const DEFAULT_RUN_RETENTION_DAYS = 90;
const DEFAULT_AUDIT_RETENTION_DAYS = 365;
const DEFAULT_IP_ANONYMIZE_DAYS = 7;

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
    const ipAnonymizeDays = positiveIntFromEnv(
      "RETENTION_IP_ANONYMIZE_DAYS",
      DEFAULT_IP_ANONYMIZE_DAYS
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

    // Anonymise any IP address that incidentally landed in a diagnostic log,
    // older than the (short) IP retention window. Backs the Privacy Policy
    // commitment that IPs are anonymised within 7 days.
    const ipResult = await step.run("anonymize-expired-log-ips", async () => {
      const db = createServiceClient();
      const rpc = db.rpc as unknown as (
        fn: string,
        args: Record<string, string>
      ) => PromiseLike<RetentionRpcResult>;
      const { data, error } = await rpc("anonymize_expired_log_ips", {
        p_retention: intervalDays(ipAnonymizeDays),
      });

      if (error) {
        throw new NonRetriableError(`Log IP anonymization failed: ${error.message}`);
      }

      return data;
    });

    logger.info("Data retention purge completed", {
      result,
      ipResult,
      payloadRetentionDays,
      runRetentionDays,
      auditRetentionDays,
      ipAnonymizeDays,
    });

    return {
      result,
      ipResult,
      payloadRetentionDays,
      runRetentionDays,
      auditRetentionDays,
      ipAnonymizeDays,
    };
  }
);
