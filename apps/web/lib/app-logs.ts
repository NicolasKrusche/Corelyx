import type { Json } from "@flowos/db";
import { createServiceClient } from "@/lib/api";
import { redactSecretText, redactSecrets } from "@/lib/redaction";

type AppLogLevel = "info" | "warning" | "error";

type AppLogInput = {
  userId: string;
  level: AppLogLevel;
  source: string;
  event: string;
  status: string;
  message: string;
  details?: Record<string, unknown> | null;
  programId?: string | null;
  runId?: string | null;
  durationMs?: number | null;
};

type AppLogClient = {
  from(table: "app_logs"): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
};

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(redactSecrets(value ?? null))) as Json;
}

export function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecretText(error.message),
      stack: error.stack ? redactSecretText(error.stack).slice(0, 4000) : null,
    };
  }

  return {
    message: redactSecretText(String(error)),
  };
}

export function truncateForLog(value: unknown, maxLength = 2000): string {
  const redacted = redactSecrets(value);
  const text = typeof redacted === "string" ? redacted : JSON.stringify(redacted);
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...[${text.length} chars total]` : text;
}

export async function writeAppLog(
  client: AppLogClient,
  input: AppLogInput
) {
  const row = {
    user_id: input.userId,
    program_id: input.programId ?? null,
    run_id: input.runId ?? null,
    level: input.level,
    source: input.source,
    event: input.event,
    status: input.status,
    message: redactSecretText(input.message),
    details: input.details ? toJson(input.details) : null,
    duration_ms: input.durationMs ?? null,
  };

  const { error } = await client.from("app_logs").insert(row);
  if (!error) return;

  // User-scoped clients can lack an app_logs INSERT policy (the immutable-logs
  // migration recreated only SELECT), which silently discarded every log for
  // weeks. Audit events must not depend on the caller's RLS grants — retry with
  // the service role before giving up.
  try {
    const { error: serviceError } = await (createServiceClient() as unknown as AppLogClient)
      .from("app_logs")
      .insert(row);
    if (!serviceError) return;
    console.warn("[app-logs] failed to write app log:", serviceError.message);
  } catch (serviceClientError) {
    console.warn(
      "[app-logs] failed to write app log:",
      error.message,
      "| service fallback unavailable:",
      serviceClientError instanceof Error ? serviceClientError.message : String(serviceClientError)
    );
  }
}
