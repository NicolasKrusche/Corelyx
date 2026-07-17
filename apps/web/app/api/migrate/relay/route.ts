import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 300;

import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import { checkProgramLimit } from "@/lib/limits";
import { serverLog } from "@/lib/server-log";
import { rateLimit } from "@/lib/rate-limit";
import { canContributeToWorkspace, getActiveWorkspace } from "@/lib/workspaces";
import { buildGenesisSystemPrompt } from "@/lib/genesis/prompt";
import { getDraftValidationMessage } from "@/lib/workflow/normalize";
import { createRepairModelCaller } from "@/lib/genesis/semantic-repair";
import { GENESIS_MAX_TOKENS, PLATFORM_DEFAULT_MODEL, isRetryableModelError } from "@/lib/genesis/request";
import { PseudonymizationSession } from "@/lib/privacy/pii";
import {
  syncCronTriggers,
  syncEventTriggers,
  syncFileWatchTriggers,
  syncWebhookTriggers,
} from "@/lib/triggers/event-trigger-sync";
import {
  buildRelayConversionAddendum,
  buildRelayConversionUserMessage,
  buildRelayRepairUserMessage,
} from "@/lib/migrate/relay/prompt";
import {
  finalizeConvertedSchema,
  parseConvertedSchema,
  RelayConversionError,
} from "@/lib/migrate/relay/finalize";
import { extractRelayWorkflowPreview } from "@/lib/migrate/relay/extract";
import { CORELYX_PROVIDER_SLUGS, resolveRelayApp, summarizeCoverage } from "@/lib/migrate/relay/mapping";

// One workflow per call: the client fans out over a workspace's workflows with
// small concurrency and renders per-workflow progress. Keeps each request short
// (one LLM call + one optional repair) and avoids a single giant slow request.
const MigrateRelayBodyZ = z.object({
  name: z.string().max(200).optional(),
  // Relay's "Copy build prompt" / prompt.md content — the authoritative source.
  prompt_md: z.string().max(60_000).optional(),
  // Relay's exported workflow JSON — a string or already-parsed value.
  workflow_json: z.unknown().optional(),
  // Detected connector providers (from the client-side preview) to load the
  // right operation catalogs into the prompt. Server re-derives if absent.
  providers: z.array(z.string().max(60)).max(60).optional(),
});

const MAX_JSON_CHARS = 400_000;

type ConnectionRow = { id: string; name: string; provider: string; scopes: string[] | null };

function getSchemaConnectionNames(schema: ProgramSchema): string[] {
  const names = new Set<string>();
  for (const node of schema.nodes) {
    if (!node.connection) continue;
    const trimmed = node.connection.trim();
    if (trimmed) names.add(trimmed);
  }
  return [...names];
}

function mapExecutionMode(mode: ProgramSchema["execution_mode"]): "autonomous" | "supervised" | "manual" {
  return mode === "approval_required" ? "supervised" : mode;
}

function countManualSetupNotes(schema: ProgramSchema): number {
  return schema.nodes.filter(
    (n) => n.type === "note" && typeof (n.config as { content?: string }).content === "string" &&
      (n.config as { content: string }).content.toLowerCase().startsWith("relay step needs manual setup")
  ).length;
}

// POST /api/migrate/relay — convert one Relay workflow into an inactive Corelyx
// draft. Deliberately does NOT consume a Genesis use: migration is a loss-leader
// (~$0.01/workflow) and metering it would wall a 20-workflow migrant at their
// free-tier use cap. LLM usage is still recorded for cost tracking.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const userId = user.id;

  const body = await request.json().catch(() => null);
  const parsed = MigrateRelayBodyZ.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { name, prompt_md, workflow_json } = parsed.data;
  const buildPrompt = prompt_md?.trim() || null;
  const hasJson = workflow_json !== undefined && workflow_json !== null && workflow_json !== "";
  if (!buildPrompt && !hasJson) {
    return apiError("Provide the workflow's build prompt, its JSON, or both.", 400);
  }

  // Guard payload size (run data should be stripped client-side; this is a backstop).
  if (hasJson) {
    let jsonSize = 0;
    try {
      jsonSize = typeof workflow_json === "string" ? workflow_json.length : JSON.stringify(workflow_json).length;
    } catch {
      return apiError("Workflow JSON could not be read.", 400);
    }
    if (jsonSize > MAX_JSON_CHARS) {
      return apiError("This workflow's JSON is too large. Export and import it without run history.", 413);
    }
  }

  const ws = await getActiveWorkspace(userId);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) {
    return apiError("Viewers cannot import workflows.", 403);
  }
  const workspaceId = ws.workspaceId;

  // Bursty by nature (a whole workspace at once) but still one LLM call each.
  const rateOk = await rateLimit(`migrate:${userId}`, 40, 60_000);
  if (!rateOk) return apiError("Too many imports at once. Please wait a moment and continue.", 429);

  // Respect the plan's program cap. The client marks a 403 as "skipped — plan
  // limit" rather than a hard failure, so the rest of a batch still imports.
  const limitCheck = await checkProgramLimit(userId, workspaceId);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: "PROGRAM_LIMIT_REACHED", message: limitCheck.upgradeMessage },
      { status: 403 }
    );
  }

  const platformKey = process.env.PLATFORM_OPENROUTER_API_KEY ?? "";
  if (!platformKey) return apiError("Migration AI is not available right now.", 503);

  // Resolve providers to load into the prompt: validated client hints, else
  // re-derive from the source material.
  let providers = (parsed.data.providers ?? []).filter((p) => CORELYX_PROVIDER_SLUGS.has(p));
  const preview = extractRelayWorkflowPreview(
    hasJson ? workflow_json : {},
    name
  );
  if (providers.length === 0) providers = preview.providers;
  // Coverage of the source apps, for the report card.
  const coverage = summarizeCoverage(
    preview.apps.map((a) => a.resolution)
  );
  // Fold any providers only visible in the build prompt text into the prompt scope.
  if (buildPrompt) {
    for (const token of buildPrompt.split(/[^a-zA-Z0-9]+/)) {
      const res = resolveRelayApp(token);
      if (res?.status === "connector" && !providers.includes(res.provider)) providers.push(res.provider);
    }
  }
  providers = [...new Set(providers)].slice(0, 40);

  const model = process.env.RELAY_MIGRATE_MODEL || PLATFORM_DEFAULT_MODEL;
  const systemPrompt = buildGenesisSystemPrompt(providers.length > 0 ? providers : null, null, null, {})
    + buildRelayConversionAddendum();

  // One reversible PII session: the model only ever sees placeholders; the
  // converted schema is rehydrated before we persist it.
  const piiSession = new PseudonymizationSession();
  const callModel = createRepairModelCaller(
    { provider: "openrouter", apiKey: platformKey, model, billing: "platform", userId, workspaceId },
    GENESIS_MAX_TOKENS
  );
  const callWithRetry = async (userMessage: string): Promise<string> => {
    try {
      return await callModel(userMessage, systemPrompt);
    } catch (err) {
      if (isRetryableModelError(err)) return callModel(userMessage, systemPrompt);
      throw err;
    }
  };

  const startedAt = Date.now();
  let modelText = "";
  try {
    const userMessage = piiSession.sanitizeText(
      buildRelayConversionUserMessage({ name, buildPrompt, workflowJson: hasJson ? workflow_json : undefined })
    ).value;
    modelText = await callWithRetry(userMessage);

    let parsedSchema = piiSession.rehydrateValue(parseConvertedSchema(modelText));
    let finalized = finalizeConvertedSchema(parsedSchema, { fallbackName: name });

    // One self-repair round: hand the model its own output + the concrete
    // validation error and ask for a corrected full schema.
    if (!finalized.draftValid && finalized.draftError) {
      const errorMessage = getDraftValidationMessage(finalized.draftError);
      const repairMessage = piiSession.sanitizeText(
        buildRelayRepairUserMessage(modelText, errorMessage)
      ).value;
      try {
        const repairText = await callWithRetry(repairMessage);
        parsedSchema = piiSession.rehydrateValue(parseConvertedSchema(repairText));
        finalized = finalizeConvertedSchema(parsedSchema, { fallbackName: name });
      } catch {
        // Keep the first attempt's error for the response below.
      }
    }

    if (!finalized.draftValid) {
      serverLog({
        level: "warn",
        event: "migrate.relay.invalid_after_repair",
        message: "Relay conversion did not validate after one repair round.",
        details: {
          error: finalized.draftError ? getDraftValidationMessage(finalized.draftError) : "unknown",
          providers: providers.join(","),
        },
      });
      return NextResponse.json(
        {
          error: "CONVERSION_INVALID",
          message: "We couldn't turn this workflow into a valid Corelyx program automatically. Try importing its build prompt on its own, or rebuild it in Genesis.",
        },
        { status: 422 }
      );
    }

    const schema = finalized.schema;
    schema.metadata.is_active = false; // belt-and-suspenders: never auto-activate a migration
    schema.metadata.genesis_model = model;
    const now = new Date().toISOString();
    schema.updated_at = now;
    const finalName = (name?.trim() || schema.program_name || "Imported from Relay").slice(0, 120);
    schema.program_name = finalName;

    // Match connection nodes to existing workspace connections by name (a fresh
    // migrant has none yet — everything falls into missing_connection_names,
    // which drives the "reconnect your apps" checklist).
    const referencedConnectionNames = getSchemaConnectionNames(schema);
    let matchedConnections: ConnectionRow[] = [];
    if (referencedConnectionNames.length > 0) {
      const { data: connectionsRaw, error: connError } = await supabase
        .from("connections")
        .select("id, name, provider, scopes")
        .eq("workspace_id", workspaceId)
        .in("name", referencedConnectionNames);
      if (connError) return apiError(connError.message, 500);
      matchedConnections = (connectionsRaw ?? []) as unknown as ConnectionRow[];
    }

    const validation = validatePostGenesis(schema, matchedConnections);
    const serviceClient = createServiceClient();

    const { data: programRaw, error: insertError } = await serviceClient
      .from("programs")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        name: finalName,
        description: schema.metadata.description || null,
        schema: schema as unknown as Record<string, unknown>,
        execution_mode: mapExecutionMode(schema.execution_mode),
        is_active: false,
        updated_at: now,
      } as unknown as never)
      .select("id, name, description, execution_mode, is_active, schema_version, created_at, updated_at")
      .single();

    if (insertError || !programRaw) return apiError(insertError?.message ?? "Failed to save imported workflow", 500);
    const program = programRaw as unknown as { id: string; name: string };

    const { error: membershipError } = await serviceClient.from("program_memberships").insert({
      program_id: program.id,
      user_id: userId,
      role: "editor",
      created_by: userId,
    } as unknown as never);
    if (membershipError) {
      serverLog({ level: "error", event: "migrate.relay.membership_insert_failed", message: "Failed to insert creator membership for migrated program." });
    }

    if (matchedConnections.length > 0) {
      const { error: linkError } = await serviceClient.from("program_connections").insert(
        matchedConnections.map((conn) => ({ program_id: program.id, connection_id: conn.id })) as unknown as never
      );
      if (linkError) serverLog({ level: "error", event: "migrate.relay.connection_link_failed", message: "Failed to link connections to migrated program." });
    }

    const { error: versionErr } = await serviceClient.from("program_versions").insert({
      program_id: program.id,
      version: 0,
      schema: schema as unknown as Record<string, unknown>,
      change_summary: "Imported from Relay.app",
    } as unknown as never);
    if (versionErr) serverLog({ level: "error", event: "migrate.relay.version_insert_failed", message: "Failed to store version snapshot for migrated program." });

    // Sync schema triggers into the triggers table so activation "just works"
    // later. The program is inactive, so nothing fires now. Non-fatal.
    try {
      await syncEventTriggers(serviceClient, program.id, schema);
      await syncCronTriggers(serviceClient, program.id, schema);
      await syncWebhookTriggers(serviceClient, program.id, schema);
      await syncFileWatchTriggers(serviceClient, program.id, schema);
    } catch (syncError) {
      serverLog({
        level: "error",
        event: "migrate.relay.trigger_sync_failed",
        message: "Failed to sync triggers for migrated program.",
        details: { program_id: program.id, error: syncError instanceof Error ? syncError.message : String(syncError) },
      });
    }

    const linkedNames = new Set(matchedConnections.map((c) => c.name));
    const missingConnectionNames = referencedConnectionNames.filter((n) => !linkedNames.has(n));

    serverLog({
      level: "info",
      event: "migrate.relay.completed",
      message: "Converted a Relay workflow into a Corelyx draft.",
      details: {
        program_id: program.id,
        providers: providers.join(","),
        node_count: schema.nodes.length,
        manual_setup_notes: countManualSetupNotes(schema),
        validation_errors: validation.errors.length,
        validation_warnings: validation.warnings.length,
        duration_ms: Date.now() - startedAt,
      },
    });

    return NextResponse.json(
      {
        program,
        validation,
        linked_connection_names: [...linkedNames],
        missing_connection_names: missingConnectionNames,
        manual_setup_notes: countManualSetupNotes(schema),
        coverage: {
          covered: coverage.covered.map((c) => c.label),
          gaps: coverage.gaps.map((g) => ({ label: g.label, suggestion: g.suggestion ?? null })),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof RelayConversionError) {
      return NextResponse.json({ error: "CONVERSION_FAILED", message: err.message }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : String(err);
    serverLog({
      level: "error",
      event: "migrate.relay.failed",
      message: "Relay conversion failed.",
      details: { error: message.slice(0, 200), raw_preview: modelText.slice(0, 200) },
    });
    return NextResponse.json(
      {
        error: "CONVERSION_FAILED",
        message: "The migration AI is temporarily unavailable or the workflow could not be converted. Please try again in a moment.",
      },
      { status: 502 }
    );
  }
}
