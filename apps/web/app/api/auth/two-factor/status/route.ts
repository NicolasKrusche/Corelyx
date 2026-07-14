import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import {
  cookieMaxAgeSeconds,
  issueCookieValue,
  TWO_FACTOR_COOKIE,
} from "@/lib/auth/two-factor";

type ChallengeRow = {
  id: string;
  user_id: string;
  expires_at: string;
  approved_at: string | null;
  denied_at: string | null;
  consumed_at: string | null;
};

// GET /api/auth/two-factor/status?challenge=<id> — the web /verify-2fa page polls
// this while it waits for the phone to approve a push challenge. When the phone
// has approved, THIS response mints the corelyx-2fa trust cookie for the browser
// (byte-for-byte identical to the email verify route), so both channels converge
// on the same gate with no gate-logic changes. Authenticated by the browser's
// Supabase cookie session directly (like challenge/verify) — NOT getAuthUser, so
// it is reachable before the 2FA cookie exists.
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get("challenge");
  if (!challengeId) return apiError("Missing challenge id.", 400);

  const service = createServiceClient();
  const { data: challenge } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        eq(c: string, v: string): { maybeSingle(): Promise<{ data: ChallengeRow | null }> };
      };
    };
  })
    .from("two_factor_challenges")
    .select("id, user_id, expires_at, approved_at, denied_at, consumed_at")
    .eq("id", challengeId)
    .maybeSingle();

  // Never leak another user's challenge state.
  if (!challenge || challenge.user_id !== user.id) {
    return apiError("Challenge not found.", 404);
  }

  if (challenge.denied_at) {
    return NextResponse.json({ status: "denied" });
  }

  if (challenge.approved_at) {
    const response = NextResponse.json({ status: "approved" });
    // Mint the trust cookie only within a short window of the approval, so a
    // long-ago-approved challenge id can't be replayed into a fresh cookie by a
    // party holding the session but not the 2FA cookie. The web page polls every
    // ~2s, so a legitimate sign-in always lands well inside this window.
    const MINT_WINDOW_MS = 3 * 60 * 1000;
    if (Date.now() - new Date(challenge.approved_at).getTime() <= MINT_WINDOW_MS) {
      response.cookies.set(TWO_FACTOR_COOKIE, issueCookieValue(user.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: cookieMaxAgeSeconds(),
      });
    }
    return response;
  }

  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ status: "expired" });
  }

  return NextResponse.json({ status: "pending" });
}
