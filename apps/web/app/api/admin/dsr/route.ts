import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { writeAppLog } from "@/lib/app-logs";
import { sendDsrResponseEmail } from "@/lib/email";
import { createServerClient } from "@/lib/supabase/server";

const REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Right of Access (Art. 15 GDPR)",
  rectification: "Right to Rectification (Art. 16 GDPR)",
  erasure: "Right to Erasure (Art. 17 GDPR)",
  restriction: "Right to Restriction of Processing (Art. 18 GDPR)",
  portability: "Right to Data Portability (Art. 20 GDPR)",
  objection: "Right to Object (Art. 21 GDPR)",
  withdrawal: "Withdrawal of Consent (Art. 7(3) GDPR)",
};

const UpdateDsrSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["submitted", "in_review", "waiting_on_user", "completed", "rejected"]),
  response_summary: z.string().trim().max(8000).optional().nullable(),
});

type AdminDsrRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  request_type: string;
  status: "submitted" | "in_review" | "waiting_on_user" | "completed" | "rejected";
  requester_email: string | null;
  details: string | null;
  response_summary: string | null;
  submitted_at: string;
  due_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const includeClosed = searchParams.get("include_closed") === "1";
  const service = createServiceClient();

  let query = service
    .from("data_subject_requests")
    .select(
      "id, user_id, org_id, request_type, status, requester_email, details, response_summary, submitted_at, due_at, completed_at, created_at, updated_at"
    );

  if (!includeClosed) {
    query = query.not("status", "in", "(completed,rejected)");
  }

  const { data, error } = await query
    .order("due_at", { ascending: true })
    .order("submitted_at", { ascending: true })
    .limit(100);
  if (error) return apiError(error.message, 500);

  return NextResponse.json({ requests: (data ?? []) as unknown as AdminDsrRow[] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("Forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = UpdateDsrSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const responseSummary = parsed.data.response_summary?.trim() || null;
  if (["completed", "rejected", "waiting_on_user"].includes(parsed.data.status) && !responseSummary) {
    return apiError("A response summary is required for this status.", 400);
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const update = {
    status: parsed.data.status,
    response_summary: responseSummary,
    completed_at: parsed.data.status === "completed" || parsed.data.status === "rejected" ? now : null,
    updated_at: now,
  };

  const { data, error } = await service
    .from("data_subject_requests")
    .update(update as never)
    .eq("id", parsed.data.id)
    .select(
      "id, user_id, org_id, request_type, status, requester_email, details, response_summary, submitted_at, due_at, completed_at, created_at, updated_at"
    )
    .single();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Data subject request not found.", 404);

  const row = data as unknown as AdminDsrRow;

  await writeAppLog(service, {
    userId: row.user_id,
    level: "info",
    source: "Admin",
    event: "admin.data_subject_request.updated",
    status: row.status,
    message: "Admin updated a data subject request.",
    details: {
      request_id: row.id,
      request_type: row.request_type,
      admin_user_id: admin.id,
      completed_at: row.completed_at,
    },
  });

  if (responseSummary && ["completed", "rejected", "waiting_on_user"].includes(row.status)) {
    // Write to message thread so user sees it in their timeline
    void service
      .from("dsr_messages")
      .insert({ dsr_id: row.id, sender: "admin", body: responseSummary } as never)
      .catch(() => undefined);

    const email = row.requester_email;
    if (email) {
      void sendDsrResponseEmail({
        to: email,
        reference: row.id,
        typeLabel: REQUEST_TYPE_LABELS[row.request_type] ?? row.request_type,
        status: row.status as "completed" | "rejected" | "waiting_on_user",
        responseSummary,
      }).catch((err) => console.warn("[admin/dsr] response email failed:", err));
    }
  }

  return NextResponse.json({ request: row });
}
