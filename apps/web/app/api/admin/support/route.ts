import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";

// Roles that can see all tickets and assign them.
const TRIAGE_ROLES = ["support", "founder"] as const;

type ProfileRow = {
  team_role: string | null;
};

async function getCallerRole(userId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("profiles")
    .select("team_role")
    .eq("id", userId)
    .single();
  return (data as unknown as ProfileRow | null)?.team_role ?? null;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const isEmailAdmin = isAdminEmail(user.email);
  const isDbAdmin = !isEmailAdmin && (await isUserAdmin(user.id));
  if (!isEmailAdmin && !isDbAdmin) return apiError("Forbidden", 403);

  const db = createServiceClient();
  const role = isEmailAdmin ? "founder" : await getCallerRole(user.id);
  const canSeeAll = isEmailAdmin || TRIAGE_ROLES.includes(role as typeof TRIAGE_ROLES[number]);

  let query = db
    .from("support_tickets")
    .select(`
      id, user_id, user_email, user_tier, type, subject, status,
      assigned_to, created_at, updated_at,
      assignee:profiles!support_tickets_assigned_to_fkey(id, display_name, username)
    `)
    .order("updated_at", { ascending: false });

  if (!canSeeAll) {
    // Dev / marketing see only tickets explicitly assigned to them
    query = query.eq("assigned_to", user.id);
  }

  const { data, error } = await query;
  if (error) return apiError(error.message, 500);

  return NextResponse.json({
    tickets: data ?? [],
    can_assign: canSeeAll,
  });
}
