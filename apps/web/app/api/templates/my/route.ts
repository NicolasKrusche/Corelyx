import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/templates/my
 *
 * Returns templates created by the current user.
 * Supports query params:
 *   ?status=pending|approved|rejected  — filter by status
 */
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const db = createServiceClient() as any;

  let query = db
    .from("templates")
    .select(
      "id, name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, thumbnail_url, is_public, status, rejection_reason, created_at, updated_at, fork_count"
    )
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return apiError("Failed to load templates", 500);
  }

  return NextResponse.json({ templates: data ?? [] });
}
