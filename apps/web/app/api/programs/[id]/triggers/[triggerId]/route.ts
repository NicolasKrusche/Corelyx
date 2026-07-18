import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { nextFiveFieldCronRun } from "@/lib/cron-expression";
import {
  enrichWebhookTriggerForClient,
  rotateWebhookToken,
} from "@/lib/webhook-trigger-auth";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";
import { serverLog } from "@/lib/server-log";
import {
  schemaTriggerNodeId,
  withSchemaTriggerActiveState,
} from "@/lib/triggers/schema-trigger-state";

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
    .select("id, type, config, is_active")
    .eq("id", params.triggerId)
    .eq("program_id", params.id)
    .single();

  if (existingTriggerError || !existingTrigger) {
    return apiError("Trigger not found", 404);
  }

  const currentTrigger = existingTrigger as unknown as {
    id: string;
    type: string;
    config: Record<string, unknown> | null;
    is_active: boolean;
  };

  // Build an update payload with only fields guaranteed to exist without migration 20240003.
  const updates: Record<string, unknown> = {};
  const enrichedUpdates: Record<string, unknown> = {}; // fields that require phase4 migration

  if (typeof body.is_active === "boolean") {
    updates.is_active = body.is_active;
  }

  const requestedConfig =
    body.config && typeof body.config === "object" && !Array.isArray(body.config)
      ? body.config as Record<string, unknown>
      : null;
  const ownedNodeId = schemaTriggerNodeId(currentTrigger.config);
  const effectiveConfig: Record<string, unknown> = {
    ...(currentTrigger.config ?? {}),
    ...(requestedConfig ?? {}),
    ...(ownedNodeId ? { node_id: ownedNodeId } : {}),
  };
  if (requestedConfig) updates.config = effectiveConfig;

  // Same gap as trigger creation: a "program" trigger's source_program_id must
  // stay something this user can access — otherwise it can be silently
  // rewritten post-creation to chain off a program the user has no access to.
  if (currentTrigger.type === "program" && requestedConfig) {
    const sourceProgramId = effectiveConfig.source_program_id;
    if (!sourceProgramId || typeof sourceProgramId !== "string") {
      return apiError("Program trigger requires config.source_program_id", 400);
    }
    const sourceAccess = await getProgramAccess(sourceProgramId, user.id);
    if (!canView(sourceAccess)) {
      return apiError("source_program_id must refer to a program you have access to", 403);
    }
  }

  let nextRunAt: string | null | undefined;
  if (currentTrigger.type === "cron") {
    if (body.is_active === false) {
      nextRunAt = null;
    } else if (body.is_active === true || requestedConfig) {
      const expr = effectiveConfig.expression;
      if (typeof expr !== "string" || !expr.trim()) {
        return apiError("Cron trigger requires config.expression", 400);
      }
      const timezone =
        typeof effectiveConfig.timezone === "string" ? effectiveConfig.timezone : "UTC";
      nextRunAt = nextFiveFieldCronRun(expr, timezone);
      if (!nextRunAt) return apiError("Invalid five-field cron expression or timezone", 400);
    }
  }
  if (nextRunAt !== undefined) enrichedUpdates.next_run_at = nextRunAt;

  if (body.rotate_webhook_token === true) {
    if (currentTrigger.type !== "webhook") {
      return apiError("Only webhook triggers support token rotation", 400);
    }
    enrichedUpdates.webhook_token = rotateWebhookToken();
  }

  // A row created from a workflow trigger node is only a runtime projection;
  // the canonical active state lives in program.schema.triggers. Persist that
  // state first so a later schema reconciliation cannot undo Pause/Enable.
  if (typeof body.is_active === "boolean" && ownedNodeId) {
    const { data: programRaw, error: programError } = await serviceClient
      .from("programs")
      .select("schema, schema_version")
      .eq("id", params.id)
      .single();
    if (programError || !programRaw) {
      return apiError("Workflow changed while updating the schedule. Reload and try again.", 409);
    }

    const program = programRaw as unknown as { schema: unknown; schema_version: number | null };
    const changedAt = new Date().toISOString();
    const nextSchema = withSchemaTriggerActiveState(
      program.schema,
      ownedNodeId,
      body.is_active,
      nextRunAt ?? null,
      changedAt
    );
    if (!nextSchema) {
      return apiError("This schedule no longer matches a workflow trigger. Reload the editor and try again.", 409);
    }

    const currentVersion = program.schema_version ?? 0;
    let programUpdate = serviceClient
      .from("programs")
      .update({
        schema: nextSchema,
        schema_version: currentVersion + 1,
        updated_at: changedAt,
      } as never)
      .eq("id", params.id);
    programUpdate = program.schema_version === null
      ? programUpdate.is("schema_version", null)
      : programUpdate.eq("schema_version", program.schema_version);
    const { data: savedProgram, error: saveError } = await programUpdate
      .select("id")
      .single();
    if (saveError || !savedProgram) {
      return apiError("Workflow changed while updating the schedule. Reload and try again.", 409);
    }

    const { error: versionError } = await serviceClient.from("program_versions").insert({
      program_id: params.id,
      version: currentVersion + 1,
      schema: nextSchema,
      change_summary: body.is_active ? "Enabled schedule" : "Paused schedule",
    } as never);
    if (versionError) {
      serverLog({
        level: "warn",
        event: "triggers.schema_version_snapshot_failed",
        message: "Schedule state was saved, but its version snapshot failed.",
        details: { program_id: params.id },
      });
    }
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
  const { data: existingTrigger, error: lookupError } = await serviceClient
    .from("triggers")
    .select("id, config")
    .eq("id", params.triggerId)
    .eq("program_id", params.id)
    .single();
  if (lookupError || !existingTrigger) return apiError("Trigger not found", 404);

  if (schemaTriggerNodeId((existingTrigger as unknown as { config: unknown }).config)) {
    return apiError(
      "This schedule is part of the workflow. Remove its trigger node in the editor.",
      409,
      "SCHEMA_TRIGGER_REMOVE_IN_EDITOR"
    );
  }

  const { data: deleted, error } = await serviceClient
    .from("triggers")
    .delete()
    .eq("id", params.triggerId)
    .eq("program_id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!deleted) return apiError("Trigger not found", 404);

  return new Response(null, { status: 204 });
}
