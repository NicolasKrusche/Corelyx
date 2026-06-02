import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";

// POST /api/settings/consent — record explicit ToS + Privacy Policy acceptance
export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({
      legal_consented_at: new Date().toISOString(),
      legal_consent_version: "v1",
    } as never)
    .eq("id", user.id);

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ ok: true });
}
