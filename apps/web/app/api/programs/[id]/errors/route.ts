import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { canView, getProgramAccess } from "@/lib/workspaces";

// GET /api/programs/[id]/errors — List DLQ entries for a program

export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const serviceClient = createServiceClient();
  const { data: entries, error: dlqError } = await serviceClient
    .from("dead_letter_entries")
    .select("*")
    .eq("program_id", params.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (dlqError) return apiError(dlqError.message, 500);

  return NextResponse.json({ ok: true, entries: entries ?? [] });
}
