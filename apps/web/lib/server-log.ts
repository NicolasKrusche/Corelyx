/**
 * Lightweight structured logger for server-side API routes.
 *
 * Writes a single JSON line to stdout/stderr so log aggregators (Vercel, Datadog,
 * etc.) can parse and index it. Never accepts raw Error objects or unknown payloads
 * — callers must extract the fields they want to record, which prevents accidental
 * leakage of stack traces, API keys embedded in error messages, or PII.
 *
 * Use writeAppLog (lib/app-logs.ts) for user-visible audit events that should be
 * stored in the database. Use serverLog for low-level operational noise (vault
 * failures, secondary insert errors, non-fatal fallbacks) where a DB round-trip
 * is not appropriate.
 */

type Level = "info" | "warn" | "error";

export interface ServerLogEntry {
  /** Severity level. */
  level: Level;
  /** Short dot-namespaced event identifier, e.g. "genesis.vault.retrieve_failed". */
  event: string;
  /** Human-readable summary. Must not contain raw error messages, tokens, or PII. */
  message: string;
  /** Optional structured context. Values must be safe to log (no secrets). */
  details?: Record<string, string | number | boolean | null>;
}

export function serverLog(entry: ServerLogEntry): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: entry.level,
    event: entry.event,
    message: entry.message,
    ...(entry.details ? { details: entry.details } : {}),
  });

  if (entry.level === "error") {
    console.error(line);
  } else if (entry.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
