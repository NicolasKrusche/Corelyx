import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { hashToken } from "@/lib/personal-tokens";
import { rateLimit } from "@/lib/rate-limit";
import { sendTwoFactorCodeEmail } from "@/lib/email";
import {
  CODE_TTL_MINUTES,
  MAX_VERIFY_ATTEMPTS,
  codeMatches,
  generateCode,
  hashCode,
} from "@/lib/auth/two-factor";
import {
  generateMobileToken,
  mobileTokenPrefix,
  normalizeMobilePlatform,
  setDefault2faDevice,
} from "@/lib/mobile-devices";

const MAX_MOBILE_DEVICES_PER_USER = 10;

type ChallengeRow = {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
};

/**
 * POST /api/mobile/register — the Corelyx Mobile bootstrap. Called after the app
 * signs in (Supabase password login), presenting the user's Supabase ACCESS
 * TOKEN as a bearer.
 *
 * SECURITY: the minted crlxmob_ token is a possession factor that bypasses the
 * app's email-2FA gate on every API call. Because email-2FA here is an app-layer
 * cookie gate (NOT Supabase MFA), a bare password login already yields a valid
 * access token — so registering must NOT be possible from the password alone
 * when the user has 2FA on. We therefore treat the phone like a NEW BROWSER: if
 * email 2FA is enabled, registration requires the emailed 6-digit code (the same
 * factor a new browser must clear). First call (no code) emails a code and
 * returns needs_2fa; second call verifies it, then mints the token.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const accessToken = match?.[1]?.trim();
  if (!accessToken) return apiError("Unauthorized", 401);

  const service = createServiceClient();
  const { data: { user }, error: authError } = await service.auth.getUser(accessToken);
  if (authError || !user) return apiError("Unauthorized", 401);

  // Bound abuse of the bootstrap (email sends + token minting), per user and IP.
  const ip = requesterIp(request);
  const userOk = await rateLimit(`mobile-register:user:${user.id}`, 6, 15 * 60 * 1000);
  const ipOk = ip ? await rateLimit(`mobile-register:ip:${ip}`, 15, 15 * 60 * 1000) : true;
  if (!userOk || !ipOk) {
    return apiError("Too many registration attempts. Please wait a few minutes.", 429);
  }

  const ws = await getActiveWorkspace(user.id);
  if (!ws?.workspaceId) return apiError("No active workspace.", 400);

  const body = (await request.json().catch(() => null)) as
    | { platform?: unknown; name?: unknown; push_token?: unknown; two_factor_code?: unknown; install_id?: unknown }
    | null;

  const db = service as unknown as {
    from(t: string): {
      select(c: string, o?: { count: "exact"; head: true }): {
        eq(c: string, v: string): {
          eq(c: string, v: string): { is(c: string, v: null): Promise<{ count: number | null }> };
          is(c: string, v: null): {
            order(c: string, o: { ascending: boolean }): {
              limit(n: number): PromiseLike<{ data: ChallengeRow[] | null }>;
            };
          };
          single<T>(): PromiseLike<{ data: T | null }>;
        };
      };
      update(v: Record<string, unknown>): {
        eq(c: string, v: string): {
          is(c: string, v: null): PromiseLike<unknown>;
          then?: unknown;
        } & PromiseLike<unknown>;
      };
      insert(v: Record<string, unknown>): {
        select(c: string): { single(): Promise<{ data: { id: string } | null; error: { message: string } | null }> };
      };
    };
  };

  // ── Email-2FA gate: the phone is a new browser and must clear 2FA ────────────
  const { data: profile } = await db
    .from("profiles")
    .select("email_2fa_enabled")
    .eq("id", user.id)
    .single<{ email_2fa_enabled: boolean | null }>();

  if (profile?.email_2fa_enabled) {
    if (!user.email) return apiError("No email on record for 2FA.", 400);
    const rawCode = typeof body?.two_factor_code === "string" ? body.two_factor_code.trim() : "";

    if (!rawCode) {
      // Step 1: email a fresh code and tell the app to collect it.
      if (!(await rateLimit(`2fa-challenge:${user.id}`, 5, 60 * 60 * 1000))) {
        return apiError("Too many codes requested. Please wait before trying again.", 429);
      }
      const code = generateCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
      await db
        .from("two_factor_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("consumed_at", null);
      const { error: insErr } = await db
        .from("two_factor_challenges")
        .insert({ user_id: user.id, code_hash: hashCode(code, user.id), expires_at: expiresAt, channel: "email" })
        .select("id")
        .single();
      if (insErr) return apiError("Could not create a verification code.", 500);
      try {
        await sendTwoFactorCodeEmail({ to: user.email, code });
      } catch {
        return apiError("Could not send the verification email. Try again shortly.", 502);
      }
      // Dev affordance: when email isn't configured (local dev), return the code
      // so the app can pre-fill it — otherwise a developer testing on localhost
      // has no way to receive it. Never runs in production (RESEND_API_KEY set).
      const devCode =
        !process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production" ? code : undefined;
      return NextResponse.json(
        { needs_2fa: true, channel: "email", ...(devCode ? { dev_code: devCode } : {}) },
        { status: 202 }
      );
    }

    // Step 2: verify the emailed code before minting.
    if (!/^\d{6}$/.test(rawCode)) return apiError("Enter the 6-digit code from your email.", 400);
    if (!(await rateLimit(`2fa-verify:${user.id}`, 20, 60 * 60 * 1000))) {
      return apiError("Too many attempts. Please wait before trying again.", 429);
    }
    const { data: challenges } = await db
      .from("two_factor_challenges")
      .select("id, code_hash, expires_at, attempts")
      .eq("user_id", user.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const challenge = challenges?.[0];
    if (!challenge) return apiError("No active code. Request a new one.", 400);
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      return apiError("That code has expired. Request a new one.", 400);
    }
    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      return apiError("Too many wrong attempts. Request a new code.", 400);
    }
    if (!codeMatches(rawCode, user.id, challenge.code_hash)) {
      await db.from("two_factor_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challenge.id);
      return apiError("That code is incorrect.", 400);
    }
    await db.from("two_factor_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);
    // Verified — fall through to mint.
  }

  // ── Mint (or rotate) the device token ────────────────────────────────────────
  const platform = normalizeMobilePlatform(body?.platform);
  const name =
    typeof body?.name === "string" && body.name.trim().length > 0
      ? body.name.trim().slice(0, 80)
      : platform === "ios"
      ? "iPhone"
      : "Android phone";
  const pushToken =
    typeof body?.push_token === "string" && body.push_token.startsWith("ExponentPushToken")
      ? body.push_token
      : null;
  // Stable per-install identifier (random UUID in the phone's keychain, persists
  // across sign-out). Lets us recognise a returning install and rotate its token
  // in place instead of stacking a duplicate device row on every sign-in.
  const installId =
    typeof body?.install_id === "string" && body.install_id.trim().length > 0
      ? body.install_id.trim().slice(0, 128)
      : null;

  const token = generateMobileToken();
  const nowIso = new Date().toISOString();
  const credentialFields = {
    token_hash: await hashToken(token),
    token_prefix: mobileTokenPrefix(token),
    push_token: pushToken,
    push_platform: pushToken ? platform : null,
    push_token_updated_at: pushToken ? nowIso : null,
    last_seen_at: nowIso,
  };

  // A loosely-typed builder for the install-id lookup/update — the chained
  // filter shapes don't survive the hand-written structural cast used above.
  const loose = service as unknown as { from(t: string): { select(c: string): any; update(v: Record<string, unknown>): any } };

  // Is this a returning install (same phone signing in again)?
  const existing = installId
    ? ((await loose
        .from("devices")
        .select("id")
        .eq("user_id", user.id)
        .eq("client_install_id", installId)
        .is("revoked_at", null)
        .maybeSingle()) as { data: { id: string } | null })
    : { data: null };

  let deviceId: string;
  if (existing.data?.id) {
    // Rotate the existing device's token in place — no new row.
    const { error: updErr } = (await loose
      .from("devices")
      .update({ ...credentialFields, name })
      .eq("id", existing.data.id)) as { error: { message: string } | null };
    if (updErr) return apiError("Could not update this device.", 500);
    deviceId = existing.data.id;
  } else {
    // New install (or none reported) — enforce the per-user cap and insert.
    const { count } = await db
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("platform", platform)
      .is("revoked_at", null);
    if ((count ?? 0) >= MAX_MOBILE_DEVICES_PER_USER) {
      return apiError("Too many registered devices. Remove one first.", 409, "DEVICE_LIMIT");
    }
    const { data: inserted, error } = await db
      .from("devices")
      .insert({
        workspace_id: ws.workspaceId,
        user_id: user.id,
        name,
        platform,
        client_install_id: installId,
        ...credentialFields,
        paired_at: nowIso,
      })
      .select("id")
      .single();
    if (error || !inserted) return apiError("Could not register this device.", 500);
    deviceId = inserted.id;
  }

  // The phone becomes the default 2FA device. Non-fatal if it races with another
  // concurrent registration (the partial-unique index would reject a duplicate);
  // resolve2faPushDevice still falls back to the most-recent phone.
  try {
    await setDefault2faDevice(user.id, deviceId);
  } catch {
    /* keep the registration; 2FA routing falls back to most-recent device */
  }

  const origin = new URL(request.url).origin;
  return NextResponse.json(
    {
      device: { id: deviceId, name, platform, is_default_2fa: true },
      token, // plaintext — returned exactly once; store in secure device storage
      base_url: origin,
    },
    { status: existing.data?.id ? 200 : 201 }
  );
}

function requesterIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
