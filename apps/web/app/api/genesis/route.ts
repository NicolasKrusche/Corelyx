import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

// Extend Vercel serverless function timeout (300s max on Pro plan)
export const maxDuration = 300;
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { vaultRetrieve } from "@/lib/vault";
import { buildGenesisSystemPrompt, buildGenesisUserMessage, buildRefinementUserMessage } from "@/lib/genesis/prompt";
import {
  pickEuComplianceFilterKey,
  runEuComplianceFilter,
} from "@/lib/genesis/eu-compliance";
import { assignAgentNodeDefaults, extractJson, normalizeSchema } from "@/lib/genesis/parsing";
import { applyDeterministicRepairs, createRepairModelCaller, repairMissingOperationParams } from "@/lib/genesis/semantic-repair";
import {
  hasPiiRedactions,
  mergePiiRedactions,
  PseudonymizationSession,
} from "@/lib/privacy/pii";
import {
  buildCapabilitySection,
  fetchConnectionCapabilities,
  summarizeCapabilities,
} from "@/lib/genesis/introspection";
import {
  applyGenesisPatch,
  diffSchemas,
  GenesisPatchZ,
  isGenesisPatch,
  type GenesisPatchSummary,
} from "@/lib/genesis/patch";
import { extractClarifications } from "@/lib/genesis/clarifications";
import { isGenesisV2Enabled } from "@/lib/genesis/v2-access";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import {
  getDraftValidationMessage,
  normalizeProgramDraft,
  pruneUnresolvedReferences,
  validateProgramDraft,
} from "@/lib/workflow/normalize";
import { checkProgramLimit, getGenesisGrant, recordGenesisUse } from "@/lib/limits";
import { estimateGenesisCredits, estimateTokens } from "@/lib/genesis/credit-cost";
import { checkGenesisAffordability, chargeGenesisUsage } from "@/lib/genesis/billing";
import type { ModelPricing } from "@/lib/genesis/platform-models";
import { rateLimit } from "@/lib/rate-limit";
import { errorDetails, writeAppLog } from "@/lib/app-logs";
import { serverLog } from "@/lib/server-log";
import { type LlmUsageLike } from "@/lib/llm-usage-log";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { syncCronTriggers, syncEventTriggers, syncFileWatchTriggers, syncWebhookTriggers } from "@/lib/triggers/event-trigger-sync";
import { canContributeToWorkspace, canEdit, canView, getActiveWorkspace, getProgramAccess } from "@/lib/workspaces";
import {
  GENESIS_MAX_TOKENS,
  GENESIS_TEMPERATURE,
  GenesisRequestSchema,
  KEY_DEFAULT_MODELS,
  PLATFORM_DEFAULT_MODEL,
  getAllowedPlatformModels,
  getMissingConnectionIds,
  getModelCandidates,
  getProviderBaseURL,
  mapExecutionMode,
  isGenesisRefinementRequest,
  sortApiKeyFallbacks,
  supportsOpenAiJsonMode,
  toGenesisConnectionList,
  toProgramConnectionLinks,
  uniqueRequestedConnectionIds,
  type GenesisApiKeyRow,
  type GenesisConnectionRow,
} from "@/lib/genesis/request";
import { getOpenRouterModelCatalog } from "@/lib/genesis/openrouter-models";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";


const PRIMARY_MODEL_ATTEMPTS = 2;
const FALLBACK_MODEL_ATTEMPTS = 1;

// POST /api/genesis — generate a program schema from a description
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const userId = user.id;

  const processingRestriction = await ensureProcessingAllowed(userId);
  if (processingRestriction) return processingRestriction;

  const body = await request.json().catch(() => null);
  const parsed = GenesisRequestSchema.safeParse(body);
  if (!parsed.success) {
    await writeAppLog(supabase, {
      userId,
      level: "error",
      source: "Genesis",
      event: "genesis.request.invalid",
      status: "failed",
      message: "Program generation request was invalid.",
      details: {
        issues: parsed.error.flatten(),
        body_keys: body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [],
      },
    });
    return apiError(parsed.error.message, 400);
  }

  const { description, connection_ids, api_key_id, use_platform_key, existing_schema, refinement, existing_program_id } = parsed.data;
  const usePlatformKey = use_platform_key === true;

  if (!usePlatformKey && !api_key_id) {
    return apiError("api_key_id is required when not using the platform key", 400);
  }

  // Resolve the model.
  // Platform key: use the requested model if it's in the user's allowed catalog; fall back to default.
  // BYOK: use whatever the client sent.
  const userTier = await getUserTier(userId);
  let model: string;
  // Kept so the credit pre-flight can price the chosen model before spending.
  let modelPricing: ModelPricing | null = null;
  if (usePlatformKey) {
    const ent = getEntitlements(userTier);
    const catalog = await getOpenRouterModelCatalog();
    const allowedModels = getAllowedPlatformModels(ent.genesisPlatformModelTier, catalog);
    const allowedIds = new Set(allowedModels.map((m) => m.id));
    const requestedModel = parsed.data.model;
    model = requestedModel && allowedIds.has(requestedModel) ? requestedModel : PLATFORM_DEFAULT_MODEL;
    modelPricing = catalog.find((m) => m.id === model)?.pricing ?? null;
  } else {
    model = parsed.data.model ?? "claude-sonnet-4-6";
  }
  const requestedConnectionIds = uniqueRequestedConnectionIds(connection_ids);
  const isRefinement = isGenesisRefinementRequest(parsed.data);
  // One reversible session per request: the model sees stable [EMAIL_1]-style
  // placeholders; the generated schema is rehydrated to real values below.
  const piiSession = new PseudonymizationSession();
  const sanitizedDescription = piiSession.sanitizeText(description);
  const sanitizedRefinement = refinement ? piiSession.sanitizeText(refinement) : null;
  const sanitizedExistingSchema = existing_schema === undefined ? null : piiSession.sanitizeValue(existing_schema);
  const piiRedactions = mergePiiRedactions(
    sanitizedDescription.redactions,
    sanitizedRefinement?.redactions,
    sanitizedExistingSchema?.redactions
  );
  const genesisStartedAt = Date.now();
  const genesisMode = isRefinement ? "refinement" : "generation";
  const baseLogDetails = {
    mode: genesisMode,
    model,
    connection_count: connection_ids.length,
    existing_program_id: existing_program_id ?? null,
    description_length: sanitizedDescription.value.length,
    refinement_length: sanitizedRefinement?.value.length ?? 0,
    pii_redacted: hasPiiRedactions(piiRedactions),
    pii_redactions: piiRedactions,
  };

  async function logGenesis(
    level: "info" | "warning" | "error",
    event: string,
    status: string,
    message: string,
    details?: Record<string, unknown>,
    programId?: string | null
  ) {
    await writeAppLog(supabase, {
      userId,
      level,
      source: "Genesis",
      event,
      status,
      message,
      programId: programId ?? existing_program_id ?? null,
      durationMs: Date.now() - genesisStartedAt,
      details: { ...baseLogDetails, ...(details ?? {}) },
    });
  }

  async function loggedApiError(message: string, status: number, event: string, details?: Record<string, unknown>) {
    await logGenesis("error", event, "failed", message, details);
    return apiError(message, status);
  }

  await logGenesis(
    "info",
    `genesis.${genesisMode}.started`,
    "running",
    isRefinement ? "Started program refinement." : "Started program generation."
  );

  // Rate limit: 10 genesis calls per minute per user
  if (!(await rateLimit(`genesis:${userId}`, 10, 60_000))) {
    await logGenesis(
      "warning",
      "genesis.rate_limited",
      "failed",
      "Program generation was rate limited."
    );
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  // Resolve workspace context before plan/usage checks.
  let workspaceId: string | null = null;
  if (existing_program_id) {
    const access = await getProgramAccess(existing_program_id, userId);
    if (!canView(access)) return loggedApiError("Program not found", 404, "genesis.program_not_found");
    if (!canEdit(access)) return loggedApiError("Only program editors can refine.", 403, "genesis.forbidden");
    workspaceId = access!.workspaceId;
  } else {
    const ws = await getActiveWorkspace(userId);
    if (!ws) return loggedApiError("No active workspace", 400, "genesis.no_workspace");
    if (!canContributeToWorkspace(ws.role)) {
      return loggedApiError("Viewers cannot generate programs.", 403, "genesis.forbidden");
    }
    workspaceId = ws.workspaceId;
  }

  // Check genesis AI access against the workspace plan.
  // A `genesis_uses` grant funds this generation outright; otherwise it is paid
  // for in credits, checked against the actual model price further down.
  const genesisGrant = await getGenesisGrant(userId, workspaceId);
  const bonusFunded = usePlatformKey && genesisGrant.bonusRemaining > 0;

  // Check program limit before generating (skip for refinements — no new program created)
  if (!isRefinement) {
    const limitCheck = await checkProgramLimit(userId, workspaceId);
    if (!limitCheck.allowed) {
      const upgradeMessage = limitCheck.upgradeMessage ?? "Program limit reached.";
      await logGenesis(
        "warning",
        "genesis.program_limit_reached",
        "failed",
        upgradeMessage
      );
      return NextResponse.json(
        { error: "PROGRAM_LIMIT_REACHED", message: upgradeMessage },
        { status: 403 }
      );
    }
  }

  // Resolve workspace context — refinement uses program's workspace, new generation
  // uses the active workspace.
  // Resolve selected connections and reject stale/invalid IDs before generation.
  let connectionRows: GenesisConnectionRow[] = [];
  if (requestedConnectionIds.length > 0) {
    const { data: rawConnections, error: connError } = await supabase
      .from("connections")
      .select("id, name, provider, scopes")
      .in("id", requestedConnectionIds)
      .eq("workspace_id", workspaceId)
      .eq("is_valid", true);

    if (connError) {
      return loggedApiError(connError.message, 500, "genesis.connections_lookup_failed");
    }

    connectionRows = (rawConnections ?? []) as unknown as GenesisConnectionRow[];
    const missingConnectionIds = getMissingConnectionIds(requestedConnectionIds, connectionRows);
    if (missingConnectionIds.length > 0) {
      return loggedApiError(
        "One or more selected connections are unavailable. Refresh the page and choose valid connections.",
        400,
        "genesis.connections_invalid",
        { missing_connection_ids: missingConnectionIds }
      );
    }
  }

  const availableConnections = toGenesisConnectionList(connectionRows);

  // Genesis V2 (dev-gated): introspect the selected connections for live,
  // metadata-only capability data. User-named strings are registered with
  // piiSession — only placeholders reach the prompt. Failures fall back to the
  // static catalog. Skipped entirely when V2 is off.
  const v2Enabled = await isGenesisV2Enabled(userId, user.email, parsed.data.genesis_v2);
  let capabilitySection: string | null = null;
  if (v2Enabled && connectionRows.length > 0) {
    const descriptors = await fetchConnectionCapabilities(
      connectionRows.map((row) => row.id),
      userId
    );
    capabilitySection = buildCapabilitySection(descriptors, connectionRows, piiSession);
    if (capabilitySection) {
      await logGenesis(
        "info",
        "genesis.introspection.applied",
        "running",
        "Live connection capabilities included in Genesis prompt.",
        { introspection: summarizeCapabilities(descriptors) }
      );
    }
  }

  // Align user-typed references to introspected resources with the same
  // placeholders used in the capability section (identity without the name).
  const groundedDescription = piiSession.applyKnownValues(sanitizedDescription.value);
  const groundedRefinement = sanitizedRefinement
    ? piiSession.applyKnownValues(sanitizedRefinement.value)
    : null;

  // Extract provider names from available connections for dynamic prompt generation
  const selectedProviders = availableConnections.map((conn) => conn.type);
  const genesisSystemPrompt = buildGenesisSystemPrompt(
    selectedProviders.length > 0 ? selectedProviders : null,
    userTier,
    capabilitySection
  );

  const serviceClient = createServiceClient();
  let keyCandidates: GenesisApiKeyRow[];

  if (usePlatformKey) {
    const platformRawKey = process.env.PLATFORM_OPENROUTER_API_KEY ?? "";
    if (!platformRawKey) {
      return loggedApiError("Platform AI key is not available.", 503, "genesis.platform_key_unavailable");
    }
    // Price this specific generation before spending anything on it. A bonus
    // grant covers it outright; otherwise the balance has to cover the worst
    // case for the chosen model.
    if (!bonusFunded) {
      const promptTokens =
        estimateTokens(genesisSystemPrompt) +
        estimateTokens(sanitizedDescription.value) +
        (sanitizedRefinement ? estimateTokens(sanitizedRefinement.value) : 0) +
        (sanitizedExistingSchema ? estimateTokens(JSON.stringify(sanitizedExistingSchema.value)) : 0);
      const estimatedCredits = estimateGenesisCredits({
        pricing: modelPricing,
        promptTokens,
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
                : `This ${isRefinement ? "AI edit" : "generation"} needs about ${needed.toLocaleString("en-US")} credits on ${model} and you have ${affordability.balance.toLocaleString("en-US")}. Pick a cheaper model, top up, or use your own API key.`,
          },
          { status: 402 }
        );
      }
    }
    // vault_secret_id holds the raw API key for platform entries — handled in the loop below.
    keyCandidates = [{ id: "platform", vault_secret_id: platformRawKey, provider: "openrouter" }];
  } else {
    // Fetch all valid API keys for the user — preferred key first, then sorted by provider suitability
    const { data: allKeyRows, error: keysError } = await serviceClient
      .from("api_keys")
      .select("id, vault_secret_id, provider")
      .eq("workspace_id", workspaceId)
      .eq("is_valid", true);

    const validKeyRows = (allKeyRows ?? []) as unknown as GenesisApiKeyRow[];
    if (keysError || validKeyRows.length === 0) {
      return loggedApiError(
        "API key not found. Please add a valid API key.",
        402,
        "genesis.api_key_lookup_failed",
        keysError ? { error: keysError.message } : undefined
      );
    }

    keyCandidates = sortApiKeyFallbacks(api_key_id!, validKeyRows);
    if (keyCandidates.length === 0) {
      return loggedApiError(
        "Selected API key not found or invalid. Refresh the page and choose another key.",
        402,
        "genesis.api_key_invalid",
        { api_key_id }
      );
    }
  }

  // Permanent errors — prompt is too large for this model/tier, retrying won't help
  const isPromptTooLarge = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    const lowerMsg = msg.toLowerCase();
    return (
      lowerMsg.includes("request too large") ||
      lowerMsg.includes("too large for model") ||
      (lowerMsg.includes("rate_limit_exceeded") && lowerMsg.includes("token")) ||
      lowerMsg.includes("context_length_exceeded") ||
      lowerMsg.includes("maximum context length")
    );
  };

  // Key-level errors — the API key itself is unusable; try the next key
  const isKeyError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    const lowerMsg = msg.toLowerCase();
    return (
      lowerMsg.includes("credit balance is too low") ||
      lowerMsg.includes("insufficient credits") ||
      lowerMsg.includes("exceeded your current quota") ||
      lowerMsg.includes("insufficient_quota") ||
      lowerMsg.includes("you've exceeded") ||
      lowerMsg.includes("billing hard limit") ||
      lowerMsg.includes("invalid api key") ||
      lowerMsg.includes("invalid_api_key") ||
      lowerMsg.includes("incorrect api key") ||
      lowerMsg.includes("authentication_error") ||
      lowerMsg.includes("you didn't provide an api key") ||
      lowerMsg.includes("no api key provided")
    );
  };

  // Transient provider errors that are safe to retry (OpenRouter 524 timeout, 529 overloaded, etc.)
  const isRetryable = (err: unknown): boolean => {
    if (isPromptTooLarge(err) || isKeyError(err)) return false;
    const msg = err instanceof Error ? err.message : String(err);
    const lowerMsg = msg.toLowerCase();
    return (
      msg.includes("524") ||
      msg.includes("529") ||
      lowerMsg.includes("provider returned error") ||
      lowerMsg.includes("no endpoints found") ||
      lowerMsg.includes("temporarily unavailable") ||
      lowerMsg.includes("overloaded") ||
      lowerMsg.includes("rate-limited") ||
      lowerMsg.includes("rate limit") ||
      lowerMsg.includes("rate_limit_exceeded") ||
      (lowerMsg.includes("model") && lowerMsg.includes("not found")) ||
      lowerMsg.includes("timeout") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ETIMEDOUT")
    );
  };

  // Step 1: EU compliance pre-filter — run before Genesis to identify any
  // relevant EU regulatory obligations. Uses the first available key with a
  // fast/cheap model. Non-blocking: failures are logged and generation continues.
  let euComplianceContext: string | null = null;
  try {
    const filterKeyRow = pickEuComplianceFilterKey(keyCandidates);
    if (filterKeyRow) {
      const filterApiKey = await vaultRetrieve(serviceClient, filterKeyRow.vault_secret_id);
      const complianceResult = await runEuComplianceFilter(
        groundedDescription,
        filterKeyRow,
        filterApiKey,
        { userId, workspaceId }
      );
      if (complianceResult?.verdict === "blocked") {
        return NextResponse.json(
          { error: "EU_COMPLIANCE_BLOCKED", message: complianceResult.blockedReason },
          { status: 403 }
        );
      }
      if (complianceResult?.verdict === "obligations") {
        euComplianceContext = complianceResult.context;
        await logGenesis(
          "info",
          "genesis.compliance_filter.applied",
          "running",
          "EU compliance obligations identified and included in Genesis prompt.",
          { compliance_length: euComplianceContext.length }
        );
      }
    }
  } catch (err) {
    serverLog({ level: "warn", event: "genesis.eu_compliance_filter.skipped", message: "EU compliance pre-filter skipped due to an error." });
  }

  // Step 2: Build the Genesis user message including any EU compliance context.
  let rawText = "";
  let usageData: LlmUsageLike = null;
  let lastErr: unknown;
  let modelUsed = model;
  let usedKeyRow: GenesisApiKeyRow | null = null;
  let usedApiKey = "";
  const userMessage = isRefinement
    ? buildRefinementUserMessage(
        groundedRefinement!,
        (sanitizedExistingSchema?.value && typeof sanitizedExistingSchema.value === "object"
          ? sanitizedExistingSchema.value
          : {}) as object,
        availableConnections,
        euComplianceContext,
        { usePatch: v2Enabled }
      )
    : buildGenesisUserMessage(groundedDescription, availableConnections, euComplianceContext);

  keyAttemptLoop:
  for (let keyIndex = 0; keyIndex < keyCandidates.length; keyIndex++) {
    const currentKeyRow = keyCandidates[keyIndex]!;

    let currentApiKey: string;
    try {
      // Platform key entries store the raw key directly in vault_secret_id (no vault lookup needed).
      currentApiKey = currentKeyRow.id === "platform"
        ? currentKeyRow.vault_secret_id
        : await vaultRetrieve(serviceClient, currentKeyRow.vault_secret_id);
    } catch (err) {
      serverLog({ level: "warn", event: "genesis.vault.retrieve_failed", message: "Vault retrieve failed for a key candidate; skipping." });
      continue;
    }

    if (keyIndex > 0) {
      await logGenesis(
        "warning",
        "genesis.key_fallback",
        "retrying",
        `Preferred key failed; trying fallback key (provider: ${currentKeyRow.provider}).`,
        { fallback_provider: currentKeyRow.provider }
      );
    }

    const useAnthropicSDK = currentKeyRow.provider === "anthropic";
    const currentModel = keyIndex === 0 ? model : (KEY_DEFAULT_MODELS[currentKeyRow.provider] ?? model);
    const modelCandidates = getModelCandidates(currentKeyRow.provider, currentModel);
    const baseURL = getProviderBaseURL(currentKeyRow.provider);
    const openai = useAnthropicSDK
      ? null
      : new OpenAI({ apiKey: currentApiKey, ...(baseURL && { baseURL }), timeout: 240_000 });
    const anthropic = useAnthropicSDK ? new Anthropic({ apiKey: currentApiKey }) : null;

    modelAttemptLoop:
    for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex++) {
      const candidateModel = modelCandidates[modelIndex] ?? currentModel;
      const maxAttempts = candidateModel === currentModel ? PRIMARY_MODEL_ATTEMPTS : FALLBACK_MODEL_ATTEMPTS;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          rawText = "";
          usageData = null;

          if (anthropic) {
            const msg = await anthropic.messages.create({
              model: candidateModel,
              max_tokens: GENESIS_MAX_TOKENS,
              temperature: GENESIS_TEMPERATURE,
              system: genesisSystemPrompt,
              messages: [{ role: "user", content: userMessage }],
            });
            usageData = msg.usage as LlmUsageLike;
            rawText = msg.content[0]?.type === "text" ? (msg.content[0] as { type: "text"; text: string }).text : "";
          } else if (openai) {
            const completion = await openai.chat.completions.create({
              model: candidateModel,
              max_tokens: GENESIS_MAX_TOKENS,
              ...(supportsOpenAiJsonMode(currentKeyRow.provider, baseURL) && {
                response_format: { type: "json_object" as const },
              }),
              // OpenRouter usage accounting: exact billed cost in response usage.
              ...(currentKeyRow.provider === "openrouter" && ({ usage: { include: true } } as object)),
              messages: [
                { role: "system", content: genesisSystemPrompt },
                { role: "user", content: userMessage },
              ],
            });
            usageData = (completion as { usage?: LlmUsageLike }).usage ?? null;
            rawText = completion.choices[0]?.message?.content ?? "";
          }

          if (!rawText) throw new Error(`Model returned empty response (model="${candidateModel}" may be unavailable or rate-limited)`);
          modelUsed = candidateModel;
          usedKeyRow = currentKeyRow;
          usedApiKey = currentApiKey;
          await chargeGenesisUsage({
            userId,
            workspaceId,
            model: candidateModel,
            usage: usageData,
            billing: currentKeyRow.id === "platform" ? "platform" : "byok",
            bonusFunded,
          });
          break keyAttemptLoop; // success
        } catch (err) {
          lastErr = err;

          // Key-level failure — skip remaining models for this key and try next key
          if (isKeyError(err)) {
            const errMsg = (err as Error).message ?? String(err);
            serverLog({ level: "warn", event: "genesis.key.auth_error_fallback", message: "API key auth error; falling back to next key candidate.", details: { provider: currentKeyRow.provider } });
            break modelAttemptLoop;
          }

          const retryable = isRetryable(err);
          const hasMoreAttempts = retryable && attempt < maxAttempts;
          const hasFallbackModel = retryable && modelIndex < modelCandidates.length - 1;

          if (hasMoreAttempts) {
            await logGenesis(
              "warning",
              "genesis.model_retry",
              "retrying",
              `Genesis model call failed on attempt ${attempt}; retrying.`,
              {
                attempt,
                max_attempts: maxAttempts,
                provider: currentKeyRow.provider,
                requested_model: currentModel,
                candidate_model: candidateModel,
                error: errorDetails(err),
              }
            );
            await new Promise((r) => setTimeout(r, attempt * 2000));
            continue;
          }

          if (hasFallbackModel) {
            const nextModel = modelCandidates[modelIndex + 1] ?? "unknown";
            await logGenesis(
              "warning",
              "genesis.model_fallback",
              "retrying",
              `Genesis model ${candidateModel} failed; trying fallback model ${nextModel}.`,
              {
                provider: currentKeyRow.provider,
                failed_model: candidateModel,
                fallback_model: nextModel,
                error: errorDetails(err),
              }
            );
            break;
          }

          const errMsg = (err as Error).message ?? String(err);
          const causeMsg = (err as { cause?: { message?: string } })?.cause?.message;
          serverLog({ level: "error", event: "genesis.model.call_failed", message: "Model call failed.", details: { provider: currentKeyRow.provider, model: candidateModel } });
          if (isPromptTooLarge(err)) {
            if (keyIndex < keyCandidates.length - 1) break modelAttemptLoop; // try next key
            return loggedApiError(
              `The Genesis prompt is too large for all available models. Try adding an Anthropic or OpenAI key.`,
              422,
              "genesis.prompt_too_large",
              { provider: currentKeyRow.provider, model: candidateModel, error: errorDetails(err) }
            );
          }
          return loggedApiError(
            "Genesis model call failed. Try another model or key.",
            502,
            "genesis.model_failed",
            {
              provider: currentKeyRow.provider,
              requested_model: currentModel,
              candidate_model: candidateModel,
              error: errorDetails(err),
            }
          );
        }
      }
    }
  }

  // Expose the key row that succeeded (used below for the repair prompt)
  const apiKeyRow = usedKeyRow ?? keyCandidates[0]!;
  const useAnthropicSDK = apiKeyRow.provider === "anthropic";

  if (!rawText) {
    return loggedApiError(
      "Genesis model call failed after trying all available keys.",
      502,
      "genesis.model_failed",
      {
        provider: apiKeyRow.provider,
        requested_model: model,
        keys_tried: keyCandidates.length,
        error: errorDetails(lastErr),
      }
    );
  }

  // ── Parse the response — three-layer recovery ───────────────────────────
  // Layer 1: extractJson strips fences/preamble and finds the JSON object.
  // Layer 2: jsonrepair fixes structural issues (truncated output, trailing
  //          commas, unquoted keys, missing closing braces).
  // Layer 3: repair prompt — send the broken output back to the model and
  //          ask it to return only the corrected JSON.
  let parsed_schema: unknown;

  const tryParse = (text: string): unknown => JSON.parse(extractJson(text));

  let parseOk = false;
  try {
    parsed_schema = tryParse(rawText);
    parseOk = true;
  } catch {
    // Layer 2 — structural repair
    try {
      serverLog({ level: "warn", event: "genesis.parse.layer1_failed", message: "Layer-1 JSON parse failed; attempting jsonrepair." });
      parsed_schema = JSON.parse(jsonrepair(extractJson(rawText)));
      parseOk = true;
    } catch {
      // Layer 3 — repair prompt
      serverLog({ level: "warn", event: "genesis.parse.jsonrepair_failed", message: "jsonrepair failed; sending repair prompt to model." });
      try {
        const repairPrompt =
          `The text below is a malformed or truncated JSON schema. ` +
          `Return ONLY the corrected, complete JSON object — no explanation, no markdown, no code fences.\n\n` +
          rawText.slice(0, 12000); // cap to avoid blowing the context window

        let repairedText = "";
        if (useAnthropicSDK) {
          const anthropic = new Anthropic({ apiKey: usedApiKey });
          const repairMsg = await anthropic.messages.create({
            model: modelUsed,
            max_tokens: GENESIS_MAX_TOKENS,
            temperature: GENESIS_TEMPERATURE,
            messages: [{ role: "user", content: repairPrompt }],
          });
          await chargeGenesisUsage({
            userId,
            workspaceId,
            model: modelUsed,
            usage: repairMsg.usage as LlmUsageLike,
            billing: usedKeyRow?.id === "platform" ? "platform" : "byok",
            bonusFunded,
          });
          repairedText = repairMsg.content[0]?.type === "text"
            ? (repairMsg.content[0] as { type: "text"; text: string }).text
            : "";
        } else {
          const baseURL = getProviderBaseURL(apiKeyRow.provider);
          const openai = new OpenAI({ apiKey: usedApiKey, ...(baseURL && { baseURL }), timeout: 120_000 });
          const repairMsg = await openai.chat.completions.create({
            model: modelUsed,
            max_tokens: GENESIS_MAX_TOKENS,
            ...(supportsOpenAiJsonMode(apiKeyRow.provider, baseURL) && {
              response_format: { type: "json_object" as const },
            }),
            ...(apiKeyRow.provider === "openrouter" && ({ usage: { include: true } } as object)),
            messages: [{ role: "user", content: repairPrompt }],
          });
          await chargeGenesisUsage({
            userId,
            workspaceId,
            model: modelUsed,
            usage: (repairMsg as { usage?: LlmUsageLike }).usage ?? null,
            billing: usedKeyRow?.id === "platform" ? "platform" : "byok",
            bonusFunded,
          });
          repairedText = repairMsg.choices[0]?.message?.content ?? "";
        }

        parsed_schema = tryParse(repairedText);
        parseOk = true;
      } catch (repairErr) {
        serverLog({ level: "error", event: "genesis.parse.all_layers_failed", message: "All three parse layers failed." });
      }
    }
  }

  // Put the real values back into the generated schema (the model only ever
  // saw placeholders), so saved workflows are configured with usable data.
  if (parseOk) {
    parsed_schema = piiSession.rehydrateValue(parsed_schema);
  }

  if (!parseOk) {
    serverLog({ level: "error", event: "genesis.parse.failed", message: "Failed to parse model output as JSON.", details: { output_length: rawText?.length ?? 0 } });
    await logGenesis(
      "error",
      "genesis.invalid_json",
      "failed",
      "Genesis model returned invalid JSON.",
      {
        requested_model: model,
        model_used: modelUsed,
        raw_length: rawText?.length ?? 0,
      }
    );
    return NextResponse.json(
      { error: "Genesis model returned invalid JSON" },
      { status: 502 }
    );
  }

  // Check for genesis error signals
  if (
    parsed_schema &&
    typeof parsed_schema === "object" &&
    "error" in parsed_schema
  ) {
    const genesisError = parsed_schema as Record<string, unknown>;
    await logGenesis(
      "error",
      "genesis.model_reported_error",
      "failed",
      typeof genesisError.message === "string"
        ? genesisError.message
        : "Genesis model reported that it could not generate this program.",
      { requested_model: model, model_used: modelUsed, model_error: genesisError }
    );
    return NextResponse.json(parsed_schema, { status: 422 });
  }

  // Replace __GENERATED__ program_id with a real UUID
  if (
    parsed_schema &&
    typeof parsed_schema === "object" &&
    "program_id" in parsed_schema &&
    (parsed_schema as Record<string, unknown>).program_id === "__GENERATED__"
  ) {
    (parsed_schema as Record<string, unknown>).program_id = crypto.randomUUID();
  }

  // Genesis V2 refinement: the model returns a patch, applied here to the
  // trusted existing schema. Full-schema responses fall through to the legacy
  // path with a computed diff so the client can animate either way.
  let patchSummary: GenesisPatchSummary | null = null;
  if (v2Enabled && isRefinement && existing_schema && typeof existing_schema === "object") {
    if (isGenesisPatch(parsed_schema)) {
      const patchResult = GenesisPatchZ.safeParse(parsed_schema);
      if (!patchResult.success) {
        return loggedApiError(
          "The AI returned an edit we could not apply. Please try again.",
          422,
          "genesis.patch_invalid",
          { issues: patchResult.error.flatten() }
        );
      }
      const applied = applyGenesisPatch(existing_schema as object, patchResult.data);
      parsed_schema = applied.schema;
      patchSummary = applied.summary;
    }
  }

  // Defensive: this route never asks for clarifications, but strip a stray
  // sidecar before validation rather than fail an otherwise-valid schema.
  extractClarifications(parsed_schema);

  // Normalize common model deviations before validation
  normalizeSchema(parsed_schema);
  parsed_schema = normalizeProgramDraft(parsed_schema, isRefinement && existing_schema ? existing_schema as Partial<ProgramSchema> : undefined);
  // Drop edges/triggers that reference missing nodes (model renamed/forgot a
  // node) so one stray reference doesn't fail an otherwise-valid generated plan.
  pruneUnresolvedReferences(parsed_schema as ProgramSchema);

  // Fill "__USER_ASSIGNED__" agent model/key sentinels with a usable workspace
  // key so generated agent nodes don't fail pre-flight out of the box.
  {
    let assignableKeys: Array<{ id: string; provider: string }> =
      keyCandidates.filter((k) => k.id !== "platform");
    if (assignableKeys.length === 0) {
      const { data: workspaceKeys } = await serviceClient
        .from("api_keys")
        .select("id, provider")
        .eq("workspace_id", workspaceId)
        .eq("is_valid", true);
      assignableKeys = (workspaceKeys ?? []) as Array<{ id: string; provider: string }>;
    }
    assignAgentNodeDefaults(parsed_schema, assignableKeys);
  }

  const draftResult = validateProgramDraft(parsed_schema);
  if (!draftResult.success) {
    const message = getDraftValidationMessage(draftResult.error);
    serverLog({ level: "error", event: "genesis.validation.draft_failed", message: "Draft schema validation failed after generation." });
    await logGenesis(
      "error",
      "genesis.draft_validation_failed",
      "failed",
      message,
      {
        requested_model: model,
        model_used: modelUsed,
        validation: draftResult.error.flatten(),
        raw_length: rawText.length,
      }
    );
    return NextResponse.json(
      {
        error: "AI_EDIT_INVALID_GRAPH",
        message,
        details: draftResult.error.flatten(),
      },
      { status: 422 }
    );
  }

  const schemaResult = ProgramSchemaZ.safeParse(parsed_schema);
  const schema = (schemaResult.success ? schemaResult.data : draftResult.data) as unknown as ProgramSchema;

  // Reuses the model/key that already succeeded for generation — no new
  // key/model fallback chain, just one small call. Callers must treat any
  // rejection as best-effort-failed, not a generation failure.
  const callGenesisRepairModel = createRepairModelCaller({
    provider: apiKeyRow.provider,
    apiKey: usedApiKey,
    model: modelUsed,
    billing: usedKeyRow?.id === "platform" ? "platform" : "byok",
    userId,
    workspaceId,
  });

  // Run post-genesis validation
  let validation = validatePostGenesis(schema, connectionRows);

  // Targeted repair pass — fixes the categories weaker/cheaper models hit far
  // more often than Sonnet-class models, without touching the rest of the
  // graph. Deterministic fixes first (free), then one narrow single-node model
  // call per node still missing required operation params (bounded, and never
  // worse than leaving the original warning if it fails). See semantic-repair.ts.
  {
    const detRepair = applyDeterministicRepairs(schema, validation);
    let needsRevalidate = detRepair.fixedNodeIds.length > 0;

    if (validation.warnings.some((w) => w.code === "WARN_004")) {
      const { repairedNodeIds } = await repairMissingOperationParams(
        schema,
        connectionRows,
        groundedDescription || groundedRefinement || "",
        (prompt) => callGenesisRepairModel(prompt)
      );
      if (repairedNodeIds.length > 0) needsRevalidate = true;
    }

    if (needsRevalidate) validation = validatePostGenesis(schema, connectionRows);
  }

  // ── Refinement path: update existing program ─────────────────────────────
  if (isRefinement) {
    // Under V2, if the model returned a full schema instead of a patch, derive
    // the diff so the version row records what changed. Under V1 there is no
    // patch column write and behavior is unchanged.
    if (v2Enabled && !patchSummary && existing_schema && typeof existing_schema === "object") {
      patchSummary = diffSchemas(existing_schema as object, schema as object);
    }

    const { data: rawExisting, error: fetchError } = await supabase
      .from("programs")
      .select("id, schema_version")
      .eq("id", existing_program_id!)
      .single();

    if (fetchError || !rawExisting) {
      return loggedApiError(
        "Existing program not found",
        404,
        "genesis.refinement_program_not_found",
        fetchError ? { error: fetchError.message } : undefined
      );
    }

    const existingRow = rawExisting as unknown as { id: string; schema_version: number | null };
    const currentVersion = existingRow.schema_version;
    const nextVersion = (currentVersion ?? 0) + 1;
    const now = new Date().toISOString();

    // Compare-and-swap on schema_version, mirroring /api/programs/[id] PATCH: a
    // refinement landing during an editor autosave must not silently overwrite
    // the canvas edits (nor duplicate a program_versions version number). The
    // loser gets a 409 and the editor reloads instead of losing work.
    let refinementUpdate = supabase
      .from("programs")
      .update({
        name: schema.program_name,
        schema: schema as unknown as Record<string, unknown>,
        execution_mode: mapExecutionMode(schema.execution_mode),
        schema_version: nextVersion,
        updated_at: now,
      } as unknown as never)
      .eq("id", existing_program_id!);
    refinementUpdate =
      currentVersion === null
        ? refinementUpdate.is("schema_version", null)
        : refinementUpdate.eq("schema_version", currentVersion);
    const { data: updatedProgram, error: updateError } = await refinementUpdate
      .select("id, name, description, execution_mode, is_active, created_at")
      .maybeSingle();

    if (updateError) {
      return loggedApiError(
        updateError.message,
        500,
        "genesis.refinement_update_failed",
        { error: updateError.message }
      );
    }
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

    // Store refinement snapshot. change_summary stays human-readable (the
    // model's one-sentence summary beats a truncated echo of the request);
    // the structured diff goes in the jsonb `patch` column for the diff UI.
    const changeCounts = patchSummary
      ? ` (+${patchSummary.added_node_ids.length} ~${patchSummary.updated_node_ids.length} −${patchSummary.removed_node_ids.length} nodes)`
      : "";
    const { error: versionErr } = await supabase.from("program_versions").insert({
      program_id: existing_program_id!,
      version: nextVersion,
      schema: schema as unknown as Record<string, unknown>,
      change_summary:
        (patchSummary?.change_summary ?? `Refined — ${refinement!.slice(0, 120)}`) + changeCounts,
      ...(patchSummary ? { patch: patchSummary as unknown as Record<string, unknown> } : {}),
    } as unknown as never);
    if (versionErr) {
      serverLog({ level: "error", event: "genesis.refinement.version_insert_failed", message: "Failed to store refinement version snapshot." });
      await logGenesis(
        "warning",
        "genesis.refinement_version_snapshot_failed",
        "warning",
        "Refined program was saved, but version snapshot storage failed.",
        { error: versionErr.message },
        existing_program_id
      );
    }

    // Reconcile schema trigger nodes into the `triggers` table - the cron
    // runner only fires triggers that exist as rows there. Without this sync a
    // refined cron trigger looks "Active" in the UI but never fires.
    try {
      await syncEventTriggers(serviceClient, existing_program_id!, schema);
      await syncCronTriggers(serviceClient, existing_program_id!, schema);
      await syncWebhookTriggers(serviceClient, existing_program_id!, schema);
      await syncFileWatchTriggers(serviceClient, existing_program_id!, schema);
    } catch (syncError) {
      serverLog({
        level: "error",
        event: "genesis.refinement.trigger_sync_failed",
        message: "Failed to sync schema triggers after refinement.",
        details: { error: syncError instanceof Error ? syncError.message : String(syncError) },
      });
    }

    await logGenesis(
      "info",
      "genesis.refinement.completed",
      "completed",
      `Refined program "${schema.program_name}".`,
      {
        requested_model: model,
        model_used: modelUsed,
        validation_errors: validation.errors.length,
        validation_warnings: validation.warnings.length,
      },
      existing_program_id
    );
    await recordGenesisUse(userId, workspaceId, { fromBonus: bonusFunded });
    return NextResponse.json({ program: updatedProgram, schema, validation, patch: patchSummary }, { status: 200 });
  }

  // ── New program path ──────────────────────────────────────────────────────
  const { data: rawProgram, error: insertError } = await serviceClient
    .from("programs")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      name: schema.program_name,
      description,
      schema: schema as unknown as Record<string, unknown>,
      execution_mode: mapExecutionMode(schema.execution_mode),
    } as unknown as never)
    .select("id, name, description, execution_mode, is_active, created_at")
    .single();

  const program = rawProgram as unknown as {
    id: string;
    name: string;
    description: string | null;
    execution_mode: string;
    is_active: boolean;
    created_at: string;
  } | null;

  if (insertError || !program) {
    return loggedApiError(
      insertError?.message ?? "Failed to save program",
      500,
      "genesis.program_insert_failed",
      { error: insertError?.message ?? "unknown" }
    );
  }

  const { error: membershipErr } = await serviceClient.from("program_memberships").insert({
    program_id: program.id,
    user_id: userId,
    role: "editor",
    created_by: userId,
  } as unknown as never);
  if (membershipErr) {
    serverLog({ level: "error", event: "genesis.create.membership_insert_failed", message: "Failed to insert creator membership; program was created." });
    await logGenesis(
      "warning",
      "genesis.creator_membership_failed",
      "warning",
      "Program was generated, but creator editor membership storage failed.",
      { error: membershipErr.message },
      program.id
    );
  }

  // Link connections
  if (connectionRows.length > 0) {
    const { error: connLinkErr } = await serviceClient.from("program_connections").insert(
      toProgramConnectionLinks(program.id, connectionRows) as unknown as never
    );
    if (connLinkErr) {
      serverLog({ level: "error", event: "genesis.create.connection_link_failed", message: "Failed to link connections to generated program." });
      await logGenesis(
        "warning",
        "genesis.connection_link_failed",
        "warning",
        "Program was generated, but linking selected connections failed.",
        { error: connLinkErr.message, connection_count: connectionRows.length },
        program.id
      );
    }
  }

  // Store genesis snapshot as version 0
  const { error: versionErr } = await serviceClient.from("program_versions").insert({
    program_id: program.id,
    version: 0,
    schema: schema as unknown as Record<string, unknown>,
    change_summary: "Genesis - AI-generated from description",
  } as unknown as never);
  if (versionErr) {
    serverLog({ level: "error", event: "genesis.create.version_insert_failed", message: "Failed to store genesis version snapshot." });
    await logGenesis(
      "warning",
      "genesis.version_snapshot_failed",
      "warning",
      "Program was generated, but version snapshot storage failed.",
      { error: versionErr.message },
      program.id
    );
  }

  // Reconcile schema trigger nodes into the `triggers` table - the cron runner
  // only fires triggers that exist as rows there. Genesis used to save the
  // program without this sync, so cron triggers looked "Active" (the editor
  // reads the schema) but never fired in production.
  try {
    await syncEventTriggers(serviceClient, program.id, schema);
    await syncCronTriggers(serviceClient, program.id, schema);
    await syncWebhookTriggers(serviceClient, program.id, schema);
    await syncFileWatchTriggers(serviceClient, program.id, schema);
  } catch (syncError) {
    serverLog({
      level: "error",
      event: "genesis.create.trigger_sync_failed",
      message: "Failed to sync schema triggers after generation.",
      details: { error: syncError instanceof Error ? syncError.message : String(syncError) },
    });
  }

  await logGenesis(
    "info",
    "genesis.generation.completed",
    "completed",
    `Generated program "${schema.program_name}".`,
    {
      program_name: schema.program_name,
      requested_model: model,
      model_used: modelUsed,
      validation_errors: validation.errors.length,
      validation_warnings: validation.warnings.length,
      node_count: schema.nodes.length,
      edge_count: schema.edges.length,
      trigger_count: schema.triggers.length,
    },
    program.id
  );
  await recordGenesisUse(userId, workspaceId, { fromBonus: bonusFunded });
  return NextResponse.json({ program, schema, validation }, { status: 201 });
}
