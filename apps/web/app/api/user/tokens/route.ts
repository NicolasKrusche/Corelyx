import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { generateToken, hashToken, tokenPrefix } from "@/lib/personal-tokens";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from(table: string): any };

const CreateTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/** GET /api/user/tokens — list the current user's personal API tokens */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const db = createServiceClient() as unknown as AnyDb;
  const { data, error } = await db
    .from("personal_api_tokens")
    .select("id, name, token_prefix, last_used_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return apiError((error as { message: string }).message, 500);
  return NextResponse.json({ tokens: (data as unknown[]) ?? [] });
}

/** POST /api/user/tokens — generate a new personal API token.
 *  Returns the plaintext token ONCE — it cannot be retrieved again. */
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const parsed = CreateTokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid request body.", 400);

  const db = createServiceClient() as unknown as AnyDb;

  // Free-tier users cannot create personal API tokens
  const { data: profile } = await db
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();

  if ((profile as { tier?: string } | null)?.tier === "free") {
    return apiError("Personal API tokens are not available on the free plan. Upgrade to create tokens.", 403, "PLAN_LIMIT");
  }

  // Enforce a per-user limit (10 tokens max)
  const { count } = await db
    .from("personal_api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (((count as number | null) ?? 0) >= 10) {
    return apiError("You can have at most 10 personal API tokens. Revoke one before creating another.", 403);
  }

  const token = generateToken();
  const hash = await hashToken(token);
  const prefix = tokenPrefix(token);

  const { data, error } = await db
    .from("personal_api_tokens")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      token_prefix: prefix,
      token_hash: hash,
    })
    .select("id, name, token_prefix, created_at")
    .single();

  if (error || !data) return apiError((error as { message: string } | null)?.message ?? "Could not create token.", 500);

  const row = data as { id: string; name: string; token_prefix: string; created_at: string };

  return NextResponse.json(
    {
      token: { id: row.id, name: row.name, token_prefix: row.token_prefix, created_at: row.created_at, plaintext: token },
      message: "Copy this token now — it will not be shown again.",
    },
    { status: 201 }
  );
}
