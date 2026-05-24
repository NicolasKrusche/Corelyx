/**
 * Utilities for personal API token generation, hashing, and verification.
 *
 * Token format: crlx_<48 hex chars>  (24 random bytes → 48 hex chars)
 * Total length: 53 characters
 *
 * Only the SHA-256 hash is stored in the database.
 * The plaintext token is shown to the user exactly once.
 */

/** Generate a new, cryptographically random personal API token. */
export function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `crlx_${hex}`;
}

/**
 * SHA-256 hash of the token for DB storage.
 * Works in both Node.js (via globalThis.crypto) and Edge runtimes.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Safe display prefix shown in the UI after creation.
 * e.g.  "crlx_ab12cd34..." — the first 12 chars + ellipsis.
 */
export function tokenPrefix(token: string): string {
  return `${token.slice(0, 12)}...`;
}

/** Check whether a string looks like a crlx_ token (length + prefix). */
export function looksLikeToken(s: string): boolean {
  return s.startsWith("crlx_") && s.length === 53;
}
