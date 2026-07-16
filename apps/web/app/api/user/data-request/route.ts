import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { sendDsrConfirmationEmail, sendDsrLegalNotificationEmail, sendDsrFollowUpNotificationEmail } from "@/lib/email";

const REQUEST_TYPES = [
  "access",
  "rectification",
  "erasure",
  "restriction",
  "portability",
  "objection",
  "withdrawal",
] as const;

type DataSubjectRequestType = (typeof REQUEST_TYPES)[number];

const REQUEST_TYPE_LABELS: Record<DataSubjectRequestType, string> = {
  access: "Right of Access (Art. 15 GDPR)",
  rectification: "Right to Rectification (Art. 16 GDPR)",
  erasure: "Right to Erasure (Art. 17 GDPR)",
  restriction: "Right to Restriction of Processing (Art. 18 GDPR)",
  portability: "Right to Data Portability (Art. 20 GDPR)",
  objection: "Right to Object (Art. 21 GDPR)",
  withdrawal: "Withdrawal of Consent (Art. 7(3) GDPR)",
};

const LEGAL_EMAIL = process.env.LEGAL_NOTIFY_EMAIL ?? "legal@corelyx.app";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.corelyx.app";

export type DsrMessage = {
  id: string;
  dsr_id: string;
  sender: "user" | "admin";
  body: string;
  created_at: string;
};

type DataSubjectRequestRow = {
  id: string;
  request_type: DataSubjectRequestType;
  status: "submitted" | "in_review" | "waiting_on_user" | "completed" | "rejected";
  details: string | null;
  response_summary: string | null;
  submitted_at: string;
  due_at: string;
  completed_at: string | null;
  requester_email: string | null;
};

export type DsrRowWithMessages = DataSubjectRequestRow & {
  messages: DsrMessage[];
};

function isDataSubjectRequestType(value: unknown): value is DataSubjectRequestType {
  return typeof value === "string" && REQUEST_TYPES.includes(value as DataSubjectRequestType);
}

function normalizeDetails(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 4000);
}

async function insertMessage(dsrId: string, sender: "user" | "admin", body: string): Promise<void> {
  const service = createServiceClient();
  await (service as unknown as { from(t: string): { insert(v: Record<string, unknown>): Promise<unknown> } })
    .from("dsr_messages")
    .insert({ dsr_id: dsrId, sender, body });
}

// GET /api/user/data-request - list the authenticated user's DSRs with message threads.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient();

  const { data: requests, error } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        eq(col: string, val: string): {
          order(col: string, opts: { ascending: boolean }): Promise<{ data: DataSubjectRequestRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("data_subject_requests")
    .select("id, request_type, status, details, response_summary, submitted_at, due_at, completed_at")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  const rows = (requests ?? []) as DataSubjectRequestRow[];
  if (rows.length === 0) return NextResponse.json({ requests: [] });

  // Fetch all messages for these DSRs in one query
  const ids = rows.map((r) => r.id);
  const { data: messages } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        in(col: string, vals: string[]): {
          order(col: string, opts: { ascending: boolean }): Promise<{ data: DsrMessage[] | null; error: unknown }>;
        };
      };
    };
  })
    .from("dsr_messages")
    .select("id, dsr_id, sender, body, created_at")
    .in("dsr_id", ids)
    .order("created_at", { ascending: true });

  const msgByDsr = new Map<string, DsrMessage[]>();
  for (const msg of (messages ?? []) as DsrMessage[]) {
    const list = msgByDsr.get(msg.dsr_id) ?? [];
    list.push(msg);
    msgByDsr.set(msg.dsr_id, list);
  }

  const result: DsrRowWithMessages[] = rows.map((r) => ({
    ...r,
    messages: msgByDsr.get(r.id) ?? [],
  }));

  return NextResponse.json({ requests: result });
}

// POST /api/user/data-request - create, fulfill or queue a DSR.
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  // Each submission notifies legal@ and the user by email — cap the volume a
  // single account can generate. 10/day is far above any legitimate use.
  if (!(await rateLimit(`dsr:${user.id}`, 10, 24 * 60 * 60 * 1000))) {
    return apiError("Too many data requests. Please try again later or email legal@corelyx.app.", 429);
  }

  const body = (await request.json().catch(() => null)) as { request_type?: unknown; type?: unknown; details?: unknown } | null;
  const requestType = body?.request_type ?? body?.type;

  if (!isDataSubjectRequestType(requestType)) {
    return apiError("Invalid data request type.", 400);
  }

  const service = createServiceClient();
  const details = normalizeDetails(body?.details);

  const { data: inserted, error } = await (service as unknown as {
    from(t: string): {
      insert(v: Record<string, unknown>): {
        select(c: string): { single(): Promise<{ data: DataSubjectRequestRow | null; error: { message: string } | null }> };
      };
    };
  })
    .from("data_subject_requests")
    .insert({ user_id: user.id, request_type: requestType, requester_email: user.email ?? null, details })
    .select("id, request_type, status, details, response_summary, submitted_at, due_at, completed_at")
    .single();

  if (error) return apiError(error.message, 500);
  if (!inserted) return apiError("Data request could not be created.", 500);

  let record: DataSubjectRequestRow = inserted;

  // Write initial user message if they included details
  if (details) {
    await insertMessage(record.id, "user", details).catch(() => undefined);
  }

  let autoFulfillSummary: string | null = null;
  let autoDownloadUrl: string | undefined;

  if (requestType === "restriction") {
    const restrictedAt = new Date().toISOString();
    await (service as unknown as { from(t: string): { update(v: Record<string, unknown>): { eq(c: string, v: string): Promise<unknown> } } })
      .from("profiles")
      .update({ processing_restricted: true, processing_restricted_at: restrictedAt, processing_restriction_reason: details ?? "GDPR Art. 18 restriction request submitted by user." })
      .eq("id", user.id);

    autoFulfillSummary = "Your account has been flagged for processing restriction. Automated runs and triggers are paused while we review.";
    const reviewed = await updateDsr(service, record.id, { status: "in_review", response_summary: autoFulfillSummary });
    if (reviewed) record = reviewed;
    await insertMessage(record.id, "admin", autoFulfillSummary).catch(() => undefined);
  }

  if (requestType === "access" || requestType === "portability") {
    autoDownloadUrl = `${APP_URL}/api/user/export`;
    autoFulfillSummary = requestType === "portability"
      ? "Your portable data export (JSON) is available immediately via your account."
      : "Your data export (JSON) is available immediately via your account.";
    const summary = `${autoFulfillSummary} Endpoint: ${autoDownloadUrl}`;
    const completed = await updateDsr(service, record.id, { status: "completed", response_summary: summary, completed_at: new Date().toISOString() });
    if (completed) record = completed;
    await insertMessage(record.id, "admin", summary).catch(() => undefined);
  }

  if (requestType === "withdrawal") {
    autoFulfillSummary = "Marketing-related cookies and analytics consent have been cleared. Essential authentication cookies remain because they are strictly necessary.";
    const completed = await updateDsr(service, record.id, { status: "completed", response_summary: autoFulfillSummary, completed_at: new Date().toISOString() });
    if (completed) record = completed;
    await insertMessage(record.id, "admin", autoFulfillSummary).catch(() => undefined);
  }

  // Audit log (best-effort)
  try {
    await (service as unknown as { from(t: string): { insert(v: Record<string, unknown>): Promise<unknown> } })
      .from("app_logs")
      .insert({ user_id: user.id, level: "info", source: "compliance", event: "data_subject_request.submitted", status: record.status, message: `Data subject request submitted: ${requestType}`, details: { request_id: record.id, request_type: requestType, due_at: record.due_at, auto_fulfilled: Boolean(autoFulfillSummary) } });
  } catch {}

  const typeLabel = REQUEST_TYPE_LABELS[requestType];

  if (user.email) {
    void sendDsrConfirmationEmail({ to: user.email, reference: record.id, typeLabel, submittedAt: record.submitted_at, dueAt: record.due_at, details: record.details, autoFulfilled: autoFulfillSummary ? { summary: autoFulfillSummary, downloadUrl: autoDownloadUrl } : null }).catch(() => undefined);
  }

  void sendDsrLegalNotificationEmail({ to: LEGAL_EMAIL, reference: record.id, typeLabel, requestType, userEmail: user.email ?? "(no email on record)", userId: user.id, submittedAt: record.submitted_at, dueAt: record.due_at, details: record.details, autoFulfilled: Boolean(autoFulfillSummary) }).catch(() => undefined);

  return NextResponse.json({ request: record }, { status: 201 });
}

// PATCH /api/user/data-request - submit follow-up when status is waiting_on_user.
export async function PATCH(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null) as { id?: unknown; follow_up?: unknown } | null;
  const id = body?.id;
  const followUp = typeof body?.follow_up === "string" ? body.follow_up.trim().slice(0, 4000) : null;

  if (typeof id !== "string" || !id) return apiError("id is required", 400);
  if (!followUp) return apiError("follow_up text is required", 400);

  const service = createServiceClient();

  const { data: existing } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        eq(col: string, val: string): {
          order(c: string, o: { ascending: boolean }): Promise<{ data: (DataSubjectRequestRow & { requester_email: string | null })[] | null; error: unknown }>;
        };
      };
    };
  })
    .from("data_subject_requests")
    .select("id, request_type, status, requester_email, submitted_at, due_at, completed_at, details, response_summary")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  const row = (existing ?? []).find((r) => r.id === id);
  if (!row) return apiError("Request not found", 404);
  if (row.status !== "waiting_on_user") return apiError("Request is not waiting for your response", 400);

  const updated = await updateDsr(service, id, { status: "in_review", user_followup: followUp });
  if (!updated) return apiError("Failed to update request", 500);

  await insertMessage(id, "user", followUp).catch(() => undefined);

  const typeLabel = REQUEST_TYPE_LABELS[row.request_type as DataSubjectRequestType] ?? row.request_type;
  void sendDsrFollowUpNotificationEmail({ to: LEGAL_EMAIL, reference: id, typeLabel, userEmail: user.email ?? (row as unknown as { requester_email: string | null }).requester_email ?? "(no email)", followUp }).catch(() => undefined);

  return NextResponse.json({ request: updated });
}

async function updateDsr(
  service: ReturnType<typeof createServiceClient>,
  id: string,
  values: Record<string, unknown>,
): Promise<DataSubjectRequestRow | null> {
  const { data, error } = await (service as unknown as {
    from(t: string): {
      update(v: Record<string, unknown>): {
        eq(c: string, v: string): {
          select(c: string): { single(): Promise<{ data: DataSubjectRequestRow | null; error: { message: string } | null }> };
        };
      };
    };
  })
    .from("data_subject_requests")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, request_type, status, details, response_summary, submitted_at, due_at, completed_at")
    .single();

  if (error || !data) return null;
  return data;
}
