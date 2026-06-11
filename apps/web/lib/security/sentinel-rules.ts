/**
 * Sentinel threshold rules — the pure, testable half of the security sentinel.
 *
 * Philosophy: anomalies trigger responses whose blast radius matches their
 * confidence. Repeated abuse of ONE webhook token locks THAT token; a runaway
 * program locks THAT program. Nothing here can take the whole product down —
 * full maintenance mode stays a human decision (system_settings flags).
 */

export type SecuritySeverity = "info" | "warning" | "critical";

/**
 * What a lock or event is scoped to. `webhook_token` scope ids are SHA-256
 * hashes of the token — the raw credential is never stored.
 */
export type SecurityScopeType =
  | "user"
  | "program"
  | "webhook_token"
  | "route"
  | "ip";

export interface SentinelRule {
  /** Sliding window the event counts are evaluated over. */
  windowSeconds: number;
  /** At exactly this many events in the window, alert admins (once). */
  alertThreshold?: number;
  /** At this many events in the window, lock the event's scope. */
  lockThreshold?: number;
  /** How long an automatic lock lasts. Admins can release early. */
  lockTtlSeconds?: number;
  /** Human-readable reason recorded on the lock. */
  lockReason?: string;
}

/**
 * Threshold rules per event name. Events without a rule are recorded for the
 * audit trail but never trigger automated action.
 */
export const SENTINEL_RULES: Record<string, SentinelRule> = {
  // Someone is probing a webhook URL with bad signatures. Lock just that
  // token; legitimate senders are unaffected once they fix their signing.
  "webhook.signature_failed": {
    windowSeconds: 300,
    alertThreshold: 5,
    lockThreshold: 10,
    lockTtlSeconds: 1800,
    lockReason: "Repeated invalid webhook signatures for this endpoint",
  },
  // Internal web↔runtime auth failing repeatedly is either an attack on an
  // internal route or a secret misconfiguration. Alert loudly but never
  // auto-lock: locking internal routes would self-inflict an outage.
  "internal.auth_failed": {
    windowSeconds: 300,
    alertThreshold: 5,
  },
  // A program failing in a tight loop (runaway trigger, abuse, or a broken
  // integration hammering external services). Threshold is far above any
  // normal failure rate for a single program.
  "run.failed": {
    windowSeconds: 600,
    alertThreshold: 10,
    lockThreshold: 15,
    lockTtlSeconds: 1800,
    lockReason: "Program runs failing repeatedly in a short window",
  },
};

export interface SentinelDecision {
  /** Notify admins about this event (fires once, at the alert threshold). */
  alert: boolean;
  /** Apply a scoped lock (idempotent — re-locking extends the expiry). */
  lock: boolean;
  rule: SentinelRule | null;
}

/**
 * Decide what automated action a recorded event warrants, given how many
 * identical-scope events occurred inside the rule's window (including this
 * one). Alerts fire exactly at the threshold so admins get one notification
 * per incident, not one per event; locks fire at-or-above so a race between
 * isolates can't skip past the threshold.
 */
export function evaluateSentinel(event: string, countInWindow: number): SentinelDecision {
  const rule = SENTINEL_RULES[event];
  if (!rule || countInWindow <= 0) {
    return { alert: false, lock: false, rule: rule ?? null };
  }

  const lock =
    rule.lockThreshold !== undefined && countInWindow >= rule.lockThreshold;
  const alert =
    (rule.alertThreshold !== undefined && countInWindow === rule.alertThreshold) ||
    // The first event at/past the lock threshold also alerts, so an admin
    // always hears about an automatic lock.
    (rule.lockThreshold !== undefined && countInWindow === rule.lockThreshold);

  return { alert, lock, rule };
}
