import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser, writeNotification } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";

const TRIAGE_ROLES = ["support", "founder"] as const;

const PatchSchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

type SupportDb = any;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const isEmailAdmin = isAdminEmail(user.email);
  if (!isEmailAdmin && !(await isUserAdmin(user.id))) {
    return apiError("Forbidden", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", 400);

  // Only support/founder can reassign tickets
  if ("assigned_to" in parsed.data && parsed.data.assigned_to !== undefined) {
    if (!isEmailAdmin) {
      const db = createServiceClient();
      const { data: profile } = await db
        .from("profiles")
        .select("team_role")
        .eq("id", user.id)
        .single();
      const role = (profile as unknown as { team_role: string | null } | null)?.team_role ?? null;
      if (!TRIAGE_ROLES.includes(role as typeof TRIAGE_ROLES[number])) {
        return apiError("Only support and founders can assign tickets", 403);
      }
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.assigned_to !== undefined) update.assigned_to = parsed.data.assigned_to;

  const db = createServiceClient() as SupportDb;

  // Fetch current ticket to get subject + previous assignee before updating
  const { data: ticketBefore } = await db
    .from("support_tickets")
    .select("subject, assigned_to")
    .eq("id", id)
    .single();

  const { error } = await db
    .from("support_tickets")
    .update(update)
    .eq("id", id);

  if (error) return apiError(error.message, 500);

  // Notify the newly assigned team member (fire-and-forget)
  const newAssignee = parsed.data.assigned_to;
  if (newAssignee && newAssignee !== ticketBefore?.assigned_to) {
    const subject = (ticketBefore as { subject?: string } | null)?.subject ?? "a support ticket";
    void writeNotification(newAssignee, {
      type: "ticket_assigned",
      title: "Ticket assigned to you",
      body: `You've been assigned: "${subject}"`,
      href: "/admin/support",
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
