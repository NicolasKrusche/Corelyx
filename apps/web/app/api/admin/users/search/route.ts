import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";

// GET /api/admin/users/search?q=email — search users by email for the admin code UI
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ users: [] });

  const service = createServiceClient();

  // Search auth.users via admin API
  const { data, error } = await service.auth.admin.listUsers({ perPage: 10 });
  if (error) return apiError(error.message, 500);

  const matches = (data.users ?? [])
    .filter((u) => u.email?.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8)
    .map((u) => ({ id: u.id, email: u.email, created_at: u.created_at }));

  return NextResponse.json({ users: matches });
}
