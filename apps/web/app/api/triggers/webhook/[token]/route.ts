import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { apiError, createServiceClient } from "@/lib/api";
import { getRuntimeUrl } from "@/lib/runtime-url";
import {
  buildRuntimeExecuteHeaders,
  formatRuntimeRejection,
  readRuntimeRejectionDetails,
  runtimeDispatchConfigError,
} from "@/lib/runtime-dispatch";
import { checkRunLimit, checkTriggerAccess } from "@/lib/limits";
import { getProcessingRestriction } from "@/lib/compliance";
import { enforcePublicEndpointRateLimit } from "@/lib/public-rate-limit";
import { readBoundedTextBody } from "@/lib/request-body";
import { markWebhookDelivery } from "@/lib/webhook-deliveries";
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  verifyWebhookSignature,
} from "@/lib/webhook-trigger-auth";
import { recordTriggerEvent } from "@/lib/trigger-events";
import { fireAgentTrigger } from "@/lib/agents/dispatch";
import {
  credentialScopeId,
  isAnySecurityLocked,
  isSecurityLocked,
  recordSecurityEvent,
} from "@/lib/security/sentinel";

/**
 * POST /api/triggers/webhook/[token]
 *
 * Public endpoint — no auth required (secured by the opaque token in the URL).
 * Receives an inbound webhook, looks up the trigger, creates a run, dispatches
 * to the Python runtime.
 */
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ token: string }> }
) {
  const limited = await enforcePublicEndpointRateLimit(request, "custom-webhook");
  if (limited) return limited;

  const params = await routeParams;
  const { token } = params;
  // Sentinel containment: a token under an active security lock (e.g. after a
  // burst of forged signatures) is rejected before any work happens. The scope
  // id is a hash — the raw token never reaches the security tables.
  const tokenScopeId = credentialScopeId(token);
  if (await isSecurityLocked("webhook_token", tokenScopeId)) {
    return apiError("Not found", 404);
  }
  const boundedBody = await readBoundedTextBody(request);
  if (!boundedBody.ok) return boundedBody.response;
  const rawBody = boundedBody.text;
  const signature = request.headers.get(WEBHOOK_SIGNATURE_HEADER);
  const timestamp = request.headers.get(WEBHOOK_TIMESTAMP_HEADER);

  if (!signature || !timestamp) {
    await recordSecurityEvent({
      event: "webhook.signature_failed",
      severity: "warning",
      scopeType: "webhook_token",
      scopeId: tokenScopeId,
      details: { reason: "missing_signature_headers" },
    });
    return apiError("Not found", 404);
  }

  try {
    if (
      !verifyWebhookSignature({
        body: rawBody,
        webhookToken: token,
        signature,
        timestamp,
      })
    ) {
      await recordSecurityEvent({
        event: "webhook.signature_failed",
        severity: "warning",
        scopeType: "webhook_token",
        scopeId: tokenScopeId,
        details: { reason: "invalid_signature" },
      });
      return apiError("Not found", 404);
    }
  } catch {
    return apiError("Webhook signing misconfigured", 500);
  }

  const deliveryId = createHash("sha256")
    .update(`${token}:${timestamp}:${signature}`)
    .digest("hex");
  try {
    const firstDelivery = await markWebhookDelivery("custom-webhook", deliveryId);
    if (!firstDelivery) {
      return NextResponse.json({ ok: true, accepted: true, duplicate: true });
    }
  } catch {
    return apiError("Failed to record webhook delivery", 500);
  }

  const db = createServiceClient();

  // Look up trigger by webhook_token
  type TriggerRow = {
    id: string;
    program_id: string;
    is_active: boolean;
  };

  const { data: triggerRaw, error: triggerError } = await db
    .from("triggers")
    .select("id, program_id, is_active")
    .eq("webhook_token", token)
    .eq("type", "webhook")
    .single();

  if (triggerError || !triggerRaw) {
    // Return generic 404 — don't reveal whether token exists
    return apiError("Not found", 404);
  }

  const trigger = triggerRaw as unknown as TriggerRow;

  if (!trigger.is_active) {
    return apiError("Trigger is disabled", 409);
  }

  // Parse incoming payload (optional body)
  let payload: Record<string, unknown> = {};
  try {
    if (rawBody) payload = JSON.parse(rawBody);
  } catch {
    // Ignore parse errors — payload is best-effort
  }

  // Fetch program to get schema + user_id
  type ProgramRow = {
    id: string;
    schema: unknown;
    user_id: string;
    workspace_id: string;
    execution_mode: string;
    program_type: string | null;
    name: string;
    description: string | null;
  };

  const { data: programRaw, error: programError } = await db
    .from("programs")
    .select("id, schema, user_id, workspace_id, execution_mode, program_type, name, description")
    .eq("id", trigger.program_id)
    .single();

  if (programError || !programRaw) return apiError("Program not found", 404);

  const program = programRaw as unknown as ProgramRow;

  // Sentinel containment: a program (or its owner) under a security lock —
  // applied automatically after repeated anomalies, or manually by an admin —
  // must not execute, no matter how the run was triggered.
  if (
    await isAnySecurityLocked([
      { scopeType: "program", scopeId: program.id },
      { scopeType: "user", scopeId: program.user_id },
    ])
  ) {
    return NextResponse.json(
      { error: "SECURITY_LOCKED", message: "This program is temporarily locked for security review." },
      { status: 423 }
    );
  }

  const restriction = await getProcessingRestriction(program.user_id, db);
  if (restriction.restricted) {
    return NextResponse.json(
      {
        error: "PROCESSING_RESTRICTED",
        message: "Processing is restricted for this account while a GDPR restriction request is open.",
        restricted_at: restriction.restrictedAt,
      },
      { status: 423 }
    );
  }

  // Check webhook trigger access (requires Plus or higher)
  const triggerCheck = await checkTriggerAccess(program.user_id, "webhook", program.workspace_id);
  if (!triggerCheck.allowed) {
    return NextResponse.json(
      { error: "FEATURE_NOT_AVAILABLE", message: triggerCheck.upgradeMessage },
      { status: 403 }
    );
  }

  // Check monthly run limit
  const runLimitCheck = await checkRunLimit(program.user_id, program.workspace_id);
  if (!runLimitCheck.allowed) {
    return NextResponse.json({ error: "Run limit reached for this account" }, { status: 429 });
  }

  // Standing agent: each fire spawns a fresh one-time agent (clone + reason from
  // scratch + prior-run memory) rather than replaying a fixed graph.
  if (program.program_type === "agent") {
    const fired = await fireAgentTrigger(
      db as Parameters<typeof fireAgentTrigger>[0],
      program,
      "agent_webhook",
      { trigger_id: trigger.id, webhook_payload: payload }
    );
    await db
      .from("triggers")
      .update({ last_fired_at: new Date().toISOString() } as never)
      .eq("id", trigger.id);
    if (!fired.ok) {
      recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, source: "webhook", status: "failed", message: fired.error });
      return NextResponse.json({ error: fired.error }, { status: fired.status });
    }
    recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId: fired.runId, source: "webhook", status: "dispatched", payload: Object.keys(payload).length > 0 ? payload : undefined });
    return NextResponse.json({ run_id: fired.runId, status: "running" }, { status: 202 });
  }

  // Check conflict policy before creating run
  const conflictResult = await _checkAndAcquireSlot(db, program, "webhook");
  if (!conflictResult.allowed) {
    return NextResponse.json(
      { error: "Conflict: " + conflictResult.reason },
      { status: 409 }
    );
  }

  // Create run
  const { data: runRaw, error: runError } = await db
    .from("runs")
    .insert({
      program_id: trigger.program_id,
      triggered_by: "webhook",
      trigger_payload: { trigger_id: trigger.id, webhook_payload: payload },
      status: "running",
      started_at: new Date().toISOString(),
      execution_mode: program.execution_mode,
    } as never)
    .select("id")
    .single();

  if (runError || !runRaw) return apiError("Failed to create run", 500);

  const run = runRaw as unknown as { id: string };

  // Update trigger last_fired_at
  await db
    .from("triggers")
    .update({ last_fired_at: new Date().toISOString() } as never)
    .eq("id", trigger.id);

  // Fetch connection name→id map for this program
  const { data: linkedConnsRaw } = await db
    .from("program_connections")
    .select("connection_id, connections(id, name, provider)")
    .eq("program_id", trigger.program_id);

  const connectionNameToId: Record<string, string> = {};
  for (const row of (linkedConnsRaw ?? []) as Array<{
    connection_id: string;
    connections: { id: string; name: string; provider: string } | null;
  }>) {
    if (row.connections) {
      connectionNameToId[row.connections.name] = row.connections.id;
      connectionNameToId[`${row.connections.provider}:primary`] = row.connections.id;
    }
  }

  // Dispatch to runtime
  const runtimeUrl = getRuntimeUrl();
  const triggerPayload = { trigger_id: trigger.id, webhook_payload: payload };

  try {
    const runtimeBody = JSON.stringify({
      run_id: run.id,
      program_id: trigger.program_id,
      user_id: program.user_id,
      schema: program.schema,
      triggered_by: "webhook",
      trigger_payload: triggerPayload,
      connections: connectionNameToId,
    });
    const runtimeHeaders = buildRuntimeExecuteHeaders(runtimeBody);
    const runtimeRes = await fetch(`${runtimeUrl}/execute`, {
      method: "POST",
      headers: runtimeHeaders,
      body: runtimeBody,
      cache: "no-store",
    });
    if (!runtimeRes.ok) {
      const runtimeError = await readRuntimeRejectionDetails(runtimeRes);
      await db
        .from("runs")
        .update({ status: "failed", error_message: formatRuntimeRejection(runtimeError), completed_at: new Date().toISOString() } as never)
        .eq("id", run.id);
      return NextResponse.json(
        {
          error: "Runtime failed to accept the run",
          runtime_status: runtimeError.status,
          message: runtimeError.detail,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    const configError = runtimeDispatchConfigError(error);
    if (configError) {
      await db
        .from("runs")
        .update({ status: "failed", error_message: "Runtime auth is not configured.", completed_at: new Date().toISOString() } as never)
        .eq("id", run.id);
      return configError;
    }
    await db
      .from("runs")
      .update({ status: "failed", error_message: "Runtime is unreachable", completed_at: new Date().toISOString() } as never)
      .eq("id", run.id);
    return NextResponse.json({ error: "Runtime is unreachable" }, { status: 503 });
  }

  recordTriggerEvent({ triggerId: trigger.id, programId: trigger.program_id, runId: run.id, source: "webhook", status: "dispatched", payload: Object.keys(payload).length > 0 ? payload : undefined });
  return NextResponse.json({ run_id: run.id, status: "running" }, { status: 202 });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _checkAndAcquireSlot(
  db: ReturnType<typeof createServiceClient>,
  program: { id: string; execution_mode: string },
  triggeredBy: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Check if there's already a running instance
  const { data: running } = await db
    .from("runs")
    .select("id")
    .eq("program_id", program.id)
    .in("status", ["running", "paused"])
    .limit(1);

  if (!running || running.length === 0) return { allowed: true };

  // There is already a running instance — fetch conflict_policy
  const { data: prog } = await db
    .from("programs")
    .select("conflict_policy")
    .eq("id", program.id)
    .single();

  const policy = (prog as { conflict_policy?: string } | null)?.conflict_policy ?? "queue";

  if (policy === "skip") {
    return { allowed: false, reason: "skip policy: another run is active" };
  }
  if (policy === "fail") {
    return { allowed: false, reason: "fail policy: another run is active" };
  }

  // queue: allowed (runtime handles ordering via the queue)
  return { allowed: true };
}
