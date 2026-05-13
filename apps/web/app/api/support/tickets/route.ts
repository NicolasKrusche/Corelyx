import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";

const CreateTicketSchema = z.object({
  type: z.enum(["support", "sales", "priority"]),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const db = createServiceClient();
  const { data, error } = await db
    .from("support_tickets")
    .select("id, type, subject, status, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = CreateTicketSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", 400);

  const { type, subject, message } = parsed.data;
  const db = createServiceClient();

  const [{ data: profile }] = await Promise.all([
    db.from("profiles").select("tier").eq("id", user.id).single(),
  ]);

  const { data: ticket, error: ticketError } = await db
    .from("support_tickets")
    .insert({
      user_id: user.id,
      user_email: user.email ?? "",
      user_tier: (profile as { tier?: string } | null)?.tier ?? "free",
      type,
      subject,
    })
    .select("id")
    .single();

  if (ticketError || !ticket) return apiError(ticketError?.message ?? "Failed", 500);

  const { error: msgError } = await db
    .from("support_messages")
    .insert({ ticket_id: (ticket as { id: string }).id, sender_type: "user", content: message });

  if (msgError) return apiError(msgError.message, 500);

  return NextResponse.json({ ticket: { id: (ticket as { id: string }).id } }, { status: 201 });
}
