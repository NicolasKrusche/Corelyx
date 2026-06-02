import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { isAdmin } from "@/lib/admin";
import { writeAppLog } from "@/lib/app-logs";

const CODE_TYPES = ["solo_lifetime", "team_lifetime", "scale_lifetime", "unlimited", "solo_trial", "team_trial", "run_credits"] as const;

const CreateCodeSchema = z.object({
  code: z.string().min(3).max(64).transform((s) => s.trim().toUpperCase()).optional(),
  label: z.string().max(100).optional(),
  type: z.enum(CODE_TYPES),
  value: z.record(z.unknown()).optional(),
  locked_to_email: z.string().email().optional().or(z.literal("")),
  max_uses: z.number().int().positive().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
});

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars
  return Array.from({ length: 16 }, () => chars[randomInt(chars.length)]).join("");
}

// GET /api/admin/codes — list all codes with usage stats
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id, user.email))) return apiError("Forbidden", 403);

  const service = createServiceClient();
  const { data, error } = await service
    .from("redemption_codes")
    .select("*, redemptions(redeemed_at, profiles(id, email, display_name))")
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ codes: data });
}

// POST /api/admin/codes — create a code
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id, user.email))) return apiError("Forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = CreateCodeSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { code, label, type, value, locked_to_email, max_uses, expires_at } = parsed.data;
  const service = createServiceClient();

  const finalCode = code || generateCode();

  const { data, error } = await service
    .from("redemption_codes")
    .insert({
      code: finalCode,
      label: label || null,
      type,
      value: value ?? null,
      locked_to_email: locked_to_email || null,
      max_uses: max_uses ?? null,
      expires_at: expires_at ?? null,
      created_by: user.id,
    } as never)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return apiError("A code with that text already exists.", 409);
    return apiError(error.message, 500);
  }

  await writeAppLog(service, {
    userId: user.id,
    level: "warning",
    source: "Admin",
    event: "admin.redemption_code.created",
    status: "completed",
    message: "Admin created a redemption code.",
    details: {
      code_id: (data as { id?: string } | null)?.id ?? null,
      type,
      label: label || null,
      locked_to_email: locked_to_email || null,
      max_uses: max_uses ?? null,
      expires_at: expires_at ?? null,
    },
  });

  return NextResponse.json({ code: data }, { status: 201 });
}
