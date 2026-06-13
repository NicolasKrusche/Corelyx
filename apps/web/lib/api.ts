import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@flowos/db";
import { createServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { genericErrorMessage, redactSecretText } from "@/lib/redaction";
import {
  readTwoFactorAppMetadata,
  TWO_FACTOR_COOKIE,
  TWO_FACTOR_METADATA_KEY,
  verifyCookieValue,
} from "@/lib/auth/two-factor";
import { isTwoFactorExemptApiPath } from "@/lib/auth/two-factor-api-exempt";

export async function writeNotification(
  userId: string,
  notification: { type: string; title: string; body: string; href?: string }
): Promise<void> {
  const service = createServiceClient();
  await (service as unknown as {
    from(t: string): { insert(v: Record<string, unknown>): Promise<unknown> };
  })
    .from("notifications")
    .insert({ user_id: userId, ...notification });
}

export function apiError(message: string, status: number, code?: string) {
  const safeMessage =
    status >= 500 ? genericErrorMessage(status) : redactSecretText(message);
  return NextResponse.json(
    { error: safeMessage, ...(code ? { code } : {}) },
    { status }
  );
}

export async function getAuthUser(): Promise<User | null> {
  const headersList = await headers();

  // If a valid personal API token was presented, middleware injects x-token-user-id.
  // We resolve the full user from that rather than requiring a Supabase session cookie.
  //
  // Personal API tokens are a deliberate programmatic credential, so the
  // interactive email-2FA gate below intentionally does NOT apply to this path —
  // requiring a per-browser 2FA cookie would break all API automation.
  try {
    const tokenUserId = headersList.get("x-token-user-id");
    if (tokenUserId) {
      const service = createServiceClient();
      const { data: { user }, error } = await service.auth.admin.getUserById(tokenUserId);
      if (!error && user) return user;
    }
  } catch {
    // Fall through to cookie-based auth
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Cookie-session path: enforce email 2FA. A valid Supabase session alone is
  // NOT enough when the user opted into email 2FA — this browser must also hold
  // a valid signed 2FA cookie. This mirrors the (app) layout gate so that direct
  // /api/* calls can't bypass 2FA the way page navigation cannot. Returning null
  // routes through the caller's existing `if (!user) -> 401` path.
  if (await cookieSessionNeedsTwoFactor(headersList, user)) {
    return null;
  }

  return user;
}

/**
 * True when a cookie-authenticated user has email 2FA enabled but this request
 * has not satisfied it (no valid 2FA cookie) and is not on an exempt login-flow
 * route. Personal API token requests never reach this — they return earlier.
 */
async function cookieSessionNeedsTwoFactor(
  headersList: Awaited<ReturnType<typeof headers>>,
  user: User
): Promise<boolean> {
  // Login / 2FA-enrollment routes must stay reachable before a 2FA cookie can
  // exist, otherwise the flow dead-locks. middleware sets x-pathname.
  const pathname = headersList.get("x-pathname");
  if (pathname && isTwoFactorExemptApiPath(pathname)) return false;

  // A valid 2FA cookie satisfies the gate with no DB round-trip. (When no cookie
  // is present verifyCookieValue returns false without touching the signing
  // secret, so non-2FA users never trip a missing-secret error here.)
  const cookieStore = await cookies();
  if (verifyCookieValue(cookieStore.get(TWO_FACTOR_COOKIE)?.value, user.id)) {
    return false;
  }

  // Fast path: the flag is mirrored into app_metadata, which getUser() already
  // returned — so the common case (every cookie-session API call) needs NO
  // profiles round-trip. app_metadata is service-role-only, so it can't be
  // forged by the client.
  const mirrored = readTwoFactorAppMetadata(
    user.app_metadata as Record<string, unknown> | undefined
  );
  if (mirrored !== undefined) return mirrored;

  // Not mirrored yet (legacy user from before the mirror, or a user who has
  // never toggled 2FA): read the source of truth once, then self-heal by
  // writing it into app_metadata so subsequent requests take the fast path.
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("email_2fa_enabled")
    .eq("id", user.id)
    .single<{ email_2fa_enabled: boolean | null }>();
  const enabled = Boolean(data?.email_2fa_enabled);

  try {
    await service.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), [TWO_FACTOR_METADATA_KEY]: enabled },
    });
  } catch {
    // Best-effort mirror — correctness already holds via the profiles read above.
  }

  return enabled;
}

/**
 * Service-role Supabase client — bypasses RLS for Vault and admin operations.
 * NEVER expose this client or its results to the browser.
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  assertServiceRoleKey(serviceRoleKey);

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function assertServiceRoleKey(key: string) {
  const parts = key.split(".");
  if (parts.length < 2) return;

  try {
    const payload = parts[1]!;
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = JSON.parse(json) as { role?: unknown };
    if (claims.role && claims.role !== "service_role") {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY must be a Supabase service_role key.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("service_role")) {
      throw error;
    }
  }
}
