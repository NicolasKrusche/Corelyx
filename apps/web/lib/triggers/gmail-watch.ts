import { createServiceClient } from "@/lib/api";
import { getValidOAuthToken } from "@/lib/oauth-token";
import { serverLog } from "@/lib/server-log";
import { coerceHistoryId } from "@/lib/gmail-history-delta";

type Db = ReturnType<typeof createServiceClient>;

// Gmail watch subscriptions expire after 7 days. Renew well before that so a
// missed renewal window never leaves a mailbox without push notifications.
export const GMAIL_WATCH_REFRESH_AHEAD_MS = 24 * 60 * 60 * 1000;

export interface GmailWatchMetadata {
  topic_name?: string | null;
  history_id?: string | number | null;
  expiration?: string | null;
  updated_at?: string | null;
}

export interface EnsureGmailWatchOptions {
  topicName?: string;
  labelIds?: string[];
  labelFilterAction?: string;
  /** Re-register even if the current watch looks healthy. */
  force?: boolean;
}

export type EnsureGmailWatchResult =
  | { ok: true; watch: GmailWatchMetadata; skipped?: boolean }
  | { ok: false; status: number; error: string };

/** Resolve the Pub/Sub topic the Gmail watch should publish to. */
export function getGmailWatchTopic(): string | null {
  return process.env.GMAIL_WATCH_TOPIC || process.env.GOOGLE_GMAIL_WATCH_TOPIC || null;
}

/**
 * Decide whether a stored Gmail watch needs to be (re)registered. A watch needs
 * a refresh when it is missing, has no recorded historyId, has no expiration, or
 * is within the refresh-ahead window of expiring.
 */
export function gmailWatchNeedsRefresh(
  watch: GmailWatchMetadata | null | undefined,
  now: number = Date.now()
): boolean {
  if (!watch || !coerceHistoryId(watch.history_id)) return true;
  if (!watch.expiration) return true;
  const expiresAt = Date.parse(watch.expiration);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt - now <= GMAIL_WATCH_REFRESH_AHEAD_MS;
}

function _asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Register (or renew) the Gmail push-notification watch for a connection so the
 * Pub/Sub webhook starts receiving message events. Idempotent: skips work when a
 * healthy watch already exists unless `force` is set.
 */
export async function ensureGmailWatch(
  db: Db,
  connectionId: string,
  options: EnsureGmailWatchOptions = {}
): Promise<EnsureGmailWatchResult> {
  const { data: rowRaw, error } = await db
    .from("connections")
    .select("id, provider, is_valid, metadata")
    .eq("id", connectionId)
    .single();

  if (error || !rowRaw) {
    return { ok: false, status: 404, error: "Connection not found" };
  }

  const connection = rowRaw as unknown as {
    id: string;
    provider: string;
    is_valid: boolean | null;
    metadata: Record<string, unknown> | null;
  };

  if (connection.provider !== "gmail") {
    return { ok: false, status: 400, error: "Connection is not a Gmail connection" };
  }
  if (connection.is_valid === false) {
    return { ok: false, status: 409, error: "Connection is no longer valid" };
  }

  const metadata = connection.metadata ?? {};
  const existingWatch = _asRecord(metadata.gmail_watch) as GmailWatchMetadata | null;

  if (!options.force && !gmailWatchNeedsRefresh(existingWatch)) {
    return { ok: true, watch: existingWatch as GmailWatchMetadata, skipped: true };
  }

  const topicName = options.topicName || getGmailWatchTopic();
  if (!topicName) {
    return {
      ok: false,
      status: 400,
      error:
        "Missing Gmail watch topic. Set GMAIL_WATCH_TOPIC or pass topicName explicitly.",
    };
  }

  let accessToken: string;
  try {
    accessToken = await getValidOAuthToken(db, connection.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to retrieve OAuth token";
    return { ok: false, status: 500, error: message };
  }

  const watchReqBody: Record<string, unknown> = { topicName };
  if (options.labelIds && options.labelIds.length > 0) watchReqBody.labelIds = options.labelIds;
  if (options.labelFilterAction) watchReqBody.labelFilterAction = options.labelFilterAction;

  const watchRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(watchReqBody),
    cache: "no-store",
  });

  if (!watchRes.ok) {
    const text = await watchRes.text();
    return {
      ok: false,
      status: 502,
      error: `Gmail watch setup failed (${watchRes.status}): ${text.slice(0, 250)}`,
    };
  }

  const watchData = (await watchRes.json()) as { historyId?: string; expiration?: string };

  const gmailWatch: GmailWatchMetadata = {
    topic_name: topicName,
    // Store as a string so the webhook's history-delta lookup reads it back
    // consistently (Gmail returns it as a string here, as a number in pushes).
    history_id: coerceHistoryId(watchData.historyId),
    expiration:
      watchData.expiration && /^\d+$/.test(watchData.expiration)
        ? new Date(Number(watchData.expiration)).toISOString()
        : watchData.expiration ?? null,
    updated_at: new Date().toISOString(),
  };

  const nextMetadata: Record<string, unknown> = { ...metadata, gmail_watch: gmailWatch };

  const { error: updateError } = await db
    .from("connections")
    .update({ metadata: nextMetadata } as never)
    .eq("id", connection.id);

  if (updateError) {
    return { ok: false, status: 500, error: updateError.message };
  }

  return { ok: true, watch: gmailWatch };
}

/**
 * Register/renew Gmail watches for every Gmail connection that backs an active
 * Gmail event trigger. Safe to run repeatedly — it only touches watches that are
 * missing or near expiry. Returns a small summary for logging/observability.
 */
export async function renewGmailWatchesForActiveTriggers(
  db: Db
): Promise<{ checked: number; refreshed: number; failed: number }> {
  const { data: triggersRaw, error: trigErr } = await db
    .from("triggers")
    .select("program_id, config")
    .eq("type", "event")
    .eq("is_active", true);

  if (trigErr) {
    throw new Error(`Failed to load event triggers: ${trigErr.message}`);
  }

  const gmailProgramIds = new Set<string>();
  for (const row of (triggersRaw ?? []) as Array<{ program_id: string; config: Record<string, unknown> | null }>) {
    if (row.config?.source === "gmail") gmailProgramIds.add(row.program_id);
  }

  if (gmailProgramIds.size === 0) return { checked: 0, refreshed: 0, failed: 0 };

  const connectionIds = await gmailConnectionIdsForPrograms(db, [...gmailProgramIds]);
  if (connectionIds.length === 0) return { checked: 0, refreshed: 0, failed: 0 };

  let refreshed = 0;
  let failed = 0;
  for (const connectionId of connectionIds) {
    const result = await ensureGmailWatch(db, connectionId);
    if (result.ok) {
      if (!result.skipped) refreshed++;
    } else {
      failed++;
      serverLog({
        level: "warn",
        event: "gmail.watch.renew_failed",
        message: "Failed to register/renew a Gmail watch.",
        details: { connection_id: connectionId, status: result.status },
      });
    }
  }

  return { checked: connectionIds.length, refreshed, failed };
}

/**
 * Register/renew Gmail watches for the Gmail connections linked to a single
 * program. Used right after a program is saved so the user does not have to wait
 * for the periodic renewal job before their trigger starts receiving emails.
 */
export async function ensureGmailWatchesForProgram(db: Db, programId: string): Promise<void> {
  const connectionIds = await gmailConnectionIdsForPrograms(db, [programId]);
  for (const connectionId of connectionIds) {
    const result = await ensureGmailWatch(db, connectionId);
    if (!result.ok) {
      serverLog({
        level: "warn",
        event: "gmail.watch.register_failed",
        message: "Failed to register Gmail watch while saving program.",
        details: { program_id: programId, connection_id: connectionId, status: result.status },
      });
    }
  }
}

async function gmailConnectionIdsForPrograms(db: Db, programIds: string[]): Promise<string[]> {
  if (programIds.length === 0) return [];

  const { data: links } = await db
    .from("program_connections")
    .select("connection_id, connections(id, provider, is_valid)")
    .in("program_id", programIds);

  const ids = new Set<string>();
  for (const row of (links ?? []) as Array<{
    connection_id: string;
    connections: { id: string; provider: string; is_valid: boolean | null } | null;
  }>) {
    const conn = row.connections;
    if (conn && conn.provider === "gmail" && conn.is_valid !== false) {
      ids.add(conn.id);
    }
  }
  return [...ids];
}
