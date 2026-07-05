import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

export const maxDuration = 300;

import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { vaultRetrieve } from "@/lib/vault";
import {
  buildAgentSystemPrompt,
  buildAgentUserMessage,
  buildGenesisSystemPrompt,
  buildGenesisUserMessage,
  buildRefinementUserMessage,
} from "@/lib/genesis/prompt";
import {
  pickEuComplianceFilterKey,
  runEuComplianceFilter,
} from "@/lib/genesis/eu-compliance";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { layoutSchema, DEFAULT_LAYOUT_DIRECTION } from "@/lib/schema/layout";
import { validatePostGenesis } from "@/lib/validation";
import {
  getDraftValidationMessage,
  normalizeProgramDraft,
  pruneUnresolvedReferences,
  validateProgramDraft,
} from "@/lib/workflow/normalize";
import { checkAgentAccess, checkProgramLimit, checkGenesisAccess, incrementGenesisUses } from "@/lib/limits";
import { rateLimit } from "@/lib/rate-limit";
import { truncateForLog, writeAppLog } from "@/lib/app-logs";
import { assignAgentNodeDefaults, extractJson, normalizeSchema } from "@/lib/genesis/parsing";
import { PartialSchemaScanner } from "@/lib/genesis/partial-schema";
import { hasPiiRedactions, PseudonymizationSession } from "@/lib/privacy/pii";
import { buildCapabilitySection, fetchConnectionCapabilities } from "@/lib/genesis/introspection";
import { getUserAiContext } from "@/lib/onboarding/profile";
import { syncCronTriggers, syncEventTriggers, syncFileWatchTriggers } from "@/lib/triggers/event-trigger-sync";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { canContributeToWorkspace, canEdit, canRunAgentInWorkspace, canView, getActiveWorkspace, getProgramAccess } from "@/lib/workspaces";
import {
  GENESIS_MAX_TOKENS,
  GENESIS_TEMPERATURE,
  GenesisRequestSchema,
  getAllowedPlatformModels,
  getMissingConnectionIds,
  getModelCandidates,
  getProviderBaseURL,
  isGenesisRefinementRequest,
  isKeyError,
  isPromptTooLarge,
  isRetryableModelError,
  KEY_DEFAULT_MODELS,
  mapExecutionMode,
  PLATFORM_DEFAULT_MODEL,
  sortApiKeyFallbacks,
  supportsOpenAiJsonMode,
  toGenesisConnectionList,
  toProgramConnectionLinks,
  uniqueRequestedConnectionIds,
  type GenesisApiKeyRow,
  type GenesisConnectionRow,
} from "@/lib/genesis/request";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";

// Default platform model — used when the user hasn't picked one.
// Paid-tier users may override this via the `model` field in the request.
const PLATFORM_MODEL = PLATFORM_DEFAULT_MODEL;

type StreamEvent =
  | { type: "meta"; program_name: string }
  | { type: "node"; node: unknown }
  | { type: "edge"; edge: unknown }
  | { type: "status"; message: string }
  | { type: "done"; program_id: string; program_name: string; validation: unknown; schema?: unknown }
  | { type: "error"; message: string; code?: string };

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const userId = user.id;

  // Stage 0: body parse + processing restriction check are independent — run in parallel
  const [processingRestriction, body] = await Promise.all([
    ensureProcessingAllowed(userId),
    request.json().catch(() => null),
  ]);
  if (processingRestriction) return processingRestriction;

  const parsed = GenesisRequestSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { description, connection_ids, api_key_id, use_platform_key } = parsed.data;
  const isRefinement = isGenesisRefinementRequest(parsed.data);
  // One-time agent generation. Mutually exclusive with refinement in practice —
  // refinement always edits an existing (workflow) program.
  const isAgent = parsed.data.program_type === "agent" && !isRefinement;
  const refinementText = parsed.data.refinement ?? null;
  const existingSchemaRaw = parsed.data.existing_schema ?? null;
  const usePlatformKey = use_platform_key === true;

  if (!usePlatformKey && !api_key_id) {
    return apiError("api_key_id is required when not using the platform key", 400);
  }

  // Resolve the model to use.
  // Platform-key path: paid users may supply a `model` override; free users are
  // locked to the default. BYOK path: `model` is always required by the schema.
  let model: string;
  if (usePlatformKey) {
    const requestedModel = parsed.data.model;
    if (requestedModel && requestedModel !== PLATFORM_MODEL) {
      // Validate the requested model against the user's tier
      const tier = await getUserTier(userId);
      const ent = getEntitlements(tier);
      const allowed = getAllowedPlatformModels(ent.genesisPlatformModelTier);
      if (!allowed.some((m) => m.id === requestedModel)) {
        return apiError(
          `Model "${requestedModel}" is not available on your current plan. Upgrade to Solo or higher to access premium models.`,
          403
        );
      }
      model = requestedModel;
    } else {
      model = PLATFORM_MODEL;
    }
  } else {
    model = parsed.data.model ?? "claude-sonnet-4-6";
  }
  const requestedConnectionIds = uniqueRequestedConnectionIds(connection_ids);
  const startedAt = Date.now();
  // For refinements, run compliance on what the user actually typed (the edit instruction),
  // not the program name which is passed as description in that mode.
  // One reversible session per request: the model sees stable [EMAIL_1]-style
  // placeholders; streamed nodes/edges and the final schema are rehydrated.
  const piiSession = new PseudonymizationSession();
  const sanitizedDescription = piiSession.sanitizeText(isRefinement && refinementText ? refinementText : description);
  // The existing schema also goes to the model on refinements — sanitize it
  // with the same session so its PII round-trips as placeholders too.
  const sanitizedExistingSchema = existingSchemaRaw === null ? null : piiSession.sanitizeValue(existingSchemaRaw);
  const serviceClient = createServiceClient();

  // Stage 1: rate limit and workspace resolution. Refinements use the program's
  // workspace, not whichever workspace is currently active in the sidebar.
  const rateLimitPassed = await rateLimit(`genesis:${userId}`, 10, 60_000);

  if (!rateLimitPassed) return sseErrorResponse("Too many requests. Please wait a moment and try again.", "RATE_LIMITED");

  let workspaceId: string;
  if (isRefinement) {
    const access = await getProgramAccess(parsed.data.existing_program_id!, userId);
    if (!canView(access)) return sseErrorResponse("Program not found", "PROGRAM_NOT_FOUND");
    if (!canEdit(access)) return sseErrorResponse("Only program editors can refine.", "FORBIDDEN");
    workspaceId = access!.workspaceId;
  } else {
    const ws = await getActiveWorkspace(userId);
    if (!ws) return sseErrorResponse("No active workspace", "NO_WORKSPACE");
    if (!canContributeToWorkspace(ws.role)) return sseErrorResponse("Viewers cannot generate programs.", "FORBIDDEN");
    workspaceId = ws.workspaceId;

    // Agents are a Solo+ feature — block building one on the Free plan before we
    // spend a Genesis use creating something that could never run.
    if (isAgent) {
      const agentAccess = await checkAgentAccess(userId, workspaceId);
      if (!agentAccess.allowed) {
        return sseErrorResponse(
          agentAccess.upgradeMessage ?? "Agents require an upgrade.",
          "AGENTS_REQUIRE_UPGRADE"
        );
      }
    }

    // Agents act on the workspace, so creating one requires agent permission
    // here (owner always allowed; others need the workspace's external-agent
    // setting + minimum role). Fail fast rather than create an unrunnable agent.
    if (isAgent && !(await canRunAgentInWorkspace(workspaceId, userId))) {
      return sseErrorResponse(
        "You don't have permission to run agents in this workspace.",
        "AGENT_FORBIDDEN"
      );
    }
  }

  // Stage 2: genesis limit, program limit, connections, and API keys all need workspaceId — run in parallel
  const pendingConnections = requestedConnectionIds.length > 0
    ? supabase.from("connections").select("id, name, provider, scopes")
        .in("id", requestedConnectionIds).eq("workspace_id", workspaceId).eq("is_valid", true)
    : Promise.resolve({ data: [] as Array<{ id: string; name: string; provider: string; scopes: string[] | null }>, error: null });

  const pendingApiKeys = usePlatformKey
    ? Promise.resolve({ data: null as null, error: null })
    : serviceClient.from("api_keys").select("id, vault_secret_id, provider")
        .eq("workspace_id", workspaceId).eq("is_valid", true);

  const [genesisCheck, limitCheck, connResult, keysResult, userProfileContext] = await Promise.all([
    checkGenesisAccess(userId, workspaceId),
    isRefinement ? Promise.resolve({ allowed: true, upgradeMessage: null }) : checkProgramLimit(userId, workspaceId),
    pendingConnections,
    pendingApiKeys,
    // Consent-gated onboarding background (full summary with consent, anonymized
    // categories otherwise) — personalizes generated workflows/agents.
    getUserAiContext(serviceClient as unknown as { from(table: string): any }, userId).catch(() => null),
  ]);

  if (!genesisCheck.allowed) return sseErrorResponse(genesisCheck.upgradeMessage ?? "Genesis AI limit reached.", "GENESIS_LIMIT_REACHED");
  if (!limitCheck.allowed) return sseErrorResponse(limitCheck.upgradeMessage ?? "Program limit reached.", "PROGRAM_LIMIT_REACHED");

  // Resolve connections
  let connections: GenesisConnectionRow[] = [];
  if (requestedConnectionIds.length > 0) {
    const { data: rawConnections, error: connError } = connResult;
    if (connError) return sseErrorResponse("Could not verify selected connections.", "CONNECTION_LOOKUP_FAILED");
    connections = (rawConnections ?? []) as unknown as GenesisConnectionRow[];
    const missingConnectionIds = getMissingConnectionIds(requestedConnectionIds, connections);
    if (missingConnectionIds.length > 0) {
      return sseErrorResponse(
        "One or more selected connections are unavailable. Refresh the page and choose valid connections.",
        "CONNECTIONS_INVALID"
      );
    }
  }

  const availableConnections = toGenesisConnectionList(connections);

  // Genesis V2: introspect the selected connections for live, metadata-only
  // capability data. User-named strings are registered with piiSession — only
  // placeholders reach the prompt. Failures fall back to the static catalog.
  let capabilitySection: string | null = null;
  if (connections.length > 0 && !isAgent) {
    const descriptors = await fetchConnectionCapabilities(
      connections.map((row) => row.id),
      userId
    );
    capabilitySection = buildCapabilitySection(descriptors, connections, piiSession);
  }

  // Align user-typed references to introspected resources with the same
  // placeholders used in the capability section (identity without the name).
  const groundedDescription = piiSession.applyKnownValues(sanitizedDescription.value);
  const groundedExistingSchema = sanitizedExistingSchema === null
    ? null
    : sanitizedExistingSchema.value;

  const selectedProviders = availableConnections.map((conn) => conn.type);
  const providersForPrompt = selectedProviders.length > 0 ? selectedProviders : null;
  const genesisSystemPrompt = isAgent
    ? buildAgentSystemPrompt(providersForPrompt)
    : buildGenesisSystemPrompt(providersForPrompt, null, capabilitySection);

  // Resolve API keys
  let keyCandidates: GenesisApiKeyRow[];

  if (usePlatformKey) {
    // Streaming builds consume the plan's Genesis-use allowance. Platform
    // credits remain metered for workflow execution and editor refinements.
    const platformRawKey = process.env.PLATFORM_OPENROUTER_API_KEY ?? "";
    if (!platformRawKey) return sseErrorResponse("Platform AI key is not available.", "PLATFORM_KEY_UNAVAILABLE");
    keyCandidates = [{ id: "platform", vault_secret_id: platformRawKey, provider: "openrouter" }];
  } else {
    const { data: allKeyRows, error: keysError } = keysResult;
    const validKeyRows = (allKeyRows ?? []) as unknown as GenesisApiKeyRow[];
    if (keysError || validKeyRows.length === 0) {
      return sseErrorResponse("API key not found. Please add a valid API key.", "API_KEY_INVALID");
    }
    keyCandidates = sortApiKeyFallbacks(api_key_id!, validKeyRows);
    if (keyCandidates.length === 0) {
      return sseErrorResponse("Selected API key not found or invalid.", "API_KEY_INVALID");
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const scanner = new PartialSchemaScanner();

      const pushChunk = (chunk: string) => {
        const delta = scanner.feed(chunk);
        // Live-preview events carry model output → rehydrate placeholders so
        // the user reviews the real values, not [EMAIL_1].
        if (delta.programName) send({ type: "meta", program_name: piiSession.rehydrateText(delta.programName) });
        for (const node of delta.newNodes) send({ type: "node", node: piiSession.rehydrateValue(node) });
        for (const edge of delta.newEdges) send({ type: "edge", edge: piiSession.rehydrateValue(edge) });
      };

      let rawText = "";
      let modelUsed = model;
      // Hoisted so the catch block can check whether an abort was compliance-triggered.
      let complianceBlockReason: string | null = null;

      try {
        // EU compliance filter runs in parallel with generation.
        // If it returns a hard "blocked" verdict, the AbortController cancels the active LLM call.
        const ac = new AbortController();
        const compliancePromise: Promise<import("@/lib/genesis/eu-compliance").EuComplianceResult | null> = (async () => {
          try {
            const filterKeyRow = pickEuComplianceFilterKey(keyCandidates);
            if (!filterKeyRow) return null;
            const filterApiKey = filterKeyRow.id === "platform"
              ? filterKeyRow.vault_secret_id
              : await vaultRetrieve(serviceClient, filterKeyRow.vault_secret_id);
            const result = await runEuComplianceFilter(groundedDescription, filterKeyRow, filterApiKey);
            if (result?.verdict === "blocked") {
              complianceBlockReason = result.blockedReason;
              ac.abort();
            }
            return result ?? null;
          } catch {
            return null;
          }
        })();

        send({ type: "status", message: "Contacting model..." });

        // Refinement previously sent the raw edit text + schema to the model;
        // both now go through the same pseudonymization session as generation.
        const userMessage = isRefinement && refinementText && groundedExistingSchema
          ? buildRefinementUserMessage(groundedDescription, groundedExistingSchema as object, availableConnections)
          : isAgent
            ? buildAgentUserMessage(groundedDescription, availableConnections, null, userProfileContext)
            : buildGenesisUserMessage(groundedDescription, availableConnections, null, userProfileContext);

        keyAttemptLoop:
        for (let keyIndex = 0; keyIndex < keyCandidates.length; keyIndex += 1) {
          const currentKeyRow = keyCandidates[keyIndex]!;

          let currentApiKey: string;
          try {
            currentApiKey = currentKeyRow.id === "platform"
              ? currentKeyRow.vault_secret_id
              : await vaultRetrieve(serviceClient, currentKeyRow.vault_secret_id);
          } catch {
            continue;
          }

          const effectiveModel = keyIndex === 0 ? model : (KEY_DEFAULT_MODELS[currentKeyRow.provider] ?? model);
          const modelCandidates = getModelCandidates(currentKeyRow.provider, effectiveModel);

          for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
            const candidateModel = modelCandidates[modelIndex] ?? model;
            rawText = "";

            try {
              if (currentKeyRow.provider === "anthropic") {
                const anthropic = new Anthropic({ apiKey: currentApiKey });
                const msgStream = anthropic.messages.stream({
                  model: candidateModel,
                  max_tokens: GENESIS_MAX_TOKENS,
                  temperature: GENESIS_TEMPERATURE,
                  system: genesisSystemPrompt,
                  messages: [{ role: "user", content: userMessage }],
                }, { signal: ac.signal });

                msgStream.on("text", (textDelta) => {
                  rawText += textDelta;
                  pushChunk(textDelta);
                });

                const final = await msgStream.finalMessage();
                if (!rawText && final.content[0]?.type === "text") {
                  rawText = (final.content[0] as { type: "text"; text: string }).text;
                }
              } else {
                const baseURL = getProviderBaseURL(currentKeyRow.provider);
                const openai = new OpenAI({ apiKey: currentApiKey, ...(baseURL && { baseURL }), timeout: 240_000 });
                const openaiStream = await openai.chat.completions.create({
                  model: candidateModel,
                  max_tokens: GENESIS_MAX_TOKENS,
                  stream: true,
                  ...(supportsOpenAiJsonMode(currentKeyRow.provider, baseURL) && {
                    response_format: { type: "json_object" as const },
                  }),
                  messages: [
                    { role: "system", content: genesisSystemPrompt },
                    { role: "user", content: userMessage },
                  ],
                }, { signal: ac.signal });

                for await (const chunk of openaiStream) {
                  const piece = chunk.choices[0]?.delta?.content ?? "";
                  if (piece) {
                    rawText += piece;
                    pushChunk(piece);
                  }
                }
              }

              if (!rawText) {
                if (modelIndex < modelCandidates.length - 1) {
                  const nextModel = modelCandidates[modelIndex + 1] ?? "fallback model";
                  send({ type: "status", message: `Model returned no output; trying ${nextModel}...` });
                  continue;
                }
                throw new Error("The AI did not respond. Please try again in a moment.");
              }

              modelUsed = candidateModel;
              break keyAttemptLoop;
            } catch (err) {
              const canModelFallback =
                rawText.length === 0 &&
                modelIndex < modelCandidates.length - 1;

              if (canModelFallback) {
                const nextModel = modelCandidates[modelIndex + 1] ?? "fallback model";
                send({ type: "status", message: `Model unavailable; trying ${nextModel}...` });
                continue;
              }

              const nextKey = keyCandidates[keyIndex + 1];
              if (rawText.length === 0 && nextKey) {
                send({ type: "status", message: `Key failed; trying fallback key...` });
                continue keyAttemptLoop;
              }

              throw err;
            }
          }
        }

        // Emit any trailing nodes/edges the streaming pass was holding back
        const finalDelta = scanner.finalize();
        if (finalDelta.programName) send({ type: "meta", program_name: piiSession.rehydrateText(finalDelta.programName) });
        for (const node of finalDelta.newNodes) send({ type: "node", node: piiSession.rehydrateValue(node) });
        for (const edge of finalDelta.newEdges) send({ type: "edge", edge: piiSession.rehydrateValue(edge) });

        if (!rawText) throw new Error("The AI did not respond. Please try again in a moment.");

        send({ type: "status", message: "Validating schema..." });

        // Detect likely token-limit truncation: the response has content but the
        // JSON object was never closed. jsonrepair will close it, but the result
        // will be a stripped-down schema that fails validation anyway — so surface
        // a more useful message immediately instead of going through that loop.
        const trimmedRaw = rawText.trimEnd();
        const looksLikeTruncation =
          trimmedRaw.length > 200 &&
          !trimmedRaw.endsWith("}") &&
          !trimmedRaw.endsWith("]") &&
          trimmedRaw.includes("{");

        // Full parse with three-layer recovery
        let parsedSchema: unknown;
        try {
          parsedSchema = JSON.parse(extractJson(rawText));
        } catch {
          try {
            parsedSchema = JSON.parse(jsonrepair(extractJson(rawText)));
          } catch {
            if (looksLikeTruncation) {
              throw new Error(
                "Your description produced a workflow too large to generate in one pass. Try breaking it into smaller steps or simplifying the description."
              );
            }
            throw new Error(
              "The AI returned a response we could not use. Try rephrasing your description and generating again."
            );
          }
        }

        // Put the real values back into the parsed schema (the model only ever
        // saw placeholders), so the saved workflow is configured with usable data.
        parsedSchema = piiSession.rehydrateValue(parsedSchema);

        if (parsedSchema && typeof parsedSchema === "object" && "error" in parsedSchema) {
          const genesisError = parsedSchema as Record<string, unknown>;
          throw new Error(
            typeof genesisError.message === "string"
              ? genesisError.message
              : "Genesis model reported it could not generate this program."
          );
        }

        if (
          parsedSchema &&
          typeof parsedSchema === "object" &&
          "program_id" in parsedSchema &&
          (parsedSchema as Record<string, unknown>).program_id === "__GENERATED__"
        ) {
          (parsedSchema as Record<string, unknown>).program_id = crypto.randomUUID();
        }

        // Stamp the agent discriminator BEFORE normalizeSchema: its corelyx
        // connection-node repair (a bogus "corelyx:primary" connection rewritten
        // into a report_to_user agent_task) only fires when program_type ===
        // "agent". The model often omits program_type, so without setting it
        // first the repair was skipped and the broken connection ref reached the
        // runtime, failing every agent run with "corelyx is not a connectable app".
        if (isAgent) (parsedSchema as { program_type?: string }).program_type = "agent";
        normalizeSchema(parsedSchema);
        parsedSchema = normalizeProgramDraft(
          parsedSchema,
          isRefinement && existingSchemaRaw && typeof existingSchemaRaw === "object"
            ? (existingSchemaRaw as Partial<ProgramSchema>)
            : undefined
        );
        // Re-assert after normalizeProgramDraft in case the draft merge dropped
        // it: agent programs use agent_task nodes, which ProgramDraftSchemaZ only
        // permits when program_type === "agent".
        if (isAgent) (parsedSchema as { program_type?: string }).program_type = "agent";
        // The model occasionally emits an edge to a node it renamed or never
        // produced. A single dangling reference would otherwise fail the whole
        // draft and force the user to "rephrase" an almost-valid plan. Prune
        // those before validating — the user reviews the plan before it runs.
        const pruned = pruneUnresolvedReferences(parsedSchema as ProgramSchema);
        if (pruned.removedEdges > 0 || pruned.removedTriggers > 0) {
          await writeAppLog(supabase, {
            userId,
            level: "info",
            source: "Genesis",
            event: "genesis.stream.pruned_unresolved_references",
            status: "completed",
            message: "Removed edges/triggers referencing missing nodes from generated draft.",
            durationMs: Date.now() - startedAt,
            details: {
              requested_model: model,
              model_used: modelUsed,
              removed_edges: pruned.removedEdges,
              removed_triggers: pruned.removedTriggers,
            },
          });
        }
        // Fill "__USER_ASSIGNED__" agent model/key sentinels with a usable
        // workspace key so generated agent nodes don't fail pre-flight.
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
          assignAgentNodeDefaults(parsedSchema, assignableKeys);
        }

        const draftResult = validateProgramDraft(parsedSchema);
        if (!draftResult.success) {
          // Log the technical details server-side; send a user-friendly message downstream.
          await writeAppLog(supabase, {
            userId,
            level: "warning",
            source: "Genesis",
            event: "genesis.stream.draft_validation_failed",
            status: "failed",
            message: "Draft validation failed after streaming generation.",
            durationMs: Date.now() - startedAt,
            details: {
              requested_model: model,
              model_used: modelUsed,
              validation_errors: draftResult.error.flatten(),
            },
          });
          const hint = looksLikeTruncation
            ? "Try a simpler description — the workflow may have been too large to generate in one pass."
            : "Try rephrasing your description to be more specific about the steps involved.";
          throw new Error(`The AI generated a workflow we could not validate. ${hint}`);
        }
        const schemaResult = ProgramSchemaZ.safeParse(parsedSchema);
        const schema = schemaResult.success ? schemaResult.data : draftResult.data;
        // Keep the stored schema's discriminator aligned with the column even if
        // the model forgot to emit program_type.
        if (isAgent) (schema as { program_type?: string }).program_type = "agent";
        const validation = validatePostGenesis(schema as unknown as Parameters<typeof validatePostGenesis>[0], connections);

        // Await compliance before saving — catches late-arriving blocks if generation
        // finished faster than the compliance model responded.
        const complianceResult = await compliancePromise;
        if (complianceBlockReason) {
          throw new Error(`This workflow was blocked by EU compliance: ${complianceBlockReason}`);
        }

        const complianceObligations = complianceResult?.verdict === "obligations" ? complianceResult.context : null;

        if (isRefinement) {
          // Refinement (AI edit): return the updated schema to the client.
          // The editor applies it via RESTORE_VERSION and handles its own save.
          send({
            type: "done",
            program_id: parsed.data.existing_program_id ?? "",
            program_name: schema.program_name,
            validation,
            schema,
          });

          await Promise.all([
            writeAppLog(supabase, {
              userId,
              level: "info",
              source: "Genesis",
              event: "genesis.stream.refinement.completed",
              status: "completed",
              message: `AI edit applied to "${schema.program_name}".`,
              durationMs: Date.now() - startedAt,
              details: {
                requested_model: model,
                model_used: modelUsed,
                node_count: schema.nodes.length,
                edge_count: schema.edges.length,
                validation_errors: validation.errors.length,
                validation_warnings: validation.warnings.length,
              },
            }),
            incrementGenesisUses(userId, workspaceId),
          ]);
        } else {
          send({ type: "status", message: "Saving program..." });

          // The model is unreliable at computing node coordinates, so it tends to
          // emit a straight line. Lay the graph out deterministically (branches and
          // all) before persisting, using the caller's preferred orientation.
          const layoutDirection = parsed.data.layout_direction ?? DEFAULT_LAYOUT_DIRECTION;
          const savedSchema = {
            ...schema,
            nodes: layoutSchema(schema.nodes, schema.edges, layoutDirection),
          };

          const { data: rawProgram, error: insertError } = await serviceClient
            .from("programs")
            .insert({
              user_id: userId,
              workspace_id: workspaceId,
              name: savedSchema.program_name,
              description,
              schema: savedSchema as unknown as Record<string, unknown>,
              execution_mode: mapExecutionMode(savedSchema.execution_mode),
              ...(complianceObligations ? { ai_act_notes: complianceObligations } : {}),
              // One-time agents are created paused, awaiting the user's approval
              // of the plan before they may run.
              ...(isAgent
                ? { program_type: "agent", agent_state: "awaiting_approval" }
                : {}),
            } as unknown as never)
            .select("id, name")
            .single();

          const program = rawProgram as unknown as { id: string; name: string } | null;

          if (insertError || !program) {
            throw new Error("The workflow was generated but could not be saved. Please try again.");
          }

          const postSaveResults = await Promise.all([
            serviceClient.from("program_memberships").insert({
              program_id: program.id,
              user_id: userId,
              role: "editor",
              created_by: userId,
            } as unknown as never),
            connections.length > 0
              ? serviceClient.from("program_connections").insert(
                  toProgramConnectionLinks(program.id, connections) as unknown as never
                )
              : Promise.resolve({ error: null }),
            serviceClient.from("program_versions").insert({
              program_id: program.id,
              version: 0,
              schema: savedSchema as unknown as Record<string, unknown>,
              change_summary: "Genesis — AI-generated from description",
            } as unknown as never),
          ]);

          if (connections.length > 0 && postSaveResults[1].error) {
            throw new Error("The workflow was saved but we could not link your connections to it. You can add them manually in the editor.");
          }

          // Reconcile schema trigger nodes into the `triggers` table — the cron
          // runner only fires triggers that exist as rows there. Genesis used to
          // save the program without this sync, so cron triggers looked "Active"
          // (the editor reads the schema) but never fired in production.
          try {
            await syncEventTriggers(serviceClient, program.id, savedSchema);
            await syncCronTriggers(serviceClient, program.id, savedSchema);
            await syncFileWatchTriggers(serviceClient, program.id, savedSchema);
          } catch (syncError) {
            await writeAppLog(supabase, {
              userId,
              level: "error",
              source: "Genesis",
              event: "genesis.stream.trigger_sync_failed",
              status: "failed",
              message: "Failed to sync schema triggers after streaming generation.",
              programId: program.id,
              details: { error: syncError instanceof Error ? syncError.message : String(syncError) },
            });
          }

          send({
            type: "done",
            program_id: program.id,
            program_name: schema.program_name,
            validation,
          });

          await Promise.all([
            writeAppLog(supabase, {
              userId,
              level: "info",
              source: "Genesis",
              event: "genesis.stream.completed",
              status: "completed",
              message: `Generated program "${schema.program_name}" via streaming.`,
              programId: program.id,
              durationMs: Date.now() - startedAt,
              details: {
                requested_model: model,
                model_used: modelUsed,
                node_count: schema.nodes.length,
                edge_count: schema.edges.length,
                validation_errors: validation.errors.length,
                validation_warnings: validation.warnings.length,
                pii_redacted: sanitizedDescription.redacted,
                pii_redactions: sanitizedDescription.redactions,
              },
            }),
            incrementGenesisUses(userId, workspaceId),
          ]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (complianceBlockReason) {
          send({ type: "error", message, code: "EU_COMPLIANCE_BLOCKED" });
        } else {
          await writeAppLog(supabase, {
            userId,
            level: "error",
            source: "Genesis",
            event: "genesis.stream.failed",
            status: "failed",
            message,
            durationMs: Date.now() - startedAt,
            details: {
              requested_model: model,
              model_used: modelUsed,
              description: truncateForLog(sanitizedDescription.value, 1000),
              raw_preview: truncateForLog(piiSession.sanitizeText(rawText).value, 2000),
              pii_redacted: hasPiiRedactions(sanitizedDescription.redactions),
              pii_redactions: sanitizedDescription.redactions,
            },
          });
          // A stale/removed model slug returns "404 No endpoints found" and a
          // busy free tier returns rate-limit/overloaded errors. Surface an
          // actionable message instead of the raw provider 404 — the technical
          // detail is preserved in the app log above.
          const userMessage =
            !isKeyError(err) && isRetryableModelError(err)
              ? usePlatformKey
                ? "The AI model is temporarily unavailable or busy. Please try again in a moment, or pick a different model."
                : "The selected AI model is temporarily unavailable or busy. Please try again, or choose a different model in API Keys."
              : message;
          send({ type: "error", message: userMessage });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sseErrorResponse(message: string, code: string) {
  const encoder = new TextEncoder();
  const event: StreamEvent = { type: "error", message, code };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
