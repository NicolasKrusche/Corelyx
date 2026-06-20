import "server-only";
import { createServiceClient } from "@/lib/api";
import { hashToken } from "@/lib/personal-tokens";

/**
 * Corelyx Desktop device tokens and Bridge authentication.
 *
 * A device token is the long-lived credential the desktop Bridge presents on
 * every poll/submit. Format: crlxdev_<64 hex chars> (32 random bytes). Only its
 * SHA-256 hash is stored; the plaintext is shown to the user exactly once at
 * pairing time. Mirrors the personal-API-token model.
 */

export type DevicePlatform = "macos" | "windows" | "linux" | "unknown";

export const DEVICE_TOKEN_PREFIX = "crlxdev_";

export interface DeviceRow {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  platform: DevicePlatform;
  token_prefix: string;
  paired_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Generate a new, cryptographically random device token. */
export function generateDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${DEVICE_TOKEN_PREFIX}${hex}`;
}

/** Display prefix kept on the device row (first 16 chars + ellipsis). */
export function deviceTokenPrefix(token: string): string {
  return `${token.slice(0, 16)}...`;
}

/** Normalize a reported platform string to the allowed set. */
export function normalizePlatform(value: unknown): DevicePlatform {
  if (value === "macos" || value === "windows" || value === "linux") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (v.includes("mac") || v.includes("darwin")) return "macos";
    if (v.includes("win")) return "windows";
    if (v.includes("linux")) return "linux";
  }
  return "unknown";
}

/** Pull the Bridge's bearer token out of an incoming request. */
export function deviceTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  if (token && token.startsWith(DEVICE_TOKEN_PREFIX)) return token;
  return null;
}

/**
 * Resolve a device token to its (active, non-revoked) device row and stamp
 * last_seen_at. Returns null for unknown, malformed, or revoked tokens — the
 * caller maps that to 401. Uses the service-role client (Bridge requests carry
 * no Supabase session).
 */
export async function authenticateDevice(token: string | null): Promise<DeviceRow | null> {
  if (!token || !token.startsWith(DEVICE_TOKEN_PREFIX)) return null;

  const hash = await hashToken(token);
  const db = createServiceClient() as unknown as {
    from(t: string): {
      select(c: string): {
        eq(
          col: string,
          val: string
        ): { maybeSingle(): Promise<{ data: DeviceRow | null }> };
      };
    };
    // narrow update chain used below
  };

  const { data } = await db
    .from("devices")
    .select(
      "id, workspace_id, user_id, name, platform, token_prefix, paired_at, last_seen_at, revoked_at, created_at"
    )
    .eq("token_hash", hash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // Best-effort liveness stamp; never block auth on it.
  try {
    await (createServiceClient() as unknown as {
      from(t: string): {
        update(v: Record<string, unknown>): {
          eq(col: string, val: string): Promise<unknown>;
        };
      };
    })
      .from("devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", data.id);
  } catch {
    // ignore
  }

  return data;
}
