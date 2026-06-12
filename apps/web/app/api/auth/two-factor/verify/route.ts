import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  codeMatches,
  cookieMaxAgeSeconds,
  issueCookieValue,
  MAX_VERIFY_ATTEMPTS,
  TWO_FACTOR_COOKIE,
} from "@/lib/auth/two-factor";

type ChallengeRow = {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
};

// POST /api/auth/two-factor/verify — check the emailed code; on success set
// the signed browser cookie that satisfies the app-layout 2FA gate.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  if (!(await rateLimit(`2fa-verify:${user.id}`, 20, 60 * 60 * 1000))) {
    return apiError("Too many attempts. Please wait before trying again.", 429);
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) return apiError("Enter the 6-digit code from your email.", 400);

  const service = createServiceClient();
  const { data: challenges } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        eq(c: string, v: string): {
          is(c: string, v: null): {
            order(c: string, o: { ascending: boolean }): {
              limit(n: number): PromiseLike<{ data: ChallengeRow[] | null }>;
            };
          };
        };
      };
    };
  })
    .from("two_factor_challenges")
    .select("id, code_hash, expires_at, attempts, consumed_at")
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

  const update = (values: Record<string, unknown>) =>
    (service as unknown as {
      from(t: string): {
        update(v: Record<string, unknown>): { eq(c: string, v: string): PromiseLike<unknown> };
      };
    })
      .from("two_factor_challenges")
      .update(values)
      .eq("id", challenge.id);

  if (!codeMatches(code, user.id, challenge.code_hash)) {
    await update({ attempts: challenge.attempts + 1 });
    return apiError("That code is incorrect.", 400);
  }

  await update({ consumed_at: new Date().toISOString() });

  const response = NextResponse.json({ verified: true });
  response.cookies.set(TWO_FACTOR_COOKIE, issueCookieValue(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAgeSeconds(),
  });
  return response;
}
