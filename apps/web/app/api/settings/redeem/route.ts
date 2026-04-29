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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAllowed = rateLimit(`redeem:user:${user.id}`, 8, 15 * 60 * 1000);
  const ipAllowed = rateLimit(`redeem:ip:${forwardedFor}`, 30, 15 * 60 * 1000);
  if (!userAllowed || !ipAllowed) {
    return apiError("Too many redemption attempts. Try again later.", 429);
  }

  const body = await request.json().catch(() => null);
  const parsed = RedeemSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid code format.", 400);

  const { code } = parsed.data;
  const service = createServiceClient();
  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) return apiError("No active workspace.", 400);

  // Fetch the code
  const { data: codeRow, error: codeErr } = await service
    .from("redemption_codes")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .single();

  if (codeErr || !codeRow) return invalidCodeResponse();
  const codeData = codeRow as unknown as {
    id: string;
    type: string;
    value: Record<string, unknown> | null;
    label: string | null;
    expires_at: string | null;
    max_uses: number | null;
    uses_count: number;
    locked_to_email: string | null;
  };

  // Check expiry
  if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
    return invalidCodeResponse();
  }

  // Check max uses
  if (codeData.max_uses !== null && codeData.uses_count >= codeData.max_uses) {
    return invalidCodeResponse();
  }

  // Check if locked to a specific email
  if (codeData.locked_to_email && codeData.locked_to_email.toLowerCase() !== user.email?.toLowerCase()) {
    return invalidCodeResponse();
  }

  // Check if user already redeemed this code
  const { data: existing } = await service
    .from("redemptions")
    .select("id")
    .eq("code_id", codeData.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return invalidCodeResponse();

  // Apply the benefit
  const workspaceUpdate: Record<string, unknown> = {};
  let benefitDescription = "";

  switch (codeData.type) {
    case "plus_lifetime":
      workspaceUpdate.tier = "plus";
      workspaceUpdate.plan_expires_at = null;
      benefitDescription = "Solo plan (lifetime)";
      break;

    case "plus_trial": {
      const days = (codeData.value as { days?: number } | null)?.days ?? 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      workspaceUpdate.tier = "plus";
      workspaceUpdate.plan_expires_at = expiresAt.toISOString();
      benefitDescription = `Solo plan for ${days} days`;
      break;
    }

    case "pro_lifetime":
      workspaceUpdate.tier = "pro";
      workspaceUpdate.plan_expires_at = null;
      workspaceUpdate.is_beta_tester = codeData.label?.toLowerCase().includes("beta") ? true : undefined;
      benefitDescription = "Team plan (lifetime)";
      break;

    case "builder_lifetime":
      workspaceUpdate.tier = "builder";
      workspaceUpdate.plan_expires_at = null;
      benefitDescription = "Builder plan (lifetime)";
      break;

    case "unlimited":
      workspaceUpdate.tier = "unlimited";
      workspaceUpdate.plan_expires_at = null;
      benefitDescription = "Unlimited plan (lifetime)";
      break;

    case "pro_trial": {
      const days = (codeData.value as { days?: number } | null)?.days ?? 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      workspaceUpdate.tier = "pro";
      workspaceUpdate.plan_expires_at = expiresAt.toISOString();
      benefitDescription = `Pro plan for ${days} days`;
      break;
    }

    case "run_credits": {
      const runs = (codeData.value as { runs?: number } | null)?.runs ?? 100;
      const { data: workspace } = await service
        .from("workspaces")
        .select("bonus_runs")
        .eq("id", activeWorkspace.workspaceId)
        .single();
      workspaceUpdate.bonus_runs = (((workspace as { bonus_runs?: number } | null)?.bonus_runs) ?? 0) + runs;
      benefitDescription = `${runs} bonus runs added`;
      break;
    }

    default:
      return apiError("Unknown code type.", 500);
  }

  // Remove undefined keys
  for (const key of Object.keys(workspaceUpdate)) {
    if (workspaceUpdate[key] === undefined) delete workspaceUpdate[key];
  }

  // Apply benefit to the active workspace.
  const { error: updateErr } = await service
    .from("workspaces")
    .update(workspaceUpdate as never)
    .eq("id", activeWorkspace.workspaceId);

  if (updateErr) return apiError("Failed to apply benefit.", 500);

  // Record redemption + increment uses_count atomically
  const { error: redemptionErr } = await service
    .from("redemptions")
    .insert({ code_id: codeData.id, user_id: user.id } as never);

  if (redemptionErr) return apiError("Failed to record redemption.", 500);

  await service
    .from("redemption_codes")
    .update({ uses_count: codeData.uses_count + 1 } as never)
    .eq("id", codeData.id);

  return NextResponse.json({ success: true, benefit: benefitDescription });
}
