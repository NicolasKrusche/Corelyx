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
  thresholdUsd: z.number().min(0.5).max(100),
  rechargeAmountUsd: z.number().min(5).max(200),
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
