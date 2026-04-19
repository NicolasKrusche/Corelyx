import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  execution_mode: z.enum(["autonomous", "supervised", "manual"]).optional(),
  conflict_policy: z.enum(["queue", "skip", "fail"]).optional(),
});

// PATCH /api/programs/[id]/settings
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { error } = await supabase
    .from("programs")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ ok: true });
}
