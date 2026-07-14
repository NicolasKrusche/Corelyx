import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { sendTwoFactorCodeEmail } from "@/lib/email";
import { sendExpoPush } from "@/lib/push";
import { resolve2faPushDevice } from "@/lib/mobile-devices";
import { CODE_TTL_MINUTES, generateCode, hashCode } from "@/lib/auth/two-factor";

type Method = "auto" | "push" | "email";

// Derive a short human label for the sign-in attempt, shown on the phone's
// approve screen ("Approve sign-in from …"). Best-effort parse of the UA.
function deriveRequesterLabel(userAgent: string | null): string {
  if (!userAgent) return "a web browser";
  const ua = userAgent.toLowerCase();
  const browser = ua.includes("edg")
    ? "Edge"
    : ua.includes("chrome")
    ? "Chrome"
    : ua.includes("firefox")
    ? "Firefox"
    : ua.includes("safari")
    ? "Safari"
    : "a browser";
  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("mac")
    ? "macOS"
    : ua.includes("linux")
    ? "Linux"
    : ua.includes("android")
    ? "Android"
    : ua.includes("iphone") || ua.includes("ipad")
    ? "iOS"
    : "an unknown device";
  return `${browser} on ${os}`;
}

function requesterIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

// POST /api/auth/two-factor/challenge — issue a 2FA challenge for the signed-in
// user. Emails a 6-digit code (legacy) and/or sends a push approve/deny to the
// user's registered phone ("Corelyx Guard"). The web /verify-2fa page calls this
// on load and on "resend" / "use email instead".
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!user.email) return apiError("No email on record for this account.", 400);

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("email_2fa_enabled")
    .eq("id", user.id)
    .single<{ email_2fa_enabled: boolean }>();
  if (!profile?.email_2fa_enabled) {
    return apiError("Two-factor authentication is not enabled.", 400);
  }

  const body = (await request.json().catch(() => null)) as { method?: Method } | null;
  // Effective method: an explicit request from the verify page (e.g. "use email
  // instead") wins; otherwise the user's saved preference (app_metadata); else
  // auto (push if a phone is registered, else email). 'guard' maps to push.
  const stored = (user.app_metadata as Record<string, unknown> | undefined)?.two_factor_method;
  let requested: Method = "auto";
  if (body?.method === "email" || body?.method === "push") requested = body.method;
  else if (stored === "email") requested = "email";
  else if (stored === "guard") requested = "push";

  // Does the user have a phone that can receive a push challenge?
  const pushDevice = requested === "email" ? null : await resolve2faPushDevice(user.id);
  const usesPush = requested === "push" ? true : requested === "auto" ? Boolean(pushDevice) : false;
  const channel: "push" | "email" = usesPush && pushDevice ? "push" : "email";

  const db = service as unknown as {
    from(t: string): {
      select(c: string): {
        eq(c: string, v: string): {
          eq(c: string, v: string): {
            is(c: string, v: null): {
              gt(c: string, v: string): {
                order(c: string, o: { ascending: boolean }): {
                  limit(n: number): PromiseLike<{ data: Array<{ id: string; expires_at: string }> | null }>;
                };
              };
            };
          };
        };
      };
      update(v: Record<string, unknown>): {
        eq(c: string, v: string): { is(c: string, v: null): PromiseLike<unknown> };
      };
      insert(v: Record<string, unknown>): {
        select(c: string): { single(): PromiseLike<{ data: { id: string } | null; error: { message: string } | null }> };
      };
    };
  };

  // ── Push channel ──────────────────────────────────────────────────────────
  if (channel === "push" && pushDevice) {
    // Single-flight: if a pending, unexpired push challenge already exists, reuse
    // it instead of creating another row and re-spamming the phone.
    const { data: existing } = await db
      .from("two_factor_challenges")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .eq("channel", "push")
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const pending = existing?.[0];
    if (pending) {
      return NextResponse.json({
        sent: true,
        channel: "push",
        challenge_id: pending.id,
        expires_at: pending.expires_at,
      });
    }

    // Anti-spam: cap push challenges per user and per source IP within the short
    // challenge window, so a stolen password can't flood a victim's phone.
    const ip = requesterIp(request);
    const userOk = await rateLimit(`login-challenge:user:${user.id}`, 3, 2 * 60 * 1000);
    const ipOk = ip ? await rateLimit(`login-challenge:ip:${ip}`, 10, 2 * 60 * 1000) : true;
    if (!userOk || !ipOk) {
      // Never hard-fail: fall through to email so the user is never locked out.
      return await issueEmailChallenge();
    }

    const code = generateCode(); // stored for the "use email instead" fallback
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
    const label = deriveRequesterLabel(request.headers.get("user-agent"));

    // Invalidate older outstanding challenges so only the newest counts.
    await db
      .from("two_factor_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("consumed_at", null);

    const { data: inserted, error } = await db
      .from("two_factor_challenges")
      .insert({
        user_id: user.id,
        code_hash: hashCode(code, user.id),
        expires_at: expiresAt,
        channel: "push",
        requester_ip: ip,
        requester_label: label,
      })
      .select("id")
      .single();
    if (error || !inserted) return apiError("Could not create a verification challenge.", 500);

    // Fire the push. If it fails to send, fall back to email so login proceeds.
    const pushed = await sendExpoPush({
      to: [pushDevice.push_token as string],
      title: "Approve sign-in to Corelyx?",
      body: `Sign-in attempt from ${label}. Tap to approve or deny.`,
      priority: "high",
      data: {
        kind: "login_challenge",
        challenge_id: inserted.id,
        requester_label: label,
        requester_ip: ip,
        expires_at: expiresAt,
      },
    });
    if (!pushed) {
      await sendCode(code);
    }

    return NextResponse.json({
      sent: true,
      channel: "push",
      challenge_id: inserted.id,
      expires_at: expiresAt,
    });
  }

  // ── Email channel (legacy path, unchanged behaviour) ────────────────────────
  return await issueEmailChallenge();

  async function issueEmailChallenge() {
    // Per-IP cap first, so one source can't burn many users' per-user buckets.
    const ip = requesterIp(request);
    if (ip && !(await rateLimit(`2fa-challenge:ip:${ip}`, 15, 60 * 60 * 1000))) {
      return apiError("Too many codes requested. Please wait before trying again.", 429);
    }
    // Each email send counts against the per-user cap.
    if (!(await rateLimit(`2fa-challenge:${user!.id}`, 5, 60 * 60 * 1000))) {
      return apiError("Too many codes requested. Please wait before trying again.", 429);
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    await db
      .from("two_factor_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", user!.id)
      .is("consumed_at", null);

    const { error } = await db
      .from("two_factor_challenges")
      .insert({
        user_id: user!.id,
        code_hash: hashCode(code, user!.id),
        expires_at: expiresAt,
        channel: "email",
      })
      .select("id")
      .single();
    if (error) return apiError("Could not create a verification code.", 500);

    const sent = await sendCode(code);
    if (!sent) return apiError("Could not send the verification email. Try again shortly.", 502);

    return NextResponse.json({ sent: true, channel: "email", expires_at: expiresAt });
  }

  async function sendCode(code: string): Promise<boolean> {
    try {
      await sendTwoFactorCodeEmail({ to: user!.email as string, code });
      return true;
    } catch {
      return false;
    }
  }
}
