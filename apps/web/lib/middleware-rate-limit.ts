/**
 * Middleware-level rate limiter backed by Upstash Redis.
 *
 * This is a thin wrapper around @upstash/ratelimit designed for use in
 * Next.js Edge middleware. It is separate from `lib/rate-limit.ts` (which
 * is a Supabase RPC-based limiter used inside route handlers).
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
 * When env vars are missing (local dev without Redis) the limiter is
 * gracefully bypassed so the app still works.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";
import {
  resolveRateLimitRule,
} from "@/lib/rate-limit-config";

// ─── Singleton Redis + Ratelimit instances ───────────────────────────────────

let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  redis = new Redis({ url, token });
  return redis;
}

function getLimiter(ruleLabel: string, maxRequests: number, windowMs: number): Ratelimit | null {
  if (limiters.has(ruleLabel)) {
    return limiters.get(ruleLabel)!;
  }

  const client = getRedis();
  if (!client) return null;

  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.fixedWindow(maxRequests, `${windowMs}ms`),
    analytics: false,
    prefix: `rl:${ruleLabel}`,
  });

  limiters.set(ruleLabel, limiter);
  return limiter;
}

// ─── Key extraction ──────────────────────────────────────────────────────────

/**
 * Extract the rate-limit key from the request based on the rule's strategy.
 *
 * - "user": prefers x-token-user-id header (set by middleware after token
 *          resolution), falls back to session cookie sb-access-token value
 *          (stripped to avoid leaking full tokens in Redis keys).
 * - "ip":   x-forwarded-for → x-real-ip → "unknown"
 */
function extractKey(
  request: NextRequest,
  strategy: "user" | "ip",
  prefix: string
): string {
  if (strategy === "user") {
    // Token-based auth: x-token-user-id is set by middleware AFTER rate-limit
    // check, so for crlx_ / crlxmob_ tokens we derive the key from the
    // Authorization header directly. For cookie sessions we use the access
    // token hash.
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      // crlx_ personal tokens → use first 12 chars as stable identifier
      if (token.startsWith("crlx_")) {
        return `${prefix}:token:${token.slice(0, 12)}`;
      }
      // crlxmob_ mobile tokens → same approach
      if (token.startsWith("crlxmob_")) {
        return `${prefix}:mobile:${token.slice(0, 16)}`;
      }
      // crlxdev_ desktop tokens → same approach
      if (token.startsWith("crlxdev_")) {
        return `${prefix}:desktop:${token.slice(0, 16)}`;
      }
    }

    // Cookie session: use a hash of the access token for the key
    const accessToken = request.cookies.get("sb-access-token")?.value;
    if (accessToken) {
      const hash = simpleHash(accessToken);
      return `${prefix}:session:${hash}`;
    }

    // No identity — fall through to IP
    return `${prefix}:anon:${extractIp(request)}`;
  }

  // IP-based key
  return `${prefix}:ip:${extractIp(request)}`;
}

function extractIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

/** Fast non-crypto hash for Redis key shortening (not for security). */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── Build-time / bypass detection ───────────────────────────────────────────

function isBuildTimeRequest(request: NextRequest): boolean {
  const headers = request.headers;

  // Vercel sets these during builds
  if (headers.get("x-vercel-deployment-url")?.includes("vercel.app")) return true;
  if (headers.get("x-vercel-protection-bypass") === "1") return true;
  if (headers.get("user-agent")?.includes("vercel-bot")) return true;

  // Next.js build phase
  if (process.env.NEXT_PHASE === "phase-production-build") return true;
  if (process.env.NEXT_PHASE === "phase-development-build") return true;

  return false;
}

function isInternalRoute(pathname: string): boolean {
  return pathname.startsWith("/api/internal/");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window (null if bypassed). */
  remaining: number | null;
  /** Milliseconds until the window resets (null if bypassed). */
  resetMs: number | null;
}

/**
 * Check rate limits for a request.
 *
 * Returns { allowed: true } if:
 *   - No rule matches the pathname (pass-through)
 *   - The route is internal / build-time (bypass)
 *   - The Redis-backed limiter permits the request
 *
 * Returns { allowed: false } with retry info when the limit is exceeded.
 * When Redis is unavailable (local dev), all requests are allowed through.
 */
export async function checkMiddlewareRateLimit(
  request: NextRequest
): Promise<RateLimitResult> {
  const { pathname } = request.nextUrl;

  // ── Bypass conditions ──────────────────────────────────────────────────
  if (isBuildTimeRequest(request)) {
    return { allowed: true, remaining: null, resetMs: null };
  }

  if (isInternalRoute(pathname)) {
    return { allowed: true, remaining: null, resetMs: null };
  }

  const match = resolveRateLimitRule(pathname);
  if (!match) {
    return { allowed: true, remaining: null, resetMs: null };
  }

  // ── Optional per-rule bypass ───────────────────────────────────────────
  if (match.rule.bypass) {
    const shouldBypass = await match.rule.bypass(request);
    if (shouldBypass) {
      return { allowed: true, remaining: null, resetMs: null };
    }
  }

  // ── Redis rate check ───────────────────────────────────────────────────
  const limiter = getLimiter(
    match.rule.label,
    match.rule.maxRequests,
    match.rule.windowMs
  );

  if (!limiter) {
    // Redis not configured — fail open so dev works without Redis
    return { allowed: true, remaining: null, resetMs: null };
  }

  const key = extractKey(request, match.rule.keyStrategy, match.prefix);
  const { success, remaining, reset } = await limiter.limit(key);

  return {
    allowed: success,
    remaining,
    resetMs: reset - Date.now(),
  };
}

/**
 * Build a 429 JSON response with standard rate-limit headers.
 */
export function rateLimitExceededResponse(result: RateLimitResult): Response {
  const retryAfterSeconds = result.resetMs
    ? Math.ceil(result.resetMs / 1000)
    : 60;

  return Response.json(
    {
      error: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
      retryAfter: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Remaining": String(result.remaining ?? 0),
      },
    }
  );
}
