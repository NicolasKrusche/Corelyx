import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { getAutoRechargeConfig, upsertAutoRechargeConfig } from "@/lib/auto-recharge";

// GET /api/credits/auto-recharge
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const config = await getAutoRechargeConfig(user.id);
    return NextResponse.json(config);
  } catch {
    return apiError("Failed to load auto-recharge settings", 500);
  }
}

const UpdateSchema = z.object({
  isEnabled: z.boolean(),
  thresholdCredits: z.number().int().min(500).max(100_000),
  rechargeCredits: z.union([z.literal(5_000), z.literal(10_000), z.literal(26_250), z.literal(55_000)]),
});

// PUT /api/credits/auto-recharge
export async function PUT(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON", 400);
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  try {
    await upsertAutoRechargeConfig(user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch {
    return apiError("Failed to save auto-recharge settings", 500);
  }
}
