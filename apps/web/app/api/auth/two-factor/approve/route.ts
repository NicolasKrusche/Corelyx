import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { authenticateMobileToken, mobileTokenFromRequest } from "@/lib/mobile-devices";

type ChallengeRow = {
  id: string;
  user_id: string;
  channel: string;
  expires_at: string;
  approved_at: string | null;
  denied_at: string | null;
  consumed_at: string | null;
};

// POST /api/auth/two-factor/approve — the phone approves or denies a push login
// challenge ("Corelyx Guard"). Authenticated by the phone's own crlxmob_ device
// token (NOT a cookie / getAuthUser), so it works with no browser session and is
// not itself blocked by the 2FA gate it exists to clear. The web page's status
// poll then observes the result and mints the trust cookie.
export async function POST(request: Request) {
  const token = mobileTokenFromRequest(request);
  const device = await authenticateMobileToken(token);
  if (!device) return apiError("Unauthorized", 401);

  // Cap approve attempts per device to blunt any token-replay brute force.
  if (!(await rateLimit(`2fa-approve:${device.id}`, 30, 60 * 1000))) {
    return apiError("Too many attempts. Please wait a moment.", 429);
  }

  const body = (await request.json().catch(() => null)) as
    | { challenge_id?: unknown; decision?: unknown }
    | null;
  const challengeId = typeof body?.challenge_id === "string" ? body.challenge_id : "";
  const decision = body?.decision === "deny" ? "deny" : body?.decision === "approve" ? "approve" : null;
  if (!challengeId) return apiError("Missing challenge id.", 400);
  if (!decision) return apiError("decision must be 'approve' or 'deny'.", 400);

  const service = createServiceClient();
  const { data: challenge } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        eq(c: string, v: string): { maybeSingle(): Promise<{ data: ChallengeRow | null }> };
      };
    };
  })
    .from("two_factor_challenges")
    .select("id, user_id, channel, expires_at, approved_at, denied_at, consumed_at")
    .eq("id", challengeId)
    .maybeSingle();

  if (!challenge) return apiError("Challenge not found.", 404);
  // The approving phone must belong to the same user the challenge is for.
  if (challenge.user_id !== device.user_id) return apiError("Challenge not found.", 404);
  if (challenge.channel !== "push") return apiError("Not a push challenge.", 400);
  if (challenge.consumed_at || challenge.approved_at || challenge.denied_at) {
    return apiError("This request was already handled.", 409);
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    return apiError("This request has expired.", 410);
  }

  const now = new Date().toISOString();
  const patch =
    decision === "approve"
      ? { approved_at: now, consumed_at: now, approver_device_id: device.id }
      : { denied_at: now, consumed_at: now, approver_device_id: device.id };

  await (service as unknown as {
    from(t: string): {
      update(v: Record<string, unknown>): { eq(c: string, v: string): PromiseLike<unknown> };
    };
  })
    .from("two_factor_challenges")
    .update(patch)
    .eq("id", challenge.id);

  return NextResponse.json({ ok: true, decision });
}
