import "server-only";
import { createServiceClient } from "@/lib/api";
import { hashToken } from "@/lib/personal-tokens";

/**
 * Corelyx Mobile device tokens, registration, and push-2FA device resolution.
 *
 * A mobile device token is the long-lived credential the phone app presents on
 * every API call. Format: crlxmob_<64 hex chars> (32 random bytes). Only its
 * SHA-256 hash is stored; the plaintext is returned to the app exactly once at
 * registration. Mirrors the desktop Bridge device-token model (lib/devices.ts),
 * but lives on the SAME `devices` table with platform 'ios'/'android'.
 *
 * IMPORTANT: mobile devices must NEVER become the file-operation "default
 * device". That resolver (resolve_default_device / resolveDefaultDeviceId) is
 * taught to exclude ios/android platforms. The phone is instead the default
 * *2FA* device via the explicit `is_default_2fa` flag managed here.
 */

export type MobilePlatform = "ios" | "android";

export const MOBILE_TOKEN_PREFIX = "crlxmob_";

export interface MobileDeviceRow {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  platform: MobilePlatform;
  token_prefix: string;
  push_token: string | null;
  push_platform: MobilePlatform | null;
  is_default_2fa: boolean;
  paired_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const MOBILE_ROW_COLUMNS =
  "id, workspace_id, user_id, name, platform, token_prefix, push_token, push_platform, is_default_2fa, paired_at, last_seen_at, revoked_at, created_at";

/** Generate a new, cryptographically random mobile device token. */
export function generateMobileToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${MOBILE_TOKEN_PREFIX}${hex}`;
}

/** Display prefix kept on the device row (first 16 chars + ellipsis). */
export function mobileTokenPrefix(token: string): string {
  return `${token.slice(0, 16)}...`;
}

/** Normalize a reported mobile platform to the allowed set. */
export function normalizeMobilePlatform(value: unknown): MobilePlatform {
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (v.includes("android")) return "android";
    if (v.includes("ios") || v.includes("iphone") || v.includes("ipad")) return "ios";
  }
  // Default to ios only when explicitly ios; otherwise assume android is safe as
  // a generic fallback? No — be explicit: unknown mobile defaults to 'ios'.
  return "ios";
}

/** Pull a crlxmob_ bearer token out of an incoming request. */
export function mobileTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  if (token && token.startsWith(MOBILE_TOKEN_PREFIX)) return token;
  return null;
}

/**
 * Resolve a mobile token to its (active, non-revoked) device row and stamp
 * last_seen_at. Returns null for unknown, malformed, or revoked tokens. Uses the
 * service-role client (mobile requests carry no Supabase cookie session).
 */
export async function authenticateMobileToken(
  token: string | null
): Promise<MobileDeviceRow | null> {
  if (!token || !token.startsWith(MOBILE_TOKEN_PREFIX)) return null;

  const hash = await hashToken(token);
  const db = createServiceClient() as unknown as {
    from(t: string): {
      select(c: string): {
        eq(col: string, val: string): {
          maybeSingle(): Promise<{ data: MobileDeviceRow | null }>;
        };
      };
    };
  };

  const { data } = await db
    .from("devices")
    .select(MOBILE_ROW_COLUMNS)
    .eq("token_hash", hash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;
  // Defence in depth: this helper must only ever authenticate mobile rows.
  if (data.platform !== "ios" && data.platform !== "android") return null;

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

/**
 * Make `deviceId` the user's sole default 2FA device: clear the flag on every
 * other row for the user, then set it here. The partial unique index
 * (idx_devices_default_2fa) guarantees at most one default per user, so we clear
 * first to avoid a conflict. Implements "the phone always becomes the default".
 */
export async function setDefault2faDevice(userId: string, deviceId: string): Promise<void> {
  const db = createServiceClient() as unknown as {
    from(t: string): {
      update(v: Record<string, unknown>): {
        eq(col: string, val: string): {
          neq(col: string, val: string): Promise<unknown>;
          then?: unknown;
        } & Promise<unknown>;
      };
    };
  };

  // Clear the flag on any other default for this user.
  await db
    .from("devices")
    .update({ is_default_2fa: false })
    .eq("user_id", userId)
    .neq("id", deviceId);

  // Set it on the target device.
  await (createServiceClient() as unknown as {
    from(t: string): {
      update(v: Record<string, unknown>): {
        eq(col: string, val: string): Promise<unknown>;
      };
    };
  })
    .from("devices")
    .update({ is_default_2fa: true })
    .eq("id", deviceId);
}

/**
 * The phone that should handle a push 2FA challenge for this user: the explicit
 * default if set, else the most-recently-seen mobile device. Returns null when
 * the user has no mobile device.
 *
 * Note: a device WITHOUT a push_token still qualifies. The push notification is
 * only a convenience to surface the request — the approval works from the app's
 * Guard tab regardless. So a phone that hasn't granted push permission (or runs
 * in Expo Go) can still be the 2FA device; the send simply no-ops and the email
 * code is used as the fallback path.
 */
export async function resolve2faPushDevice(userId: string): Promise<MobileDeviceRow | null> {
  // The Supabase query-builder's chained .order() types don't survive a
  // hand-written structural cast, so build the query loosely and type the result.
  const query = (createServiceClient() as unknown as {
    from(t: string): { select(c: string): any };
  })
    .from("devices")
    .select(MOBILE_ROW_COLUMNS)
    .eq("user_id", userId)
    .is("revoked_at", null)
    // is_default_2fa DESC puts the designated phone first; then most-recent.
    .order("is_default_2fa", { ascending: false })
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(1);

  const { data } = (await query) as { data: MobileDeviceRow[] | null };

  const row = data?.[0];
  if (!row) return null;
  if (row.platform !== "ios" && row.platform !== "android") return null;
  return row;
}

/** All of a user's active, push-capable mobile push tokens (for fan-out). */
export async function userPushTokens(userId: string): Promise<string[]> {
  const db = createServiceClient() as unknown as {
    from(t: string): {
      select(c: string): {
        eq(col: string, val: string): {
          is(col: string, val: null): {
            not(col: string, op: string, val: null): Promise<{
              data: Array<{ push_token: string | null }> | null;
            }>;
          };
        };
      };
    };
  };

  const { data } = await db
    .from("devices")
    .select("push_token")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .not("push_token", "is", null);

  return (data ?? [])
    .map((r) => r.push_token)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
}
