/**
 * Middleware rate-limit configuration.
 *
 * Each rule maps a pathname prefix (or exact match) to a rate-limit policy.
 * Rules are evaluated in order — first match wins.
 *
 * Key strategy:
 *   - "user"  → identified by session cookie or x-token-user-id header
 *   - "ip"    → identified by x-forwarded-for / x-real-ip (works for unauthenticated traffic)
 *
 * The middleware skips rate limiting entirely for:
 *   - Internal API routes (/api/internal/*) — service-to-service auth
 *   - Build-time requests (VERCEL_ENV not set / build phase)
 *   - Paths that don't match any rule (pass-through)
 */

export type RateLimitKeyStrategy = "user" | "ip";

export interface RateLimitRule {
  /** Human-readable label for logs / debugging. */
  label: string;
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** How to identify the caller for the rate-limit key. */
  keyStrategy: RateLimitKeyStrategy;
  /** Optional: bypass rate limiting when this function returns true. */
  bypass?: (request: Request) => boolean | Promise<boolean>;
}

export interface RateLimitRuleMatch {
  rule: RateLimitRule;
  /** The matched prefix used to compute the rate-limit key. */
  prefix: string;
}

/**
 * Ordered list of rate-limit rules.
 *
 * Evaluation walks from top to bottom; the first matching prefix wins.
 * More-specific prefixes should appear before broader ones.
 */
export const RATE_LIMIT_RULES: Array<{ prefix: string; rule: RateLimitRule }> = [
  // ── Genesis: AI workflow generation (expensive LLM calls) ──────────────
  {
    prefix: "/api/genesis",
    rule: {
      label: "genesis",
      maxRequests: 10,
      windowMs: 60_000, // 1 minute
      keyStrategy: "user",
    },
  },

  // ── Workflow runs: execution dispatches ────────────────────────────────
  {
    prefix: "/api/runs",
    rule: {
      label: "runs",
      maxRequests: 20,
      windowMs: 60_000, // 1 minute
      keyStrategy: "user",
    },
  },

  // ── Auth routes: brute-force protection ────────────────────────────────
  // Covers /login, /signup, /auth/*, /api/auth/*
  {
    prefix: "/auth/",
    rule: {
      label: "auth",
      maxRequests: 5,
      windowMs: 60_000, // 1 minute
      keyStrategy: "ip",
    },
  },
  {
    prefix: "/api/auth/",
    rule: {
      label: "auth-api",
      maxRequests: 5,
      windowMs: 60_000, // 1 minute
      keyStrategy: "ip",
    },
  },
  {
    prefix: "/login",
    rule: {
      label: "auth-login",
      maxRequests: 5,
      windowMs: 60_000,
      keyStrategy: "ip",
    },
  },
  {
    prefix: "/signup",
    rule: {
      label: "auth-signup",
      maxRequests: 5,
      windowMs: 60_000,
      keyStrategy: "ip",
    },
  },
];

/**
 * Resolve which rate-limit rule (if any) applies to a given pathname.
 */
export function resolveRateLimitRule(
  pathname: string
): RateLimitRuleMatch | null {
  for (const { prefix, rule } of RATE_LIMIT_RULES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "?")) {
      return { rule, prefix };
    }
  }
  return null;
}
