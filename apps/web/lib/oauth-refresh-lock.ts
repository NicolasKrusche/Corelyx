/**
 * Distributed lock for OAuth token refresh — server-side only.
 *
 * The web app's getValidOAuthToken is the single place that actually performs a
 * token refresh + vault rotation, and it is reached from many paths (UI resource
 * pickers, connection tests, Gmail push webhooks, Gmail watch renewal, and the
 * internal /token endpoint the Python runtime calls). Without serialization, two
 * concurrent refreshes for the same connection both read the same refresh_token
 * and both call the provider. For providers that ROTATE refresh tokens on use
 * (Dropbox, Twitter/X, increasingly Google/Microsoft), the second call presents a
 * now-consumed token, fails, and the connection gets marked invalid — a silent,
 * hard-to-reproduce break that gets more frequent as concurrency grows.
 *
 * This is the authoritative lock. It intentionally reuses the same
 * `credential_locks` table and the same `cred_lock:<connection_id>` key as the
 * runtime's CredentialLock, so web- and runtime-initiated refreshes mutually
 * exclude. (The runtime no longer takes that lock itself — it would deadlock
 * against the lock this code takes when the runtime calls the /token endpoint.)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@flowos/db";

type Client = SupabaseClient<Database>;

// `credential_locks` is a server-only operational table (shared with the Python
// runtime) that is not part of the generated Database types. Access it through an
// untyped view of the client rather than fighting the schema types.
function locksTable(supabase: Client) {
  return (supabase as unknown as SupabaseClient).from("credential_locks");
}

// Safety expiry for a crashed holder. The critical section is one provider HTTP
// refresh (sub-second typically), so a generous-but-bounded TTL is fine.
const LOCK_TTL_MS = 20_000;
const RETRY_INTERVAL_MS = 250;
// MUST exceed LOCK_TTL_MS so a waiter outlasts (and can reclaim) a dead holder's
// lock instead of giving up while the expired row still sits there.
const MAX_WAIT_MS = 25_000;

function lockKeyFor(connectionId: string): string {
  return `cred_lock:${connectionId}`;
}

async function cleanupExpired(supabase: Client, lockKey: string): Promise<void> {
  await locksTable(supabase)
    .delete()
    .eq("lock_key", lockKey)
    .lt("expires_at", new Date().toISOString());
}

async function acquire(supabase: Client, lockKey: string, lockId: string): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const { error } = await locksTable(supabase).insert({
      lock_key: lockKey,
      lock_id: lockId,
      expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
    });

    if (!error) return true;

    const code = (error as { code?: string }).code;
    const message = (error.message || "").toLowerCase();
    const isConflict =
      code === "23505" || message.includes("duplicate") || message.includes("unique");
    if (!isConflict) {
      throw new Error(`Failed to acquire OAuth refresh lock: ${error.message}`);
    }

    // Held by someone else — reclaim it if it has expired, then wait and retry.
    await cleanupExpired(supabase, lockKey);
    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
  }
  return false;
}

async function release(supabase: Client, lockKey: string, lockId: string): Promise<void> {
  try {
    // Scope the delete to our own lock_id so we never release a lock another
    // holder acquired after ours expired and was reclaimed.
    await locksTable(supabase)
      .delete()
      .eq("lock_key", lockKey)
      .eq("lock_id", lockId);
  } catch {
    // Best-effort: the TTL guarantees the lock is eventually reclaimable anyway.
  }
}

/**
 * Thrown when the refresh lock could not be acquired within MAX_WAIT_MS.
 * This is a TRANSIENT condition (another refresher is mid-flight) — callers
 * that talk to the runtime should surface it as a retryable 503, not a 500.
 */
export class OAuthRefreshLockTimeoutError extends Error {
  constructor() {
    super("Could not acquire OAuth refresh lock — another refresh is in progress. Please retry.");
    this.name = "OAuthRefreshLockTimeoutError";
  }
}

/**
 * Run `fn` while holding the connection's refresh lock. Fails CLOSED: if the lock
 * cannot be acquired within MAX_WAIT_MS, it throws rather than running unlocked —
 * a transient, retryable error is far better than a corrupted refresh_token.
 */
export async function withConnectionRefreshLock<T>(
  supabase: Client,
  connectionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = lockKeyFor(connectionId);
  const lockId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const acquired = await acquire(supabase, lockKey, lockId);
  if (!acquired) {
    throw new OAuthRefreshLockTimeoutError();
  }

  try {
    return await fn();
  } finally {
    await release(supabase, lockKey, lockId);
  }
}
