/**
 * Simple in-memory rate limiter.
 * Works per-process — good enough for a single-instance dev/staging server.
 * For production scale, swap the Map for Redis/Upstash.
 */

const store = new Map<string, number[]>();

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key     Unique key (e.g. `genesis:user_id`)
 * @param limit   Max calls allowed in the window
 * @param windowMs Time window in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  store.set(key, timestamps);
  return true;
}
