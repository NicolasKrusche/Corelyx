import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";

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

  const { id } = await params;
  const db = createServiceClient() as SupportDb;

  const { data: ticket } = await db
    .from("support_tickets")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!ticket) return apiError("Not found", 404);

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

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = AddMessageSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", 400);

  const db = createServiceClient() as SupportDb;

  const { data: ticket } = await db
    .from("support_tickets")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!ticket) return apiError("Not found", 404);
  if ((ticket as { status: string }).status === "closed") return apiError("Ticket is closed", 409);

  const { data: message, error } = await db
    .from("support_messages")
    .insert({ ticket_id: id, sender_type: "user", content: parsed.data.content })
    .select("id, sender_type, content, created_at")
    .single();
  if (error) return apiError(error.message, 500);

  await db
    .from("support_tickets")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ message }, { status: 201 });
}
