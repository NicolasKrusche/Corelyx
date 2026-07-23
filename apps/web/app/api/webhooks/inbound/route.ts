import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
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
import { markWebhookDelivery, releaseWebhookDelivery } from "@/lib/webhook-deliveries";
import { recordTriggerEvent } from "@/lib/trigger-events";
import { fireAgentTrigger } from "@/lib/agents/dispatch";
import {
  isAnySecurityLocked,
  isSecurityLocked,
  recordSecurityEvent,
  credentialScopeId,
} from "@/lib/security/sentinel";

/**
 * POST /api/webhooks/inbound
 *
 * Generic inbound webhook endpoint. Unlike the trigger-specific
 * /api/triggers/webhook/[token] route, this endpoint accepts webhooks
 * from any configured source and routes them to the appropriate program.
 *
 * Authentication: HMAC-SHA256 signature verification using the webhook
 * endpoint's stored signing secret. The signature and timestamp headers
 * are configurable per-endpoint (supports common patterns from GitHub,
 * Stripe, Slack, and custom services).
 *
 * Request headers:
 *   x-webhook-signature (or configurable header): HMAC signature
 *   x-webhook-timestamp (or configurable header): Unix timestamp
 *
 * Query parameters:
 *   endpoint_id: The webhook endpoint ID (UUID) to route to
 *   connection_id: Optional explicit connection ID to filter by
 */

// Configurable header names (env overrides for flexibility)
const SIGNATURE_HEADER =
  process.env.INBOUND_WEBHOOK_SIGNATURE_HEADER || "x-webhook-signature";
const TIMESTAMP_HEADER =
  process.env.INBOUND_WEBHOOK_TIMESTAMP_HEADER || "x-webhook-timestamp";
const SIGNATURE_WINDOW_SECONDS = 300;

type WebhookEndpointRow = {
  id: string;
  trigger_id: string;
  program_id: string;
  user_id: string;
  workspace_id: string;
  signing_secret: string;
  signature_header: string | null;
  timestamp_header: string | null;
  signature_prefix: string | null;
  allowed_methods: string[] | null;
  is_active: boolean;
};

type ProgramRow = {
  id: string;
  schema: unknown;
  user_id: string;
  workspace_id: string;
  execution_mode: string;
  program_type: string | null;
  name: string;
  description: string | null;
  conflict_policy: string | null;
  is_active: boolean;
};

export async function POST(request: Request) {
  const limited = await enforcePublicEndpointRateLimit(request, "inbound-webhook");
  if (limited) return limited;

  // Rate-limited body read
  const boundedBody = await readBoundedTextBody(request);
  if (!boundedBody.ok) return boundedBody.response;
  const rawBody = boundedBody.text;

  // Parse endpoint_id from query string
  const url = new URL(request.url);
  const endpointId = url.searchParams.get("endpoint_id");
  if (!endpointId) {
    return apiError("Missing endpoint_id query parameter", 400);
  }

  // Sentinel containment: endpoint under an active security lock is rejected
  const endpointScopeId = credentialScopeId(endpointId);
  if (await isSecurityLocked("webhook_token" as any, endpointScopeId)) {
    return apiError("Not found", 404);
  }

  const db = createServiceClient();

  // Look up the webhook endpoint configuration
  type EndpointConfigRow = {
    id: string;
    trigger_id: string;
    program_id: string;
    user_id: string;
    workspace_id: string;
    signing_secret: string;
    signature_header: string | null;
    timestamp_header: string | null;
    signature_prefix: string | null;
    allowed_methods: string[] | null;
    is_active: boolean;
  };

  const { data: endpointRaw, error: endpointError } = await db
    .from("webhook_endpoints")
    .select(
      "id, trigger_id, program_id, user_id, workspace_id, signing_secret, signature_header, timestamp_header, signature_prefix, allowed_methods, is_active"
    )
    .eq("id", endpointId)
    .single();

  if (endpointError || !endpointRaw) {
    return apiError("Not found", 404);
  }

  const endpoint = endpointRaw as unknown as EndpointConfigRow;

  if (!endpoint.is_active) {
    return apiError("Webhook endpoint is disabled", 409);
  }

  // Check HTTP method allowlist
  const method = request.method.toUpperCase();
  if (
    endpoint.allowed_methods &&
    endpoint.allowed_methods.length > 0 &&
    !endpoint.allowed_methods.includes(method)
  ) {
    return apiError(`Method ${method} not allowed for this endpoint`, 405);
  }

  // Verify HMAC signature
  const sigHeader = endpoint.signature_header || SIGNATURE_HEADER;
  const tsHeader = endpoint.timestamp_header || TIMESTAMP_HEADER;
  const sigPrefix = endpoint.signature_prefix || "";

  const receivedSignature = request.headers.get(sigHeader);
  const receivedTimestamp = request.headers.get(tsHeader);

  if (!receivedSignature || !receivedTimestamp) {
    await recordSecurityEvent({
      event: "webhook.signature_failed",
      severity: "warning",
      scopeType: "webhook_token" as any,
      scopeId: endpointScopeId,
      details: { reason: "missing_signature_headers" },
    });
    return apiError("Not found", 404);
  }

  if (
    !verifyInboundSignature({
      body: rawBody,
      signingSecret: endpoint.signing_secret,
      signature: receivedSignature,
      timestamp: receivedTimestamp,
      signaturePrefix: sigPrefix,
    })
  ) {
    await recordSecurityEvent({
      event: "webhook.signature_failed",
      severity: "warning",
      scopeType: "webhook_token" as any,
      scopeId: endpointScopeId,
      details: { reason: "invalid_signature" },
    });
    return apiError("Not found", 404);
  }

  // Deduplicate deliveries
  const deliveryId = createHmac("sha256", endpoint.signing_secret)
    .update(`${endpointId}:${receivedTimestamp}:${receivedSignature}`)
    .digest("hex");

  try {
    const firstDelivery = await markWebhookDelivery("inbound-webhook", deliveryId);
    if (!firstDelivery) {
      return NextResponse.json({ ok: true, accepted: true, duplicate: true });
    }
  } catch {
    return apiError("Failed to record webhook delivery", 500);
  }

  // Parse incoming payload
  let payload: Record<string, unknown> = {};
  try {
    if (rawBody) payload = JSON.parse(rawBody);
  } catch {
    // Non-JSON bodies are accepted — payload remains empty
  }

  // Collect webhook metadata for the runtime
  const headerRecord: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headerRecord[key] = value;
  });
  const webhookMeta: Record<string, unknown> = {
    method,
    headers: headerRecord,
    query_params: Object.fromEntries(url.searchParams.entries()),
    source: "inbound-webhook",
    endpoint_id: endpointId,
    timestamp: new Date().toISOString(),
  };

  // Look up the trigger
  const { data: triggerRaw, error: triggerError } = await db
    .from("triggers")
    .select("id, program_id, is_active")
    .eq("id", endpoint.trigger_id)
    .single();

  if (triggerError || !triggerRaw) {
    return apiError("Trigger not found", 404);
  }

  const trigger = triggerRaw as { id: string; program_id: string; is_active: boolean };
  if (!trigger.is_active) {
    return apiError("Trigger is disabled", 409);
  }

  // Fetch program
  const { data: programRaw, error: programError } = await db
    .from("programs")
    .select(
      "id, schema, user_id, workspace_id, execution_mode, program_type, name, description, conflict_policy, is_active"
    )
    .eq("id", endpoint.program_id)
    .single();

  if (programError || !programRaw) {
    return apiError("Program not found", 404);
  }

  const program = programRaw as unknown as ProgramRow;

  if (!program.is_active) {
    return apiError("Program is disabled", 409);
  }

  // Sentinel containment
  if (
    await isAnySecurityLocked([
      { scopeType: "program", scopeId: program.id },
      { scopeType: "user", scopeId: program.user_id },
    ])
  ) {
    return NextResponse.json(
      {
        error: "SECURITY_LOCKED",
        message: "This program is temporarily locked for security review.",
      },
      { status: 423 }
    );
  }

  // Compliance check
  const restriction = await getProcessingRestriction(program.user_id, db);
  if (restriction.restricted) {
    return NextResponse.json(
      {
        error: "PROCESSING_RESTRICTED",
        message:
          "Processing is restricted for this account while a GDPR restriction request is open.",
        restricted_at: restriction.restrictedAt,
      },
      { status: 423 }
    );
  }

  // Trigger access check (requires Plus or higher)
  const triggerCheck = await checkTriggerAccess(
    program.user_id,
    "webhook",
    program.workspace_id
  );
  if (!triggerCheck.allowed) {
    return NextResponse.json(
      { error: "FEATURE_NOT_AVAILABLE", message: triggerCheck.upgradeMessage },
      { status: 403 }
    );
  }

  // Run limit check
  const runLimitCheck = await checkRunLimit(program.user_id, program.workspace_id);
  if (!runLimitCheck.allowed) {
    return NextResponse.json(
      { error: "Run limit reached for this account" },
      { status: 429 }
    );
  }

  // Agent trigger: spawn a fresh one-time agent
  if (program.program_type === "agent") {
    const fired = await fireAgentTrigger(
      db as Parameters<typeof fireAgentTrigger>[0],
      program,
      "agent_webhook",
      { trigger_id: trigger.id, webhook_payload: payload, webhook_meta: webhookMeta }
    );
    if (!fired.ok) {
      if (fired.status >= 500) await releaseWebhookDelivery("inbound-webhook", deliveryId);
      await recordTriggerEvent({
        triggerId: trigger.id,
        programId: trigger.program_id,
        source: "inbound-webhook",
        status: "failed",
        message: fired.error,
      });
      return NextResponse.json({ error: fired.error }, { status: fired.status });
    }
    await db
      .from("triggers")
      .update({ last_fired_at: new Date().toISOString() } as never)
      .eq("id", trigger.id);
    await recordTriggerEvent({
      triggerId: trigger.id,
      programId: trigger.program_id,
      runId: fired.runId,
      source: "inbound-webhook",
      status: "dispatched",
      payload: Object.keys(payload).length > 0 ? payload : undefined,
    });
    return NextResponse.json({ run_id: fired.runId, status: "running" }, { status: 202 });
  }

  // Conflict slot check for workflows
  const conflictResult = await _checkAndAcquireSlot(db, program, "inbound-webhook");
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
      triggered_by: "inbound-webhook",
      trigger_payload: {
        trigger_id: trigger.id,
        webhook_payload: payload,
        webhook_meta: webhookMeta,
      },
      status: "running",
      started_at: new Date().toISOString(),
      execution_mode: program.execution_mode,
    } as never)
    .select("id")
    .single();

  if (runError || !runRaw) {
    await releaseWebhookDelivery("inbound-webhook", deliveryId);
    await recordTriggerEvent({
      triggerId: trigger.id,
      programId: trigger.program_id,
      source: "inbound-webhook",
      status: "failed",
      message: "Run row could not be created",
    });
    return apiError("Failed to create run", 500);
  }

  const run = runRaw as unknown as { id: string };

  // Update trigger
  await db
    .from("triggers")
    .update({ last_fired_at: new Date().toISOString() } as never)
    .eq("id", trigger.id);

  // Fetch connection name→id map
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
  const triggerPayload = {
    trigger_id: trigger.id,
    webhook_payload: payload,
    webhook_meta: webhookMeta,
  };

  try {
    const runtimeBody = JSON.stringify({
      run_id: run.id,
      program_id: trigger.program_id,
      user_id: program.user_id,
      schema: program.schema,
      triggered_by: "inbound-webhook",
      trigger_payload: triggerPayload,
      connections: connectionNameToId,
    });
    const runtimeHeaders = buildRuntimeExecuteHeaders(runtimeBody);
    const runtimeRes = await fetch(`${runtimeUrl}/execute`, {
      method: "POST",
      headers: runtimeHeaders,
      body: runtimeBody,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!runtimeRes.ok) {
      const runtimeError = await readRuntimeRejectionDetails(runtimeRes);
      await db
        .from("runs")
        .update({
          status: "failed",
          error_message: formatRuntimeRejection(runtimeError),
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", run.id);
      await releaseWebhookDelivery("inbound-webhook", deliveryId);
      await recordTriggerEvent({
        triggerId: trigger.id,
        programId: trigger.program_id,
        runId: run.id,
        source: "inbound-webhook",
        status: "failed",
        message: formatRuntimeRejection(runtimeError),
      });
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
    await releaseWebhookDelivery("inbound-webhook", deliveryId);
    const configError = runtimeDispatchConfigError(error);
    if (configError) {
      await db
        .from("runs")
        .update({
          status: "failed",
          error_message: "Runtime auth is not configured.",
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", run.id);
      await recordTriggerEvent({
        triggerId: trigger.id,
        programId: trigger.program_id,
        runId: run.id,
        source: "inbound-webhook",
        status: "failed",
        message: "Runtime auth is not configured.",
      });
      return configError;
    }
    await db
      .from("runs")
      .update({
        status: "failed",
        error_message: "Runtime is unreachable",
        completed_at: new Date().toISOString(),
      } as never)
      .eq("id", run.id);
    await recordTriggerEvent({
      triggerId: trigger.id,
      programId: trigger.program_id,
      runId: run.id,
      source: "inbound-webhook",
      status: "failed",
      message: "Runtime is unreachable",
    });
    return NextResponse.json({ error: "Runtime is unreachable" }, { status: 503 });
  }

  await recordTriggerEvent({
    triggerId: trigger.id,
    programId: trigger.program_id,
    runId: run.id,
    source: "inbound-webhook",
    status: "dispatched",
    payload: Object.keys(payload).length > 0 ? payload : undefined,
  });

  return NextResponse.json({ run_id: run.id, status: "running" }, { status: 202 });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function verifyInboundSignature(input: {
  body: string;
  signingSecret: string;
  signature: string;
  timestamp: string;
  signaturePrefix: string;
}): boolean {
  const { body, signingSecret, signature, timestamp, signaturePrefix } = input;

  // Build signing input: timestamp.body
  const signingInput = `${timestamp}.${body}`;
  const expectedDigest = createHmac("sha256", signingSecret)
    .update(signingInput)
    .digest("hex");

  // Strip prefix from received signature if present
  let receivedSignature = signature;
  if (signaturePrefix && receivedSignature.startsWith(signaturePrefix)) {
    receivedSignature = receivedSignature.slice(signaturePrefix.length);
  }

  const expectedBuf = Buffer.from(expectedDigest);
  const receivedBuf = Buffer.from(receivedSignature);
  if (expectedBuf.length !== receivedBuf.length) return false;

  if (!timingSafeEqual(expectedBuf, receivedBuf)) return false;

  // Timestamp freshness check
  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsedTimestamp) > SIGNATURE_WINDOW_SECONDS) {
    return false;
  }

  return true;
}

async function _checkAndAcquireSlot(
  db: ReturnType<typeof createServiceClient>,
  program: { id: string; execution_mode: string; conflict_policy?: string | null },
  triggeredBy: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: running } = await db
    .from("runs")
    .select("id")
    .eq("program_id", program.id)
    .in("status", ["running", "paused"])
    .limit(1);

  if (!running || running.length === 0) return { allowed: true };

  const policy = program.conflict_policy ?? "queue";

  if (policy === "skip") {
    return { allowed: false, reason: "skip policy: another run is active" };
  }
  if (policy === "fail") {
    return { allowed: false, reason: "fail policy: another run is active" };
  }

  // queue: allowed
  return { allowed: true };
}
