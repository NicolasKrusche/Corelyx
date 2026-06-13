import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { allowsDevSecretFallback } from "@/lib/secret-fallback";

/**
 * Email two-factor authentication primitives.
 *
 * A successful code verification sets a signed, httpOnly browser cookie that
 * marks THIS browser as 2FA-verified for the user. The cookie alone grants
 * nothing — it only suppresses the 2FA gate for an already-authenticated
 * Supabase session. Codes are stored as HMACs; the plaintext exists only in
 * the email.
 */

export const TWO_FACTOR_COOKIE = "corelyx-2fa";
export const CODE_TTL_MINUTES = 10;
export const MAX_VERIFY_ATTEMPTS = 5;
/** How long a verified browser stays trusted before re-prompting. */
const COOKIE_TTL_DAYS = 30;

function secret(): string {
  const dedicated = process.env.TWO_FACTOR_COOKIE_SECRET;
  if (dedicated) return dedicated;

  // Fall back to the internal shared secret only in an explicit dev/test
  // environment. In production a dedicated TWO_FACTOR_COOKIE_SECRET is required
  // so the 2FA cookie key stays separated from the internal service-token key.
  const fallback = allowsDevSecretFallback()
    ? process.env.INTERNAL_SERVICE_AUTH_SECRET
    : undefined;
  if (fallback) return fallback;

  throw new Error(
    "TWO_FACTOR_COOKIE_SECRET must be set for email 2FA."
  );
}

export function generateCode(): string {
  // 6 digits, CSPRNG, leading zeros allowed.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code: string, userId: string): string {
  return createHmac("sha256", secret()).update(`code:${userId}:${code}`).digest("hex");
}

export function codeMatches(code: string, userId: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashCode(code, userId), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function cookieSignature(userId: string, issuedAt: number): string {
  return createHmac("sha256", secret()).update(`cookie:${userId}:${issuedAt}`).digest("hex");
}

export function issueCookieValue(userId: string): string {
  const issuedAt = Date.now();
  return `${userId}.${issuedAt}.${cookieSignature(userId, issuedAt)}`;
}

export function cookieMaxAgeSeconds(): number {
  return COOKIE_TTL_DAYS * 24 * 60 * 60;
}

export function verifyCookieValue(value: string | undefined, userId: string): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [cookieUserId, issuedAtRaw, signature] = parts as [string, string, string];
  if (cookieUserId !== userId) return false;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > cookieMaxAgeSeconds() * 1000) return false;

  const expected = Buffer.from(cookieSignature(userId, issuedAt), "hex");
  const provided = Buffer.from(signature, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
