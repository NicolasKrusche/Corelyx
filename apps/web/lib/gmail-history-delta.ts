export interface GmailHistoryDelta {
  message_ids: string[];
  thread_ids: string[];
  error?: string;
}

export function shouldDispatchGmailMessage(delta: GmailHistoryDelta): boolean {
  return delta.message_ids.length > 0;
}

/**
 * Normalize a Gmail historyId to a string.
 *
 * Gmail's Pub/Sub push payload delivers `historyId` as a JSON *number*, while
 * the Gmail watch API returns it as a *string*. If a number is persisted into
 * connection metadata and later read back with a `typeof === "string"` guard it
 * silently resolves to null, which breaks the history delta lookup and prevents
 * the workflow from ever firing on subsequent emails. Always coerce to a string
 * so reads and writes agree regardless of the source representation.
 */
export function coerceHistoryId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
