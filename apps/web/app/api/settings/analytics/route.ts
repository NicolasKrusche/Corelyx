import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";

// GET /api/settings/analytics — read the caller's usage-analytics opt-out preference.
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("analytics_opt_out")
    .eq("id", user.id)
    .single();

  if (error) return apiError(error.message, 500);

  return NextResponse.json({
    opt_out: (data as { analytics_opt_out?: boolean } | null)?.analytics_opt_out === true,
  });
}

// POST /api/settings/analytics — set the opt-out preference. Body: { opt_out: boolean }.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = (await request.json().catch(() => null)) as { opt_out?: unknown } | null;
  if (!body || typeof body.opt_out !== "boolean") {
    return apiError("Body must include a boolean 'opt_out'.", 400);
  }

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ analytics_opt_out: body.opt_out } as never)
    .eq("id", user.id);

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ ok: true, opt_out: body.opt_out });
}
