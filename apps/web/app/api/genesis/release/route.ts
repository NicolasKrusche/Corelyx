import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { getGenesisReleaseState, setGenesisReleaseState } from "@/lib/genesis/release-flag";

// GET /api/genesis/release — current release state { active, version }.
// Readable by any signed-in user (the app-wide gate polls this to decide
// whether to show the announcement). Only non-sensitive fields are returned.
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  return NextResponse.json(await getGenesisReleaseState());
}

const PostSchema = z.object({
  active: z.boolean().optional(),
  bumpVersion: z.boolean().optional(),
});

// POST /api/genesis/release — publish/unpublish or re-show (bump version).
// Admin (technical access) only.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!(await hasTechnicalAccess(user.id, user.email))) {
    return apiError("Admin access required", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const next = await setGenesisReleaseState(parsed.data);
  return NextResponse.json(next);
}
