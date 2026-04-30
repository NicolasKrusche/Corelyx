import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { rateLimit } from "@/lib/rate-limit";

const RedeemSchema = z.object({
  code: z.string().min(1).max(64).transform((s) => s.trim().toUpperCase()),
});

function invalidCodeResponse() {
  return apiError("This code could not be redeemed.", 400);
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const forwardedFor =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAllowed = await rateLimit(
    `redeem:user:${user.id}`,
    8,
    15 * 60 * 1000
  );
  const ipAllowed = await rateLimit(
    `redeem:ip:${forwardedFor}`,
    30,
    15 * 60 * 1000
  );
  if (!userAllowed || !ipAllowed) {
    return apiError("Too many redemption attempts. Try again later.", 429);
  }

  const body = await request.json().catch(() => null);
  const parsed = RedeemSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid code format.", 400);

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) return apiError("No active workspace.", 400);

  const service = createServiceClient();
  const { data, error } = await (service as any).rpc("redeem_code_atomic", {
    p_code: parsed.data.code,
    p_user_id: user.id,
    p_workspace_id: activeWorkspace.workspaceId,
    p_user_email: user.email ?? "",
  });

  if (error || !data) {
    return invalidCodeResponse();
  }

  const result = data as { success?: boolean; benefit?: string };
  if (!result.success || typeof result.benefit !== "string") {
    return invalidCodeResponse();
  }

  return NextResponse.json({ success: true, benefit: result.benefit });
}
