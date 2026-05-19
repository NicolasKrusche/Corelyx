import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
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
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.corelyx.app";

type DataRequestBody = {
  request_type?: unknown;
  type?: unknown;
  details?: unknown;
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

type DbError = { message: string };

type DataSubjectRequestTable = {
  select(columns: string): {
    eq(column: "user_id", value: string): {
      order(
        column: "submitted_at",
        options: { ascending: boolean }
      ): PromiseLike<{ data: DataSubjectRequestRow[] | null; error: DbError | null }>;
    };
  };
  insert(values: Record<string, unknown>): {
    select(columns: string): {
      single(): PromiseLike<{ data: DataSubjectRequestRow | null; error: DbError | null }>;
    };
  };
  update(values: Record<string, unknown>): {
    eq(column: "id", value: string): {
      select(columns: string): {
        single(): PromiseLike<{ data: DataSubjectRequestRow | null; error: DbError | null }>;
      };
    };
  };
};

type ProfileTable = {
  update(values: Record<string, unknown>): {
    eq(column: "id", value: string): PromiseLike<{ error: DbError | null }>;
  };
};

type AppLogTable = {
  insert(values: Record<string, unknown>): PromiseLike<{ error: DbError | null }>;
};

type ComplianceClient = {
  from(table: "data_subject_requests"): DataSubjectRequestTable;
  from(table: "profiles"): ProfileTable;
  from(table: "app_logs"): AppLogTable;
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

// GET /api/user/data-request - list the authenticated user's DSR requests.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as unknown as ComplianceClient;
  const { data, error } = await service
    .from("data_subject_requests")
    .select("id, request_type, status, details, response_summary, submitted_at, due_at, completed_at")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) return apiError(error.message, 500);

  return NextResponse.json({
    requests: (data ?? []) as DataSubjectRequestRow[],
  });
}

// POST /api/user/data-request - create, fulfill or queue a DSR.
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = (await request.json().catch(() => null)) as DataRequestBody | null;
  const requestType = body?.request_type ?? body?.type;

  if (!isDataSubjectRequestType(requestType)) {
    return apiError("Invalid data request type.", 400);
  }

  const service = createServiceClient() as unknown as ComplianceClient;
  const details = normalizeDetails(body?.details);

  const { data: inserted, error } = await service
    .from("data_subject_requests")
    .insert({
      user_id: user.id,
      request_type: requestType,
      requester_email: user.email ?? null,
      details,
    })
    .select("id, request_type, status, details, response_summary, submitted_at, due_at, completed_at")
    .single();

  if (error) return apiError(error.message, 500);
  if (!inserted) return apiError("Data request could not be created.", 500);

  let record: DataSubjectRequestRow = inserted;

  // Side-effects per request type.
  let autoFulfillSummary: string | null = null;
  let autoDownloadUrl: string | undefined;

  if (requestType === "restriction") {
    const restrictedAt = new Date().toISOString();
    const { error: restrictionError } = await service
      .from("profiles")
      .update({
        processing_restricted: true,
        processing_restricted_at: restrictedAt,
        processing_restriction_reason: details ?? "GDPR Art. 18 restriction request submitted by user.",
      })
      .eq("id", user.id);

    if (restrictionError) return apiError(restrictionError.message, 500);

    autoFulfillSummary =
      "Your account has been flagged for processing restriction. Automated runs and triggers are paused while we review.";

    const reviewed = await markInReview(service, record.id, autoFulfillSummary);
    if (reviewed) record = reviewed;
  }

  if (requestType === "access" || requestType === "portability") {
    autoDownloadUrl = `${APP_URL}/api/user/export`;
    autoFulfillSummary =
      requestType === "portability"
        ? "Your portable data export (JSON) is available immediately via your account."
        : "Your data export (JSON) is available immediately via your account.";

    const summary = `${autoFulfillSummary} Endpoint: ${autoDownloadUrl}`;
    const completed = await markCompleted(service, record.id, summary);
    if (completed) record = completed;
  }

  if (requestType === "withdrawal") {
    autoFulfillSummary =
      "Marketing-related cookies and analytics consent have been cleared. Essential authentication cookies remain because they are strictly necessary.";
    const completed = await markCompleted(service, record.id, autoFulfillSummary);
    if (completed) record = completed;
  }

  // Audit log (best-effort).
  try {
    await service.from("app_logs").insert({
      user_id: user.id,
      level: "info",
      source: "compliance",
      event: "data_subject_request.submitted",
      status: record.status,
      message: `Data subject request submitted: ${requestType}`,
      details: {
        request_id: record.id,
        request_type: requestType,
        due_at: record.due_at,
        auto_fulfilled: Boolean(autoFulfillSummary),
        processing_restricted: requestType === "restriction",
      },
    });
  } catch (logError) {
    console.warn("[compliance] failed to write DSR app log:", logError);
  }

  // Email notifications (best-effort — never block the response).
  const typeLabel = REQUEST_TYPE_LABELS[requestType];
  const reference = record.id;

  if (user.email) {
    void sendDsrConfirmationEmail({
      to: user.email,
      reference,
      typeLabel,
      submittedAt: record.submitted_at,
      dueAt: record.due_at,
      details: record.details,
      autoFulfilled: autoFulfillSummary
        ? { summary: autoFulfillSummary, downloadUrl: autoDownloadUrl }
        : null,
    }).catch((err) => console.warn("[compliance] user confirmation email failed:", err));
  }

  void sendDsrLegalNotificationEmail({
    to: LEGAL_EMAIL,
    reference,
    typeLabel,
    requestType,
    userEmail: user.email ?? "(no email on record)",
    userId: user.id,
    submittedAt: record.submitted_at,
    dueAt: record.due_at,
    details: record.details,
    autoFulfilled: Boolean(autoFulfillSummary),
  }).catch((err) => console.warn("[compliance] legal notification email failed:", err));

  return NextResponse.json({ request: record }, { status: 201 });
}

// PATCH /api/user/data-request - submit follow-up info when status is waiting_on_user.
export async function PATCH(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null) as { id?: unknown; follow_up?: unknown } | null;
  const id = body?.id;
  const followUp = typeof body?.follow_up === "string" ? body.follow_up.trim().slice(0, 4000) : null;

  if (typeof id !== "string" || !id) return apiError("id is required", 400);
  if (!followUp) return apiError("follow_up text is required", 400);

  const service = createServiceClient() as unknown as ComplianceClient;

  // Verify ownership and that request is actually waiting on the user
  const { data: existing } = await service
    .from("data_subject_requests")
    .select("id, request_type, status, requester_email, submitted_at, due_at, completed_at, details, response_summary")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  const row = (existing ?? []).find((r) => r.id === id);
  if (!row) return apiError("Request not found", 404);
  if (row.status !== "waiting_on_user") return apiError("Request is not waiting for your response", 400);

  const { data: updated, error } = await service
    .from("data_subject_requests")
    .update({
      status: "in_review",
      user_followup: followUp,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, request_type, status, details, response_summary, submitted_at, due_at, completed_at")
    .single();

  if (error || !updated) return apiError("Failed to update request", 500);

  const typeLabel = REQUEST_TYPE_LABELS[row.request_type as DataSubjectRequestType] ?? row.request_type;

  void sendDsrFollowUpNotificationEmail({
    to: LEGAL_EMAIL,
    reference: id,
    typeLabel,
    userEmail: user.email ?? row.requester_email ?? "(no email)",
    followUp,
  }).catch((err) => console.warn("[compliance] follow-up notification email failed:", err));

  return NextResponse.json({ request: updated });
}

async function markCompleted(
  service: ComplianceClient,
  id: string,
  responseSummary: string
): Promise<DataSubjectRequestRow | null> {
  const { data, error } = await service
    .from("data_subject_requests")
    .update({
      status: "completed",
      response_summary: responseSummary,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, request_type, status, details, response_summary, submitted_at, due_at, completed_at")
    .single();

  if (error || !data) {
    console.warn("[compliance] failed to mark request completed:", error?.message);
    return null;
  }
  return data;
}

async function markInReview(
  service: ComplianceClient,
  id: string,
  responseSummary: string
): Promise<DataSubjectRequestRow | null> {
  const { data, error } = await service
    .from("data_subject_requests")
    .update({
      status: "in_review",
      response_summary: responseSummary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, request_type, status, details, response_summary, submitted_at, due_at, completed_at")
    .single();

  if (error || !data) {
    console.warn("[compliance] failed to mark request in review:", error?.message);
    return null;
  }
  return data;
}
