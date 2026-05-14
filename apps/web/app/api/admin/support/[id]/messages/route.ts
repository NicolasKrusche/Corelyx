import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";

const AddMessageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

type SupportDb = any;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!isAdminEmail(user.email) && !(await isUserAdmin(user.id))) {
    return apiError("Forbidden", 403);
  }

  const { id } = await params;
  const db = createServiceClient() as SupportDb;
  const { data, error } = await db
    .from("support_messages")
    .select("id, sender_type, content, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!isAdminEmail(user.email) && !(await isUserAdmin(user.id))) {
    return apiError("Forbidden", 403);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = AddMessageSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", 400);

  const db = createServiceClient() as SupportDb;
  const { data: message, error } = await db
    .from("support_messages")
    .insert({ ticket_id: id, sender_type: "admin", content: parsed.data.content })
    .select("id, sender_type, content, created_at")
    .single();

  if (error) return apiError(error.message, 500);

  // Re-open the ticket on admin reply and bump updated_at so it surfaces in the list
  await db
    .from("support_tickets")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ message }, { status: 201 });
}
