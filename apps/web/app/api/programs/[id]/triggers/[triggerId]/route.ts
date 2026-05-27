import { NextResponse } from "next/server";
import { CronExpressionParser } from "cron-parser"; // fix: cron-parser v5 exports CronExpressionParser, not parseExpression
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import {
  enrichWebhookTriggerForClient,
  rotateWebhookToken,
} from "@/lib/webhook-trigger-auth";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";
import { serverLog } from "@/lib/server-log";

// ─── PATCH /api/programs/[id]/triggers/[triggerId] — toggle or update ────────

export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string; triggerId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("Only program editors can manage triggers.", 403);

  const body = await request.json().catch(() => ({}));

  const serviceClient = createServiceClient();
  const { data: existingTrigger, error: existingTriggerError } = await serviceClient
    .from("triggers")
    .select("id, type")
    .eq("id", params.triggerId)
    .eq("program_id", params.id)
    .single();

  if (existingTriggerError || !existingTrigger) {
    return apiError("Trigger not found", 404);
  }

  // fix: build update payload with only fields guaranteed to exist without migration 20240003
  const updates: Record<string, unknown> = {};
  const enrichedUpdates: Record<string, unknown> = {}; // fields that require phase4 migration

  if (typeof body.is_active === "boolean") {
    updates.is_active = body.is_active;
  }

  if (body.config && typeof body.config === "object") {
    updates.config = body.config;
    // Recompute next_run_at if cron expression changed
    const expr = (body.config as Record<string, unknown>).expression as string | undefined;
    if (expr) {
      try {
        const timezone = ((body.config as Record<string, unknown>).timezone as string) ?? "UTC";
        const interval = CronExpressionParser.parse(expr, { tz: timezone });
        enrichedUpdates.next_run_at = interval.next().toISOString();
      } catch {
        return apiError("Invalid cron expression", 400);
      }
    }
  }

  if (body.rotate_webhook_token === true) {
    if ((existingTrigger as { type: string }).type !== "webhook") {
      return apiError("Only webhook triggers support token rotation", 400);
    }
    enrichedUpdates.webhook_token = rotateWebhookToken();
  }

  // fix: attempt full update (with updated_at / next_run_at); on schema-cache failure, retry without enriched cols
  const BASE_COLS = "id, type, config, is_active, created_at";
  const ENRICHED_COLS =
    "id, type, config, is_active, webhook_token, next_run_at, last_fired_at, updated_at, created_at";

  const fullPayload = { ...updates, ...enrichedUpdates, updated_at: new Date().toISOString() };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const includeSigningSecret =
    body.rotate_webhook_token === true ||
    body.include_webhook_signing_secret === true;

  const enriched = await serviceClient
    .from("triggers")
    .update(fullPayload as never)
    .eq("id", params.triggerId)
    .eq("program_id", params.id)
    .select(ENRICHED_COLS)
    .single();

  const enrichedData = enriched.data as unknown as { type: string; webhook_token?: string | null } | null;
  if (!enriched.error && enrichedData) {
    return NextResponse.json({
      trigger: enrichWebhookTriggerForClient(
        enrichedData,
        appUrl,
        { includeSigningSecret }
      ),
    });
  }

  if (body.rotate_webhook_token === true) {
    const message =
      enriched.error?.message ?? "Webhook token rotation requires the enriched trigger columns";
    return apiError(message, 500);
  }

  const fallback = await serviceClient
    .from("triggers")
    .update(updates as never)
    .eq("id", params.triggerId)
    .eq("program_id", params.id)
    .select(BASE_COLS)
    .single();

  const fallbackData = fallback.data as unknown as { type: string; webhook_token?: string | null } | null;
  if (fallback.error || !fallbackData) {
    const msg = fallback.error?.message ?? enriched.error?.message ?? "Trigger not found or update failed";
    serverLog({ level: "error", event: "triggers.update.failed", message: "Trigger update or re-fetch failed." });
    return apiError(msg, 404);
  }

  return NextResponse.json({
    trigger: enrichWebhookTriggerForClient(
      fallbackData,
      appUrl,
      { includeSigningSecret }
    ),
  });
}

// ─── DELETE /api/programs/[id]/triggers/[triggerId] ───────────────────────────

export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string; triggerId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("Only program editors can delete triggers.", 403);

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("triggers")
    .delete()
    .eq("id", params.triggerId)
    .eq("program_id", params.id);

  if (error) return apiError(error.message, 500);

  return new Response(null, { status: 204 });
}
