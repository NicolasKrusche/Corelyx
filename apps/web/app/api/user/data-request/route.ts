import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";

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
  submitted_at: string;
  due_at: string;
  completed_at: string | null;
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
};

type AppLogTable = {
  insert(values: Record<string, unknown>): PromiseLike<{ error: DbError | null }>;
};

type ComplianceClient = {
  from(table: "data_subject_requests"): DataSubjectRequestTable;
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
    .select("id, request_type, status, details, submitted_at, due_at, completed_at")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) return apiError(error.message, 500);

  return NextResponse.json({
    requests: (data ?? []) as DataSubjectRequestRow[],
  });
}

// POST /api/user/data-request - create and timestamp a DSR request.
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

  const { data, error } = await service
    .from("data_subject_requests")
    .insert({
      user_id: user.id,
      request_type: requestType,
      requester_email: user.email ?? null,
      details,
    })
    .select("id, request_type, status, details, submitted_at, due_at, completed_at")
    .single();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Data request could not be created.", 500);

  try {
    await service.from("app_logs").insert({
      user_id: user.id,
      level: "info",
      source: "compliance",
      event: "data_subject_request.submitted",
      status: "submitted",
      message: `Data subject request submitted: ${requestType}`,
      details: {
        request_id: data.id,
        request_type: requestType,
        due_at: data.due_at,
      },
    });
  } catch (error) {
    console.warn("[compliance] failed to write DSR app log:", error);
  }

  return NextResponse.json(
    { request: data as DataSubjectRequestRow },
    { status: 201 }
  );
}
