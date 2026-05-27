import { NextResponse } from "next/server";
import { CronExpressionParser } from "cron-parser"; // fix: cron-parser v5 exports CronExpressionParser, not parseExpression
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { enrichWebhookTriggerForClient } from "@/lib/webhook-trigger-auth";
import { checkTriggerAccess } from "@/lib/limits";
import type { TriggerType } from "@/lib/entitlements";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";
import { serverLog } from "@/lib/server-log";

// ─── Types ────────────────────────────────────────────────────────────────────

// fix: optional fields may be absent if migration 20240003 (phase4) not yet applied
type TriggerRow = {
  id: string;
  program_id: string;
  type: string;
  config: Record<string, unknown>;
  is_active: boolean;
  webhook_token?: string | null;
  next_run_at?: string | null;
  last_fired_at?: string | null;
  created_at: string;
};

const BASE_TRIGGER_COLS = "id, program_id, type, config, is_active, created_at";
const ENRICHED_TRIGGER_COLS = "id, program_id, type, config, is_active, webhook_token, next_run_at, last_fired_at, created_at";

// ─── GET /api/programs/[id]/triggers ─────────────────────────────────────────

export async function GET(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const serviceClient = createServiceClient();

  // fix: fall back to base columns if phase4 migration not applied (webhook_token/next_run_at/last_fired_at)
  let data: unknown[] | null = null;
  {
    const enriched = await serviceClient
      .from("triggers")
      .select(ENRICHED_TRIGGER_COLS)
      .eq("program_id", params.id)
      .order("created_at", { ascending: false });
    if (!enriched.error) {
      data = enriched.data;
    } else {
      const fallback = await serviceClient
        .from("triggers")
        .select(BASE_TRIGGER_COLS)
        .eq("program_id", params.id)
        .order("created_at", { ascending: false });
      if (fallback.error) return apiError(fallback.error.message, 500);
      data = fallback.data;
    }
  }

  const triggers = (data ?? []) as unknown as TriggerRow[];
  const includeSigningSecret =
    new URL(request.url).searchParams.get("include_webhook_signing_secret") === "true";

  // Build webhook metadata server-side and only reveal the signing secret on opt-in reads.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const enriched = triggers.map((trigger) =>
    enrichWebhookTriggerForClient(trigger, appUrl, {
      includeSigningSecret,
    })
  );

  return NextResponse.json({ triggers: enriched });
}

// ─── POST /api/programs/[id]/triggers ────────────────────────────────────────

export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("Only program editors can manage triggers.", 403);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.type !== "string") {
    return apiError("Missing type", 400);
  }

  const { type, config = {} } = body as { type: string; config?: Record<string, unknown> };

  const validTypes = ["manual", "cron", "webhook", "event", "program"];
  if (!validTypes.includes(type)) {
    return apiError(`Invalid type. Must be one of: ${validTypes.join(", ")}`, 400);
  }

  // Check trigger type entitlement before creating
  const triggerAccessCheck = await checkTriggerAccess(user.id, type as TriggerType, access!.workspaceId);
  if (!triggerAccessCheck.allowed) {
    return NextResponse.json(
      { error: "FEATURE_NOT_AVAILABLE", message: triggerAccessCheck.upgradeMessage },
      { status: 403 }
    );
  }

  // Validate cron expression if provided
  let nextRunAt: string | null = null;
  if (type === "cron") {
    const expr = config.expression as string | undefined;
    if (!expr) return apiError("Cron trigger requires config.expression", 400);
    try {
      const timezone = (config.timezone as string) ?? "UTC";
      const interval = CronExpressionParser.parse(expr, { tz: timezone });
      nextRunAt = interval.next().toISOString();
    } catch {
      return apiError("Invalid cron expression", 400);
    }
  }

  if (type === "program" && !config.source_program_id) {
    return apiError("Program trigger requires config.source_program_id", 400);
  }

  const serviceClient = createServiceClient();

  // fix: only include next_run_at when set (cron) to avoid insert failures if column absent in envs missing migration 20240003
  const insertPayload: Record<string, unknown> = {
    program_id: params.id,
    type,
    config,
    is_active: true,
  };
  if (nextRunAt) insertPayload.next_run_at = nextRunAt;

  // fix: try enriched SELECT first; fall back to base columns if phase4 migration not applied; surface DB error for debugging
  let trigger: TriggerRow | null = null;
  {
    const enriched = await serviceClient
      .from("triggers")
      .insert(insertPayload as never)
      .select(ENRICHED_TRIGGER_COLS)
      .single();
    const enrichedData = enriched.data as unknown as TriggerRow | null;
    if (!enriched.error && enrichedData) {
      trigger = enrichedData;
    } else {
      // Retry with base columns — row may have already inserted on previous attempt? No: PostgREST INSERT+SELECT is one statement.
      const fallback = await serviceClient
        .from("triggers")
        .insert(insertPayload as never)
        .select(BASE_TRIGGER_COLS)
        .single();
      const fallbackData = fallback.data as unknown as TriggerRow | null;
      if (fallback.error || !fallbackData) {
        const msg = fallback.error?.message ?? enriched.error?.message ?? "unknown DB error";
        serverLog({ level: "error", event: "triggers.create.insert_failed", message: "Trigger insert failed." });
        return apiError(`Failed to create trigger: ${msg}`, 500);
      }
      trigger = fallbackData;
    }
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return NextResponse.json(
    {
      trigger: enrichWebhookTriggerForClient(trigger, appUrl, {
        includeSigningSecret: true,
      }),
    },
    { status: 201 }
  );
}
