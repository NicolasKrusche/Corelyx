// Tester preview bypass for full-app maintenance mode.
//
// Lets a single trusted tester browse the live app while maintenance is ON for
// everyone else — without flipping maintenance off. The tester opens any URL
// with `?preview=<token>`; the maintenance gate verifies it, sets an httpOnly
// cookie, and strips the token from the URL. Later navigations are authorised
// by the cookie.
//
// The usable secret is never stored: the DB (system_settings) holds only the
// token's SHA-256 hash, and the gate hashes the incoming candidate to compare.
// An optional `MAINTENANCE_BYPASS_TOKEN` env var acts as a break-glass fallback
// (works even if the DB read fails), mirroring how the maintenance flag itself
// treats env vars. The token is never logged.
//
// Edge-safe: only Web Crypto, `process.env`, and pure string work.

/** Query parameter the tester puts the token in: `/?preview=<token>`. */
export const MAINTENANCE_BYPASS_PARAM = "preview";

/** httpOnly cookie that carries the bypass grant after the first valid hit. */
export const MAINTENANCE_BYPASS_COOKIE = "mnt_preview";

/** How long a preview grant lasts before the tester needs the link again. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Reject anything shorter than this so a weak/short token can't be guessed. */
const MIN_TOKEN_LENGTH = 24;

export const MAINTENANCE_BYPASS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_MAX_AGE_SECONDS,
};

/** Lowercase hex SHA-256 of `text`. Edge-safe via Web Crypto. */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Length-independent constant-time string comparison. Avoids leaking how many
 * leading characters matched (or the operand length) via timing.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** The env break-glass token, or null when unset/too short. */
function envBypassToken(): string | null {
  const token = (process.env.MAINTENANCE_BYPASS_TOKEN ?? "").trim();
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}

/** Whether any preview bypass is configured (DB hash or env fallback). */
export function previewBypassConfigured(dbHash: string | null | undefined): boolean {
  return Boolean(dbHash) || envBypassToken() !== null;
}

/**
 * Whether a raw candidate token (from the query param or the cookie) matches
 * the configured bypass — the DB hash first, then the env fallback. Returns
 * false when nothing is configured or the candidate is empty.
 */
export async function previewTokenMatches(
  candidate: string | null | undefined,
  dbHash: string | null | undefined
): Promise<boolean> {
  if (!candidate) return false;
  const candidateHash = await sha256Hex(candidate);

  if (dbHash && constantTimeEquals(candidateHash, dbHash)) return true;

  const envToken = envBypassToken();
  if (envToken) {
    const envHash = await sha256Hex(envToken);
    if (constantTimeEquals(candidateHash, envHash)) return true;
  }
  return false;
}

/** URL-safe base64 (no padding) of raw bytes. */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate a fresh, unguessable preview token and its storable hash. The raw
 * token is shown to the admin once and put in the tester link; only the hash is
 * persisted (system_settings.previewBypassHash).
 */
export async function generatePreviewToken(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = base64url(bytes); // 43 chars, well above MIN_TOKEN_LENGTH
  return { token, hash: await sha256Hex(token) };
}
