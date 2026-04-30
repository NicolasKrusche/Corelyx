import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

// Extend Vercel serverless function timeout (300s max on Pro plan)
export const maxDuration = 300;
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { vaultRetrieve } from "@/lib/vault";
import { GENESIS_SYSTEM_PROMPT, buildGenesisUserMessage, buildRefinementUserMessage } from "@/lib/genesis/prompt";
import { extractJson, normalizeSchema } from "@/lib/genesis/parsing";
import {
  hasPiiRedactions,
  mergePiiRedactions,
  sanitizeTextForLlm,
  sanitizeValueForLlm,
} from "@/lib/privacy/pii";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import {
  getDraftValidationMessage,
  normalizeProgramDraft,
  validateProgramDraft,
} from "@/lib/workflow/normalize";
import { checkProgramLimit, checkGenesisAccess, incrementGenesisUses } from "@/lib/limits";
import { rateLimit } from "@/lib/rate-limit";
import { errorDetails, writeAppLog } from "@/lib/app-logs";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { canContributeToWorkspace, canEdit, canView, getActiveWorkspace, getProgramAccess } from "@/lib/workspaces";
import {
  GENESIS_MAX_TOKENS,
  GENESIS_TEMPERATURE,
  KEY_DEFAULT_MODELS,
  getMissingConnectionIds,
  getModelCandidates,
  getProviderBaseURL,
  mapExecutionMode,
  sortApiKeyFallbacks,
  supportsOpenAiJsonMode,
  toGenesisConnectionList,
  toProgramConnectionLinks,
  uniqueRequestedConnectionIds,
  type GenesisApiKeyRow,
  type GenesisConnectionRow,
} from "@/lib/genesis/request";

const RequestSchema = z.object({
  description: z.string().min(10).max(2000),
  connection_ids: z.array(z.string().uuid()).max(10),
  api_key_id: z.string().uuid(),
  model: z.string().min(1),
  existing_schema: z.unknown().optional(),
  refinement: z.string().max(500).optional(),
  existing_program_id: z.string().uuid().optional(),
});

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
  const parsed = RequestSchema.safeParse(body);
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

  const { description, connection_ids, api_key_id, model, existing_schema, refinement, existing_program_id } = parsed.data;
  const requestedConnectionIds = uniqueRequestedConnectionIds(connection_ids);
  const isRefinement = !!(existing_schema && refinement && existing_program_id);
  const sanitizedDescription = sanitizeTextForLlm(description);
  const sanitizedRefinement = refinement ? sanitizeTextForLlm(refinement) : null;
  const sanitizedExistingSchema = existing_schema === undefined ? null : sanitizeValueForLlm(existing_schema);
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
  const genesisCheck = await checkGenesisAccess(userId, workspaceId);
  if (!genesisCheck.allowed) {
    const upgradeMessage = genesisCheck.upgradeMessage ?? "Genesis AI limit reached.";
    await logGenesis("warning", "genesis.monthly_limit_reached", "failed", upgradeMessage);
    return NextResponse.json(
      { error: "GENESIS_LIMIT_REACHED", message: upgradeMessage },
      { status: 403 }
    );
  }

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

  // Fetch all valid API keys for the user — preferred key first, then sorted by provider suitability
  const serviceClient = createServiceClient();
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

  const keyCandidates = sortApiKeyFallbacks(api_key_id, validKeyRows);
  if (keyCandidates.length === 0) {
    return loggedApiError(
      "Selected API key not found or invalid. Refresh the page and choose another key.",
      402,
      "genesis.api_key_invalid",
      { api_key_id }
    );
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

  let rawText = "";
  let lastErr: unknown;
  let modelUsed = model;
  let usedKeyRow: GenesisApiKeyRow | null = null;
  let usedApiKey = "";
  const userMessage = isRefinement
    ? buildRefinementUserMessage(sanitizedExistingSchema?.value, sanitizedRefinement!.value, availableConnections)
    : buildGenesisUserMessage(sanitizedDescription.value, availableConnections);

  keyAttemptLoop:
  for (let keyIndex = 0; keyIndex < keyCandidates.length; keyIndex++) {
    const currentKeyRow = keyCandidates[keyIndex]!;

    let currentApiKey: string;
    try {
      currentApiKey = await vaultRetrieve(serviceClient, currentKeyRow.vault_secret_id);
    } catch (err) {
      console.warn(`[genesis] Vault retrieve failed for key ${currentKeyRow.id}:`, (err as Error).message);
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

          if (anthropic) {
            const msg = await anthropic.messages.create({
              model: candidateModel,
              max_tokens: GENESIS_MAX_TOKENS,
              temperature: GENESIS_TEMPERATURE,
              system: GENESIS_SYSTEM_PROMPT,
              messages: [{ role: "user", content: userMessage }],
            });
            rawText = msg.content[0]?.type === "text" ? (msg.content[0] as { type: "text"; text: string }).text : "";
          } else if (openai) {
            const completion = await openai.chat.completions.create({
              model: candidateModel,
              max_tokens: GENESIS_MAX_TOKENS,
              ...(supportsOpenAiJsonMode(currentKeyRow.provider, baseURL) && {
                response_format: { type: "json_object" as const },
              }),
              messages: [
                { role: "system", content: GENESIS_SYSTEM_PROMPT },
                { role: "user", content: userMessage },
              ],
            });
            rawText = completion.choices[0]?.message?.content ?? "";
          }

          if (!rawText) throw new Error(`Model returned empty response (model="${candidateModel}" may be unavailable or rate-limited)`);
          modelUsed = candidateModel;
          usedKeyRow = currentKeyRow;
          usedApiKey = currentApiKey;
          break keyAttemptLoop; // success
        } catch (err) {
          lastErr = err;

          // Key-level failure — skip remaining models for this key and try next key
          if (isKeyError(err)) {
            const errMsg = (err as Error).message ?? String(err);
            console.warn(`[genesis] Key error for provider=${currentKeyRow.provider}, trying next key:`, errMsg);
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
          console.error(`[genesis] Model call failed — provider=${currentKeyRow.provider} model=${candidateModel}:`, causeMsg ?? errMsg);
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
      console.warn("[genesis] Layer-1 parse failed — attempting jsonrepair");
      parsed_schema = JSON.parse(jsonrepair(extractJson(rawText)));
      parseOk = true;
      console.log("[genesis] jsonrepair recovered the schema");
    } catch {
      // Layer 3 — repair prompt
      console.warn("[genesis] jsonrepair failed — sending repair prompt to model");
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
            messages: [{ role: "user", content: repairPrompt }],
          });
          repairedText = repairMsg.choices[0]?.message?.content ?? "";
        }

        parsed_schema = tryParse(repairedText);
        parseOk = true;
        console.log("[genesis] repair prompt recovered the schema");
      } catch (repairErr) {
        console.error("[genesis] All three parse layers failed:", (repairErr as Error).message);
      }
    }
  }

  if (!parseOk) {
    console.error(`[genesis] Failed to parse JSON. Output length: ${rawText?.length ?? 0}`);
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

  // Normalize common model deviations before validation
  normalizeSchema(parsed_schema);
  parsed_schema = normalizeProgramDraft(parsed_schema, isRefinement && existing_schema ? existing_schema as Partial<ProgramSchema> : undefined);

  const draftResult = validateProgramDraft(parsed_schema);
  if (!draftResult.success) {
    const message = getDraftValidationMessage(draftResult.error);
    console.error("[genesis] Draft validation failed:", JSON.stringify(draftResult.error.flatten(), null, 2));
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

  // Run post-genesis validation
  const validation = validatePostGenesis(schema, connectionRows);

  // ── Refinement path: update existing program ─────────────────────────────
  if (isRefinement) {
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
    const nextVersion = (existingRow.schema_version ?? 0) + 1;
    const now = new Date().toISOString();

    const { data: updatedProgram, error: updateError } = await supabase
      .from("programs")
      .update({
        name: schema.program_name,
        schema: schema as unknown as Record<string, unknown>,
        execution_mode: mapExecutionMode(schema.execution_mode),
        schema_version: nextVersion,
        updated_at: now,
      } as unknown as never)
      .eq("id", existing_program_id!)
      .select("id, name, description, execution_mode, is_active, created_at")
      .single();

    if (updateError) {
      return loggedApiError(
        updateError.message,
        500,
        "genesis.refinement_update_failed",
        { error: updateError.message }
      );
    }

    // Store refinement snapshot
    const { error: versionErr } = await supabase.from("program_versions").insert({
      program_id: existing_program_id!,
      version: nextVersion,
      schema: schema as unknown as Record<string, unknown>,
      change_summary: `Refined — ${refinement!.slice(0, 120)}`,
    } as unknown as never);
    if (versionErr) {
      console.error("[genesis] Failed to store refinement version:", versionErr.message);
      await logGenesis(
        "warning",
        "genesis.refinement_version_snapshot_failed",
        "warning",
        "Refined program was saved, but version snapshot storage failed.",
        { error: versionErr.message },
        existing_program_id
      );
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
    await incrementGenesisUses(userId, workspaceId);
    return NextResponse.json({ program: updatedProgram, schema, validation }, { status: 200 });
  }

  // ── New program path ──────────────────────────────────────────────────────
  const { data: rawProgram, error: insertError } = await supabase
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

  // Link connections
  if (connectionRows.length > 0) {
    const { error: connLinkErr } = await supabase.from("program_connections").insert(
      toProgramConnectionLinks(program.id, connectionRows) as unknown as never
    );
    if (connLinkErr) {
      console.error("[genesis] Failed to link connections:", connLinkErr.message);
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
  const { error: versionErr } = await supabase.from("program_versions").insert({
    program_id: program.id,
    version: 0,
    schema: schema as unknown as Record<string, unknown>,
    change_summary: "Genesis - AI-generated from description",
  } as unknown as never);
  if (versionErr) {
    console.error("[genesis] Failed to store version snapshot:", versionErr.message);
    await logGenesis(
      "warning",
      "genesis.version_snapshot_failed",
      "warning",
      "Program was generated, but version snapshot storage failed.",
      { error: versionErr.message },
      program.id
    );
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
  await incrementGenesisUses(userId, workspaceId);
  return NextResponse.json({ program, schema, validation }, { status: 201 });
}
