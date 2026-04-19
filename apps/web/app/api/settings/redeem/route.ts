import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";

const RedeemSchema = z.object({
  code: z.string().min(1).max(64).transform((s) => s.trim().toUpperCase()),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = RedeemSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid code format.", 400);

  const { code } = parsed.data;
  const service = createServiceClient();

  // Fetch the code
  const { data: codeRow, error: codeErr } = await service
    .from("redemption_codes")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .single();

  if (codeErr || !codeRow) return apiError("Code not found or no longer active.", 404);

  // Check expiry
  if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
    return apiError("This code has expired.", 410);
  }

  // Check max uses
  if (codeRow.max_uses !== null && codeRow.uses_count >= codeRow.max_uses) {
    return apiError("This code has reached its maximum number of uses.", 410);
  }

  // Check if locked to a specific email
  if (codeRow.locked_to_email && codeRow.locked_to_email.toLowerCase() !== user.email?.toLowerCase()) {
    return apiError("This code is not valid for your account.", 403);
  }

  // Check if user already redeemed this code
  const { data: existing } = await service
    .from("redemptions")
    .select("id")
    .eq("code_id", codeRow.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return apiError("You have already redeemed this code.", 409);

  // Apply the benefit
  const profileUpdate: Record<string, unknown> = {};
  let benefitDescription = "";

  switch (codeRow.type) {
    case "pro_lifetime":
      profileUpdate.tier = "pro";
      profileUpdate.plan_expires_at = null;
      profileUpdate.is_beta_tester = codeRow.label?.toLowerCase().includes("beta") ? true : undefined;
      benefitDescription = "Pro plan (lifetime)";
      break;

    case "builder_lifetime":
      profileUpdate.tier = "builder";
      profileUpdate.plan_expires_at = null;
      benefitDescription = "Builder plan (lifetime)";
      break;

    case "unlimited":
      profileUpdate.tier = "unlimited";
      profileUpdate.plan_expires_at = null;
      benefitDescription = "Unlimited plan (lifetime)";
      break;

    case "pro_trial": {
      const days = (codeRow.value as { days?: number } | null)?.days ?? 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      profileUpdate.tier = "pro";
      profileUpdate.plan_expires_at = expiresAt.toISOString();
      benefitDescription = `Pro plan for ${days} days`;
      break;
    }

    case "run_credits": {
      const runs = (codeRow.value as { runs?: number } | null)?.runs ?? 100;
      // Fetch current bonus_runs and increment
      const { data: profile } = await service
        .from("profiles")
        .select("bonus_runs")
        .eq("id", user.id)
        .single();
      profileUpdate.bonus_runs = ((profile?.bonus_runs as number) ?? 0) + runs;
      benefitDescription = `${runs} bonus runs added`;
      break;
    }

    default:
      return apiError("Unknown code type.", 500);
  }

  // Remove undefined keys
  for (const key of Object.keys(profileUpdate)) {
    if (profileUpdate[key] === undefined) delete profileUpdate[key];
  }

  // Apply profile update
  const { error: updateErr } = await service
    .from("profiles")
    .update(profileUpdate)
    .eq("id", user.id);

  if (updateErr) return apiError("Failed to apply benefit.", 500);

  // Record redemption + increment uses_count atomically
  const { error: redemptionErr } = await service
    .from("redemptions")
    .insert({ code_id: codeRow.id, user_id: user.id });

  if (redemptionErr) return apiError("Failed to record redemption.", 500);

  await service
    .from("redemption_codes")
    .update({ uses_count: codeRow.uses_count + 1 })
    .eq("id", codeRow.id);

  return NextResponse.json({ success: true, benefit: benefitDescription });
}
