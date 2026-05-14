import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";

type GrantRow = {
  id: string;
  program_id: string;
  ticket_id: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  programs: { name: string } | null;
};

// GET /api/support/grants?ticket_id=xxx
// List active (non-expired, non-revoked) grants for the current user, optionally filtered by ticket.
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const ticketId = searchParams.get("ticket_id");

  const service = createServiceClient();
  let q = service
    .from("support_access_grants")
    .select("id, program_id, ticket_id, expires_at, revoked_at, created_at, programs(name)")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  if (ticketId) q = q.eq("ticket_id", ticketId);

  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return apiError("Failed to fetch grants", 500);

  return NextResponse.json({ grants: (data ?? []) as GrantRow[] });
}

// POST /api/support/grants
// Body: { program_id, ticket_id }
// Grant support access to a specific program.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  let body: { program_id?: string; ticket_id?: string };
  try { body = await request.json(); } catch { return apiError("Invalid JSON", 400); }

  const { program_id, ticket_id } = body;
  if (!program_id) return apiError("program_id required", 400);

  const service = createServiceClient();

  // Verify the program belongs to the user
  const { data: program } = await service
    .from("programs")
    .select("id, user_id")
    .eq("id", program_id)
    .single();

  if (!program || (program as { user_id: string }).user_id !== user.id) {
    return apiError("Program not found", 404);
  }

  // Upsert — if one exists for this combo, refresh the expiry
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await service
    .from("support_access_grants")
    .upsert(
      {
        user_id: user.id,
        program_id,
        ticket_id: ticket_id ?? null,
        expires_at: expiresAt,
        revoked_at: null,
      } as never,
      { onConflict: "user_id,program_id,ticket_id", ignoreDuplicates: false },
    )
    .select("id, program_id, ticket_id, expires_at, created_at, programs(name)")
    .single();

  if (error) return apiError("Failed to create grant", 500);
  return NextResponse.json({ grant: data }, { status: 201 });
}
