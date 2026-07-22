import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { Database } from "@flowos/db";
import { cookies, headers } from "next/headers";

// ─── Config ────────────────────────────────────────────────────────────────

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  user: { id: string; email?: string; role?: string };
  expiresAt: number;
}

interface AuthCache {
  get(key: string): CacheEntry | null;
  set(key: string, entry: CacheEntry): void;
  delete(key: string): void;
  clear(): void;
}

// ─── In-Memory Cache (Edge-compatible) ────────────────────────────────────

const memoryCache = new Map<string, CacheEntry>();

const memoryAuthCache: AuthCache = {
  get(key: string) {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memoryCache.delete(key);
      return null;
    }
    return entry;
  },
  set(key: string, entry: CacheEntry) {
    memoryCache.set(key, entry);
  },
  delete(key: string) {
    memoryCache.delete(key);
  },
  clear() {
    memoryCache.clear();
  },
};

// ─── Redis Cache (Persistent, for multi-instance) ──────────────────────────

let redisClient: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, px: number): Promise<void>;
  del(key: string): Promise<void>;
  flushall(): Promise<void>;
} | null = null;

async function getRedisClient() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;

  if (!url || !token) {
    return null;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    return null;
  }
}

const redisAuthCache: AuthCache = {
  async get(key: string) {
    const client = await getRedisClient();
    if (!client) return null;
    const data = await client.get<string>(`auth:cache:${key}`);
    if (!data) return null;
    try {
      const entry = JSON.parse(data) as CacheEntry;
      if (Date.now() > entry.expiresAt) {
        await client.del(`auth:cache:${key}`);
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  },
  async set(key: string, entry: CacheEntry) {
    const client = await getRedisClient();
    if (!client) return;
    await client.set(`auth:cache:${key}`, JSON.stringify(entry), { px: TTL_MS });
  },
  async delete(key: string) {
    const client = await getRedisClient();
    if (!client) return;
    await client.del(`auth:cache:${key}`);
  },
  async clear() {
    const client = await getRedisClient();
    if (!client) return;
    await client.flushall();
  },
};

// ─── Unified Cache Interface ──────────────────────────────────────────────

export const authCache: AuthCache = {
  async get(key: string) {
    // Try memory first (fastest, Edge-compatible)
    const mem = memoryAuthCache.get(key);
    if (mem) return mem;

    // Fallback to Redis (persistent across instances)
    return redisAuthCache.get(key);
  },
  async set(key: string, entry: CacheEntry) {
    memoryAuthCache.set(key, entry);
    await redisAuthCache.set(key, entry);
  },
  async delete(key: string) {
    memoryAuthCache.delete(key);
    await redisAuthCache.delete(key);
  },
  async clear() {
    memoryAuthCache.clear();
    await redisAuthCache.clear();
  },
};

// ─── Cache Key Builders ───────────────────────────────────────────────────

function buildUserCacheKey(userId: string): string {
  return `user:${userId}`;
}

function buildSessionCacheKey(sessionId: string): string {
  return `session:${sessionId}`;
}

// ─── Core Cache Operations ────────────────────────────────────────────────

export async function getCachedUser(userId: string): Promise<{ id: string; email?: string; role?: string } | null> {
  const key = buildUserCacheKey(userId);
  const entry = await authCache.get(key);
  return entry?.user ?? null;
}

export async function setCachedUser(userId: string, user: { id: string; email?: string; role?: string }): Promise<void> {
  const key = buildUserCacheKey(userId);
  await authCache.set(key, { user, expiresAt: Date.now() + TTL_MS });
}

export async function invalidateUserCache(userId: string): Promise<void> {
  const key = buildUserCacheKey(userId);
  await authCache.delete(key);
}

export async function getCachedSession(sessionId: string): Promise<{ id: string; email?: string; role?: string } | null> {
  const key = buildSessionCacheKey(sessionId);
  const entry = await authCache.get(key);
  return entry?.user ?? null;
}

export async function setCachedSession(sessionId: string, user: { id: string; email?: string; role?: string }): Promise<void> {
  const key = buildSessionCacheKey(sessionId);
  await authCache.set(key, { user, expiresAt: Date.now() + TTL_MS });
}

export async function invalidateSessionCache(sessionId: string): Promise<void> {
  const key = buildSessionCacheKey(sessionId);
  await authCache.delete(key);
}

// ─── Webhook Handler for Session Revocation ────────────────────────────────

export async function handleAuthSessionRevoked(userId: string): Promise<void> {
  await invalidateUserCache(userId);
  // Also invalidate any sessions we might have cached for this user
  // (would need a reverse index for full coverage)
}

// ─── Build-Time Skip Helper ────────────────────────────────────────────────

/**
 * Determines if the current request is a build-time request (Vercel build, etc.)
 * Build requests should skip auth checks to avoid hitting Supabase during builds.
 */
export function isBuildTimeRequest(requestHeaders: Headers): boolean {
  // Vercel sets these headers during builds
  const isVercelBuild =
    requestHeaders.get("x-vercel-deployment-url")?.includes("vercel.app") ||
    requestHeaders.get("x-vercel-protection-bypass") === "1" ||
    requestHeaders.get("user-agent")?.includes("vercel-bot");

  // Next.js build-time detection
  const isNextBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-development-build" ||
    process.env.NODE_ENV === "production" && typeof window === "undefined" && !process.env.NEXT_PUBLIC_SUPABASE_URL;

  return isVercelBuild || isNextBuild;
}

// ─── Metrics ───────────────────────────────────────────────────────────────

interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
}

const metrics: CacheMetrics = { hits: 0, misses: 0, errors: 0 };

export function recordCacheHit(): void {
  metrics.hits++;
}

export function recordCacheMiss(): void {
  metrics.misses++;
}

export function recordCacheError(): void {
  metrics.errors++;
}

export function getCacheMetrics(): CacheMetrics & { hitRate: number } {
  const total = metrics.hits + metrics.misses;
  return {
    ...metrics,
    hitRate: total > 0 ? metrics.hits / total : 0,
  };
}

export function resetCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.errors = 0;
}

// ─── Supabase User Resolution (with cache) ────────────────────────────────

export async function getUserWithCache(): Promise<{ id: string; email?: string; role?: string } | null> {
  try {
    // Check if we have a token-user-id from middleware (personal API tokens)
    const headersList = await headers();
    const tokenUserId = headersList.get("x-token-user-id");

    if (tokenUserId) {
      // Personal API token path — no cookie session, resolve via admin API
      const cached = await getCachedUser(tokenUserId);
      if (cached) {
        recordCacheHit();
        return cached;
      }

      // Not in cache: fetch from Supabase Admin
      const { createServiceClient } = await import("@/lib/api");
      const service = createServiceClient();
      const { data, error } = await service.auth.admin.getUserById(tokenUserId);

      if (!error && data.user) {
        const user = { id: data.user.id, email: data.user.email, role: data.user.role };
        await setCachedUser(tokenUserId, user);
        recordCacheMiss();
        return user;
      }

      recordCacheError();
      return null;
    }

    // Cookie-based session path
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("placeholder") || supabaseAnonKey.includes("placeholder")) {
      return null;
    }

    const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const userId = session.user.id;
    const cached = await getCachedUser(userId);
    if (cached) {
      recordCacheHit();
      return cached;
    }

    // Not in cache: use session user (already validated by getSession)
    const user = { id: session.user.id, email: session.user.email, role: session.user.role };
    await setCachedUser(userId, user);
    recordCacheMiss();
    return user;
  } catch {
    recordCacheError();
    return null;
  }
}

// ─── Cache Invalidation Webhook Endpoint Helper ────────────────────────────

/**
 * Call this from the Supabase webhook handler at /api/webhooks/auth-session
 * to purge the cache when a session is revoked.
 */
export async function invalidateCacheForRevokedSession(userId: string): Promise<void> {
  await invalidateUserCache(userId);
}