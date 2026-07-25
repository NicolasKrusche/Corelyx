import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";
import { serverLog } from "@/lib/server-log";

async function requireAdminUser(): Promise<{ id: string } | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(isAdminEmail(user.email ?? undefined) || (await isUserAdmin(user.id)))) return null;
  return { id: user.id };
}

export async function GET(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return apiError("Admin access required", 403);

  const { searchParams } = new URL(request.url);
  const actorId = searchParams.get("actor_id") || undefined;
  const targetType = searchParams.get("target_type") || undefined;
  const targetId = searchParams.get("target_id") || undefined;
  const action = searchParams.get("action") || undefined;
  const riskLevel = searchParams.get("risk_level") || undefined;
  const success = searchParams.get("success") ? searchParams.get("success") === "true" : undefined;
  const workspaceId = searchParams.get("workspace_id") || undefined;
  const dateFrom = searchParams.get("date_from") || undefined;
  const dateTo = searchParams.get("date_to") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");
  const sortBy = searchParams.get("sort_by") || "timestamp";
  const sortOrder = searchParams.get("sort_order")?.toLowerCase() === "asc" ? "asc" : "desc";

  const db = createServiceClient() as unknown as { from(t: string): any };

  const query = db.from("admin_audit_logs").select("*", { count: "exact" });

  if (actorId) query.eq("actor_id", actorId);
  if (targetType) query.eq("target_type", targetType);
  if (targetId) query.eq("target_id", targetId);
  if (action) query.eq("action", action);
  if (riskLevel) query.eq("risk_level", riskLevel);
  if (success !== undefined) query.eq("success", success);
  if (workspaceId) query.eq("workspace_id", workspaceId);
  if (dateFrom) query.gte("timestamp", dateFrom);
  if (dateTo) query.lte("timestamp", dateTo);

  const sortCol = ["timestamp", "risk_level", "action", "actor_id", "target_type"].includes(sortBy) ? sortBy : "timestamp";
  const sortDir = sortOrder === "asc" ? { ascending: true } : { ascending: false };

  query.order(sortCol, sortDir).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return apiError("Failed to load admin audit logs", 500);
  }

  return NextResponse.json({ data: data ?? [], count: count ?? 0, limit, offset });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return apiError("Admin access required", 403);

  const body = await request.json().catch(() => null) as {
    action?: string;
    target_type?: string;
    target_id?: string;
    target_identifier?: string;
    risk_level?: "low" | "medium" | "high" | "critical";
    reason?: string;
    metadata?: Record<string, unknown>;
    legal_basis?: "legitimate_interest" | "contract" | "legal_obligation" | "vital_interests" | "public_task" | "consent";
    data_subject_ids?: string[];
    retention_category?: "audit_log" | "security_log" | "compliance_evidence" | "operational_log";
    retention_days?: number;
    workspace_id?: string;
    correlation_id?: string;
    session_id?: string;
  } | null;

  if (!body?.action || !body?.target_type || !body?.target_id) {
    return apiError("action, target_type, and target_id are required", 400);
  }

  const validTargetTypes = ["user", "workspace", "program", "connector", "billing", "security", "compliance", "system", "integration", "admin"];
  if (!validTargetTypes.includes(body.target_type)) {
    return apiError("Invalid target_type", 400);
  }

  const validRiskLevels = ["low", "medium", "high", "critical"];
  if (body.risk_level && !validRiskLevels.includes(body.risk_level)) {
    return apiError("Invalid risk_level", 400);
  }

  const validLegalBasis = ["legitimate_interest", "contract", "legal_obligation", "vital_interests", "public_task", "consent"];
  if (body.legal_basis && !validLegalBasis.includes(body.legal_basis)) {
    return apiError("Invalid legal_basis", 400);
  }

  const validRetentionCategories = ["audit_log", "security_log", "compliance_evidence", "operational_log"];
  if (body.retention_category && !validRetentionCategories.includes(body.retention_category)) {
    return apiError("Invalid retention_category", 400);
  }

  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  const requestId = crypto.randomUUID();

  const logEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor_id: admin.id,
    actor_email: session?.user?.email || null,
    actor_role: "admin",
    actor_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    actor_user_agent: request.headers.get("user-agent") || null,
    target_type: body.target_type,
    target_id: body.target_id,
    target_identifier: body.target_identifier || null,
    action: body.action,
    risk_level: body.risk_level || "medium",
    reason: body.reason || null,
    metadata: body.metadata || {},
    request_id: requestId,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    user_agent: request.headers.get("user-agent") || null,
    referer: request.headers.get("referer") || null,
    success: true,
    error_message: null,
    affected_resources: [body.target_id],
    legal_basis: body.legal_basis || "legitimate_interest",
    data_subject_ids: body.data_subject_ids || [],
    retention_category: body.retention_category || "audit_log",
    retention_days: body.retention_days || 2555,
    workspace_id: body.workspace_id || null,
    correlation_id: body.correlation_id || null,
    session_id: body.session_id || null,
  };

  const db = createServiceClient() as unknown as { from(t: string): any };

  const { error } = await db.from("admin_audit_logs").insert(logEntry);

  if (error) {
    return apiError("Failed to record audit log", 500);
  }

  serverLog({
    level: "info",
    event: "admin.audit_log.recorded",
    message: "Admin audit log entry recorded",
    details: {
      action: body.action,
      targetType: body.target_type,
      targetId: body.target_id,
      riskLevel: body.risk_level || "medium",
    },
  });

  return NextResponse.json({ ok: true, id: logEntry.id });
}