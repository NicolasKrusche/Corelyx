import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

export const maxDuration = 120;

import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { vaultRetrieve } from "@/lib/vault";
import { type LlmUsageLike } from "@/lib/llm-usage-log";
import { chargeGenesisUsage, checkGenesisAffordability } from "@/lib/genesis/billing";
import { estimateGenesisCredits, estimateTokens } from "@/lib/genesis/credit-cost";
import type { ModelPricing } from "@/lib/genesis/platform-models";
import { rateLimit } from "@/lib/rate-limit";
import { writeAppLog } from "@/lib/app-logs";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { hasGenesisV2Access } from "@/lib/genesis/v2-access";
import { PseudonymizationSession } from "@/lib/privacy/pii";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import {
  getDraftValidationMessage,
  normalizeProgramDraft,
  pruneUnresolvedReferences,
  validateProgramDraft,
} from "@/lib/workflow/normalize";
import { syncCronTriggers, syncEventTriggers, syncFileWatchTriggers, syncWebhookTriggers } from "@/lib/triggers/event-trigger-sync";
import { buildClarificationAnswerMessage, buildGenesisSystemPrompt } from "@/lib/genesis/prompt";
import { extractJson, normalizeSchema } from "@/lib/genesis/parsing";
import {
  GENESIS_MAX_TOKENS,
  GENESIS_TEMPERATURE,
  KEY_DEFAULT_MODELS,
  PLATFORM_DEFAULT_MODEL,
  getModelCandidates,
  getProviderBaseURL,
  mapExecutionMode,
  supportsOpenAiJsonMode,
  toGenesisConnectionList,
  type GenesisApiKeyRow,
  type GenesisConnectionRow,
} from "@/lib/genesis/request";
import { getOpenRouterModelCatalog } from "@/lib/genesis/openrouter-models";
import {
  buildCapabilitySection,
  fetchConnectionCapabilities,
} from "@/lib/genesis/introspection";
import {
  applyGenesisPatch,
  diffSchemas,
  GenesisPatchZ,
  isGenesisPatch,
  type GenesisPatchSummary,
} from "@/lib/genesis/patch";
import type { GenesisClarification } from "@/lib/genesis/clarifications";

const AnswerRequestZ = z.object({
  node_id: z.string().min(1),
  answer: z.string().min(1).max(2000),
  api_key_id: z.string().uuid().optional(),
  use_platform_key: z.boolean().optional(),
});

// POST /api/genesis/sessions/[sessionId]/answer
// Genesis V2 phase 3: apply one clarification answer as a scoped patch to the
// generated program.
//
// This is a full model call on the platform key, so it is charged like any
// other. It used to only log usage and charge nothing, which left an uncapped
// free path to the platform key: answering costs the same as generating, and a
// session's questions can be answered repeatedly.
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const userId = user.id;

  // Gate on V2 access (dev or top plan) so a user who lost access can't keep
  // answering clarification sessions.
  if (!(await hasGenesisV2Access(userId, user.email))) {
    return apiError("Genesis V2 is not enabled for this account.", 403);
  }

  const processingRestriction = await ensureProcessingAllowed(userId);
  if (processingRestriction) return processingRestriction;

  const body = await request.json().catch(() => null);
  const parsed = AnswerRequestZ.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);
  const { node_id, answer, api_key_id, use_platform_key } = parsed.data;

  if (!(await rateLimit(`genesis:${userId}`, 10, 60_000))) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  // Session lookup goes through RLS (owner-only select), so a foreign session
  // id 404s here rather than leaking existence.
  const { data: rawSession, error: sessionError } = await supabase
    .from("genesis_sessions")
    .select("id, user_id, workspace_id, program_id, status, clarifications, expires_at")
    .eq("id", sessionId)
    .single();
  if (sessionError || !rawSession) return apiError("Session not found", 404);

  const session = rawSession as unknown as {
    id: string;
    user_id: string;
    workspace_id: string;
    program_id: string;
    status: string;
    clarifications: GenesisClarification[];
    expires_at: string;
  };

  // Defense in depth: every write below goes through the RLS-bypassing service
  // client, so don't rely on genesis_sessions RLS alone for ownership. Reject
  // any session that isn't the caller's before touching the service client (404,
  // not 403 — don't leak that the session exists).
  if (session.user_id !== userId) return apiError("Session not found", 404);

  const serviceClient = createServiceClient();

  if (session.status !== "awaiting_clarification") {
    return apiError("This session is no longer open.", 409);
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await serviceClient
      .from("genesis_sessions")
      .update({ status: "abandoned", updated_at: new Date().toISOString() } as unknown as never)
      .eq("id", session.id);
    return apiError("This session has expired. The program works as generated — edit it directly instead.", 410);
  }

  const clarification = (session.clarifications ?? []).find((c) => c.node_id === node_id);
  if (!clarification) return apiError("No open question for that node.", 404);

  // Load the program being clarified (owner check is implicit: sessions are
  // owner-scoped and reference the program row directly).
  const { data: rawProgram, error: programError } = await serviceClient
    .from("programs")
    .select("id, schema, schema_version, workspace_id")
    .eq("id", session.program_id)
    .single();
  if (programError || !rawProgram) return apiError("Program not found", 404);
  const program = rawProgram as unknown as {
    id: string;
    schema: Record<string, unknown>;
    schema_version: number | null;
    workspace_id: string;
  };

  // ── Resolve the LLM key (platform or BYOK) ──
  let apiKey: string;
  let provider: string;
  let model: string;
  let modelPricing: ModelPricing | null = null;
  if (use_platform_key === true) {
    const platformRawKey = process.env.PLATFORM_OPENROUTER_API_KEY ?? "";
    if (!platformRawKey) return apiError("Platform AI key is not available.", 503);
    apiKey = platformRawKey;
    provider = "openrouter";
    // Reuse the model that actually generated this program (server-stamped
    // after generation — see stream/route.ts) instead of always falling back
    // to the platform default. Without this, answering a clarifying question
    // ignored whichever model the user picked for generation (e.g. a paid,
    // reliable model) and always ground through the free-tier default and its
    // fallback chain instead — which is exactly the slow path a user picking
    // a different model was trying to avoid. Only trust it if it's still a
    // real, currently-offered model (older programs may carry unverified,
    // model-reported text from before this was server-stamped).
    const generatedModel = (program.schema as { metadata?: { genesis_model?: string } }).metadata?.genesis_model;
    const catalog = await getOpenRouterModelCatalog();
    model = generatedModel && catalog.some((m) => m.id === generatedModel)
      ? generatedModel
      : PLATFORM_DEFAULT_MODEL;
    modelPricing = catalog.find((m) => m.id === model)?.pricing ?? null;
  } else {
    if (!api_key_id) return apiError("api_key_id is required when not using the platform key", 400);
    const { data: keyRow, error: keyError } = await serviceClient
      .from("api_keys")
      .select("id, vault_secret_id, provider")
      .eq("id", api_key_id)
      .eq("workspace_id", session.workspace_id)
      .eq("is_valid", true)
      .single();
    if (keyError || !keyRow) return apiError("API key not found or invalid.", 402);
    const key = keyRow as unknown as GenesisApiKeyRow;
    apiKey = await vaultRetrieve(serviceClient, key.vault_secret_id);
    provider = key.provider;
    model = KEY_DEFAULT_MODELS[provider] ?? "claude-sonnet-4-6";
  }

  // ── Connections linked to this program (for prompt context + grounding) ──
  const { data: linkRows } = await serviceClient
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", program.id);
  const connectionIds = ((linkRows ?? []) as Array<{ connection_id: string }>).map(
    (row) => row.connection_id
  );
  let connectionRows: GenesisConnectionRow[] = [];
  if (connectionIds.length > 0) {
    const { data: rawConnections } = await serviceClient
      .from("connections")
      .select("id, name, provider, scopes")
      .in("id", connectionIds)
      .eq("is_valid", true);
    connectionRows = (rawConnections ?? []) as unknown as GenesisConnectionRow[];
  }
  const availableConnections = toGenesisConnectionList(connectionRows);
  const selectedProviders = availableConnections.map((conn) => conn.type);

  // One session per request, same contract as generation: user data reaches
  // the model only as placeholders and is substituted back afterwards.
  const piiSession = new PseudonymizationSession();

  let capabilitySection: string | null = null;
  if (connectionRows.length > 0) {
    const descriptors = await fetchConnectionCapabilities(
      connectionRows.map((row) => row.id),
      userId
    );
    capabilitySection = buildCapabilitySection(descriptors, connectionRows, piiSession);
  }

  const sanitizedAnswer = piiSession.applyKnownValues(piiSession.sanitizeText(answer).value);
  const sanitizedQuestion = piiSession.applyKnownValues(
    piiSession.sanitizeText(clarification.question).value
  );
  const sanitizedSchema = piiSession.applyKnownValuesToValue(
    piiSession.sanitizeValue(program.schema).value
  );

  const systemPrompt = buildGenesisSystemPrompt(
    selectedProviders.length > 0 ? selectedProviders : null,
    null,
    capabilitySection
  );
  const userMessage = buildClarificationAnswerMessage(
    sanitizedQuestion,
    sanitizedAnswer,
    clarification.node_id,
    clarification.blocked_node_ids,
    sanitizedSchema as object,
    availableConnections
  );

  // Price the call before spending anything on it, exactly as the generate
  // routes do — the catalog spans three orders of magnitude on output price.
  if (use_platform_key === true) {
    const estimatedCredits = estimateGenesisCredits({
      pricing: modelPricing,
      promptTokens: estimateTokens(systemPrompt) + estimateTokens(userMessage),
      maxOutputTokens: GENESIS_MAX_TOKENS,
    });
    const affordability = await checkGenesisAffordability(userId, estimatedCredits);
    if (!affordability.affordable) {
      const needed = affordability.estimatedCredits;
      return NextResponse.json(
        {
          error: "INSUFFICIENT_CREDITS",
          message:
            needed === null
              ? "You're out of AI credits. Top up or switch to your own API key to keep using Genesis."
              : `Answering this question needs about ${needed.toLocaleString("en-US")} credits on ${model} and you have ${affordability.balance.toLocaleString("en-US")}.`,
        },
        { status: 402 }
      );
    }
  }

  // ── Model call (single key, provider-internal model fallbacks) ──
  let rawText = "";
  let modelUsed = model;
  const modelCandidates = getModelCandidates(provider, model);
  for (let i = 0; i < modelCandidates.length; i += 1) {
    const candidateModel = modelCandidates[i] ?? model;
    let usageData: LlmUsageLike = null;
    try {
      if (provider === "anthropic") {
        const anthropic = new Anthropic({ apiKey });
        const message = await anthropic.messages.create({
          model: candidateModel,
          max_tokens: GENESIS_MAX_TOKENS,
          temperature: GENESIS_TEMPERATURE,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });
        usageData = message.usage as LlmUsageLike;
        rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
      } else {
        const baseURL = getProviderBaseURL(provider);
        const openai = new OpenAI({ apiKey, ...(baseURL && { baseURL }), timeout: 90_000 });
        const completion = await openai.chat.completions.create({
          model: candidateModel,
          max_tokens: GENESIS_MAX_TOKENS,
          temperature: GENESIS_TEMPERATURE,
          ...(supportsOpenAiJsonMode(provider, getProviderBaseURL(provider)) && {
            response_format: { type: "json_object" as const },
          }),
          // OpenRouter usage accounting: exact billed cost in response usage.
          ...(provider === "openrouter" && ({ usage: { include: true } } as object)),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        });
        usageData = (completion as { usage?: LlmUsageLike }).usage ?? null;
        rawText = completion.choices[0]?.message?.content ?? "";
      }
      if (rawText) {
        modelUsed = candidateModel;
        await chargeGenesisUsage({
          userId,
          workspaceId: session.workspace_id,
          model: candidateModel,
          usage: usageData,
          pricing: modelPricing,
          billing: use_platform_key === true ? "platform" : "byok",
          bonusFunded: false,
        });
        break;
      }
    } catch {
      if (i === modelCandidates.length - 1) {
        return apiError("The AI is unavailable right now. Your answer was not lost — try again in a moment.", 502);
      }
    }
  }
  if (!rawText) return apiError("The AI did not respond. Please try again.", 502);

  // ── Parse (two-layer recovery) + rehydrate + apply ──
  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(extractJson(rawText));
  } catch {
    try {
      parsedOutput = JSON.parse(jsonrepair(extractJson(rawText)));
    } catch {
      return apiError("The AI returned an edit we could not use. Please try again.", 502);
    }
  }
  parsedOutput = piiSession.rehydrateValue(parsedOutput);

  let patchSummary: GenesisPatchSummary | null = null;
  let nextSchema: unknown;
  if (isGenesisPatch(parsedOutput)) {
    const patchResult = GenesisPatchZ.safeParse(parsedOutput);
    if (!patchResult.success) {
      return apiError("The AI returned an edit we could not apply. Please try again.", 422);
    }
    const applied = applyGenesisPatch(program.schema, patchResult.data);
    nextSchema = applied.schema;
    patchSummary = applied.summary;
  } else {
    // Full-schema response from a weak model — accept it, derive the diff.
    nextSchema = parsedOutput;
    patchSummary = diffSchemas(program.schema, parsedOutput as object);
  }

  normalizeSchema(nextSchema);
  nextSchema = normalizeProgramDraft(nextSchema, program.schema as Partial<ProgramSchema>);
  pruneUnresolvedReferences(nextSchema as ProgramSchema);

  const draftResult = validateProgramDraft(nextSchema);
  if (!draftResult.success) {
    return NextResponse.json(
      { error: "ANSWER_INVALID_GRAPH", message: getDraftValidationMessage(draftResult.error) },
      { status: 422 }
    );
  }
  const schemaResult = ProgramSchemaZ.safeParse(nextSchema);
  const schema = (schemaResult.success ? schemaResult.data : draftResult.data) as unknown as ProgramSchema;
  const validation = validatePostGenesis(schema, connectionRows);

  // ── Persist: program row, version snapshot, trigger sync, session update ──
  const currentVersion = program.schema_version;
  const nextVersion = (currentVersion ?? 0) + 1;
  const now = new Date().toISOString();
  // Compare-and-swap on schema_version, mirroring /api/programs/[id] PATCH: a
  // clarification answer landing during an editor autosave must not silently
  // revert the canvas edits (and duplicate a program_versions version number).
  // The loser gets a 409 and the editor reloads instead of losing work.
  let updateQuery = serviceClient
    .from("programs")
    .update({
      name: schema.program_name,
      schema: schema as unknown as Record<string, unknown>,
      execution_mode: mapExecutionMode(schema.execution_mode),
      schema_version: nextVersion,
      updated_at: now,
    } as unknown as never)
    .eq("id", program.id);
  updateQuery =
    currentVersion === null
      ? updateQuery.is("schema_version", null)
      : updateQuery.eq("schema_version", currentVersion);
  const { data: updatedProgram, error: updateError } = await updateQuery
    .select("id")
    .maybeSingle();
  if (updateError) return apiError(updateError.message, 500);
  if (!updatedProgram) {
    return NextResponse.json(
      {
        error: "SCHEMA_VERSION_CONFLICT",
        message:
          "This workflow was changed elsewhere (another tab, the Triggers page, or Genesis). Reload the editor to continue.",
        current_version: currentVersion ?? 0,
      },
      { status: 409 }
    );
  }

  await serviceClient.from("program_versions").insert({
    program_id: program.id,
    version: nextVersion,
    schema: schema as unknown as Record<string, unknown>,
    change_summary:
      patchSummary?.change_summary ?? `Clarified — ${answer.slice(0, 120)}`,
    ...(patchSummary ? { patch: patchSummary as unknown as Record<string, unknown> } : {}),
  } as unknown as never);

  try {
    await syncEventTriggers(serviceClient, program.id, schema);
    await syncCronTriggers(serviceClient, program.id, schema);
    await syncWebhookTriggers(serviceClient, program.id, schema);
    await syncFileWatchTriggers(serviceClient, program.id, schema);
  } catch {
    // Trigger sync failures are non-fatal here, same as the refinement path.
  }

  const remaining = (session.clarifications ?? []).filter((c) => c.node_id !== node_id);
  const sessionStatus = remaining.length === 0 ? "completed" : "awaiting_clarification";
  await serviceClient
    .from("genesis_sessions")
    .update({
      clarifications: remaining as unknown as Record<string, unknown>[],
      status: sessionStatus,
      updated_at: now,
    } as unknown as never)
    .eq("id", session.id);

  await writeAppLog(supabase, {
    userId,
    level: "info",
    source: "Genesis",
    event: "genesis.clarification.answered",
    status: "completed",
    message: `Clarification for node ${node_id} applied.`,
    programId: program.id,
    details: {
      model_used: modelUsed,
      remaining_questions: remaining.length,
      patch_counts: patchSummary
        ? {
            added: patchSummary.added_node_ids.length,
            updated: patchSummary.updated_node_ids.length,
            removed: patchSummary.removed_node_ids.length,
          }
        : null,
    },
  });

  return NextResponse.json({
    schema,
    // The editor tracks the program's schema_version for conflict-safe saves;
    // this write bumped it, so hand the new version back to adopt.
    schema_version: nextVersion,
    validation,
    patch: patchSummary,
    remaining_clarifications: remaining,
    session_status: sessionStatus,
  });
}
