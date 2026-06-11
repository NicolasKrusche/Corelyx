import { createHash } from "crypto";
import { createServiceClient } from "@/lib/api";
import { serverLog } from "@/lib/server-log";
import {
  evaluateSentinel,
  SENTINEL_RULES,
  type SecurityScopeType,
  type SecuritySeverity,
} from "@/lib/security/sentinel-rules";

/**
 * Security sentinel — records security events, applies graduated automated
 * responses (admin alert → scoped lock), and answers "is this scope locked?"
 * at enforcement points. See sentinel-rules.ts for the threshold rules.
 *
 * All writes go through SECURITY DEFINER RPCs that only the service role can
 * execute (migration 20260611130000_security_sentinel.sql).
 */

// The new tables/RPCs aren't in the generated DB types yet; use an untyped
// view of the service client, as system-flags-server.ts does.
type ServiceDb = {
  from(t: string): any;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function db(): ServiceDb {
  return createServiceClient() as unknown as ServiceDb;
}

/** Hash a webhook token (or other credential) into a safe-to-store scope id. */
export function credentialScopeId(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export interface SecurityEventInput {
  /** Dot-namespaced event name, e.g. "webhook.signature_failed". */
  event: string;
  severity?: SecuritySeverity;
  scopeType: SecurityScopeType;
  /** Opaque scope id. Never a raw credential — hash with credentialScopeId. */
  scopeId: string;
  userId?: string | null;
  /** Flat, secret-free context (same contract as serverLog.details). */
  details?: Record<string, string | number | boolean | null>;
}

/**
 * Record a security event and apply the sentinel's graduated response when a
 * threshold rule is crossed. Never throws — security bookkeeping must not take
 * down the request path it observes.
 */
export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  const severity = input.severity ?? "info";
  try {
    const service = db();
    const { data, error } = await service.rpc("record_security_event", {
      p_event: input.event,
      p_severity: severity,
      p_scope_type: input.scopeType,
      p_scope_id: input.scopeId,
      p_user_id: input.userId ?? null,
      p_details: input.details ?? null,
      p_action: null,
      p_window_seconds: SENTINEL_RULES[input.event]?.windowSeconds ?? 0,
    });
    if (error) {
      serverLog({
        level: "error",
        event: "sentinel.record_failed",
        message: "Could not record security event.",
        details: { event: input.event, scopeType: input.scopeType },
      });
      return;
    }

    const count = typeof data === "number" ? data : 1;
    const decision = evaluateSentinel(input.event, count);
    if (!decision.alert && !decision.lock) return;

    if (decision.lock && decision.rule) {
      await applySecurityLock({
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        reason: decision.rule.lockReason ?? `Threshold exceeded for ${input.event}`,
        lockedBy: "sentinel",
        ttlSeconds: decision.rule.lockTtlSeconds ?? 1800,
      });
      invalidateLockCache(input.scopeType, input.scopeId);
      serverLog({
        level: "error",
        event: "sentinel.lock_applied",
        message: "Sentinel applied an automatic security lock.",
        details: {
          event: input.event,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          countInWindow: count,
        },
      });
    }

    if (decision.alert) {
      await alertAdmins(input, count, decision.lock);
    }
  } catch (err) {
    serverLog({
      level: "error",
      event: "sentinel.record_failed",
      message: "Security event recording threw.",
      details: { event: input.event, scopeType: input.scopeType },
    });
  }
}

// ── Locks ─────────────────────────────────────────────────────────────────────

// Hot paths (webhook ingestion, run dispatch) check locks on every request, so
// cache lookups briefly per isolate. A short TTL keeps a freshly-applied lock
// effective across the fleet within seconds.
const LOCK_CACHE_TTL_MS = 5_000;
const lockCache = new Map<string, { locked: boolean; expires: number }>();

function lockCacheKey(scopeType: string, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

export function invalidateLockCache(scopeType?: string, scopeId?: string): void {
  if (scopeType && scopeId) lockCache.delete(lockCacheKey(scopeType, scopeId));
  else lockCache.clear();
}

/**
 * Whether a scope is under an active security lock. Fails open on DB errors
 * (the lock layer is defence-in-depth on top of auth/rate limits — a DB blip
 * must not turn into a full outage of webhooks and runs).
 */
export async function isSecurityLocked(
  scopeType: SecurityScopeType,
  scopeId: string
): Promise<boolean> {
  const key = lockCacheKey(scopeType, scopeId);
  const cached = lockCache.get(key);
  const now = Date.now();
  if (cached && cached.expires > now) return cached.locked;

  let locked = false;
  try {
    const { data, error } = await db().rpc("is_security_locked", {
      p_scope_type: scopeType,
      p_scope_id: scopeId,
    });
    if (!error && typeof data === "boolean") {
      locked = data;
    } else if (error) {
      serverLog({
        level: "warn",
        event: "sentinel.lock_check_failed",
        message: "Security lock check failed; failing open.",
        details: { scopeType },
      });
    }
  } catch {
    serverLog({
      level: "warn",
      event: "sentinel.lock_check_failed",
      message: "Security lock check threw; failing open.",
      details: { scopeType },
    });
  }

  lockCache.set(key, { locked, expires: now + LOCK_CACHE_TTL_MS });
  return locked;
}

/** Check several scopes at once; true if any is locked. */
export async function isAnySecurityLocked(
  scopes: Array<{ scopeType: SecurityScopeType; scopeId: string }>
): Promise<boolean> {
  const results = await Promise.all(
    scopes.map((s) => isSecurityLocked(s.scopeType, s.scopeId))
  );
  return results.some(Boolean);
}

export async function applySecurityLock(input: {
  scopeType: SecurityScopeType;
  scopeId: string;
  reason: string;
  lockedBy: string;
  ttlSeconds?: number | null;
}): Promise<boolean> {
  const { error } = await db().rpc("apply_security_lock", {
    p_scope_type: input.scopeType,
    p_scope_id: input.scopeId,
    p_reason: input.reason,
    p_locked_by: input.lockedBy,
    p_ttl_seconds: input.ttlSeconds ?? null,
  });
  if (error) {
    serverLog({
      level: "error",
      event: "sentinel.lock_apply_failed",
      message: "Could not apply security lock.",
      details: { scopeType: input.scopeType },
    });
    return false;
  }
  invalidateLockCache(input.scopeType, input.scopeId);
  return true;
}

export async function releaseSecurityLock(
  scopeType: SecurityScopeType,
  scopeId: string,
  releasedBy: string
): Promise<boolean> {
  const { data, error } = await db().rpc("release_security_lock", {
    p_scope_type: scopeType,
    p_scope_id: scopeId,
    p_released_by: releasedBy,
  });
  if (error) {
    serverLog({
      level: "error",
      event: "sentinel.lock_release_failed",
      message: "Could not release security lock.",
      details: { scopeType },
    });
    return false;
  }
  invalidateLockCache(scopeType, scopeId);
  return data === true;
}

// ── Admin alerting ────────────────────────────────────────────────────────────

async function alertAdmins(
  input: SecurityEventInput,
  count: number,
  locked: boolean
): Promise<void> {
  serverLog({
    level: "error",
    event: "sentinel.alert",
    message: "Security sentinel threshold crossed.",
    details: {
      event: input.event,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      countInWindow: count,
      lockApplied: locked,
    },
  });

  try {
    const service = db();
    const { data: admins } = await service
      .from("profiles")
      .select("id")
      .eq("is_admin", true)
      .limit(20);
    const rows = Array.isArray(admins) ? (admins as Array<{ id: string }>) : [];
    if (rows.length === 0) return;

    const title = locked
      ? "Security: automatic lock applied"
      : "Security: anomaly threshold crossed";
    const body = locked
      ? `${input.event} crossed its threshold (${count} in window). The affected ${input.scopeType} was locked automatically. Review and release it from the security admin panel.`
      : `${input.event} crossed its alert threshold (${count} in window) for a ${input.scopeType}. Review recent security events.`;

    await service.from("notifications").insert(
      rows.map((a) => ({
        user_id: a.id,
        type: "security_alert",
        title,
        body,
        href: "/admin",
      }))
    );
  } catch {
    serverLog({
      level: "error",
      event: "sentinel.alert_notify_failed",
      message: "Could not create admin notifications for a security alert.",
    });
  }
}
