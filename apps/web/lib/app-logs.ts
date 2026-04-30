import type { Json } from "@flowos/db";
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
  const { error } = await client.from("app_logs").insert({
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
  });

  if (error) {
    console.warn("[app-logs] failed to write app log:", error.message);
  }
}
