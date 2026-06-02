import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

export const maxDuration = 300;

import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { vaultRetrieve } from "@/lib/vault";
import { buildGenesisSystemPrompt, buildGenesisUserMessage, buildRefinementUserMessage } from "@/lib/genesis/prompt";
import {
  pickEuComplianceFilterKey,
  runEuComplianceFilter,
} from "@/lib/genesis/eu-compliance";
import { ProgramSchemaZ } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import {
  getDraftValidationMessage,
  normalizeProgramDraft,
  validateProgramDraft,
} from "@/lib/workflow/normalize";
import { checkProgramLimit, checkGenesisAccess, incrementGenesisUses } from "@/lib/limits";
import { rateLimit } from "@/lib/rate-limit";
import { truncateForLog, writeAppLog } from "@/lib/app-logs";
import { extractJson, normalizeSchema } from "@/lib/genesis/parsing";
import { PartialSchemaScanner } from "@/lib/genesis/partial-schema";
import { hasPiiRedactions, sanitizeTextForLlm } from "@/lib/privacy/pii";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { canContributeToWorkspace, getActiveWorkspace } from "@/lib/workspaces";
import {
  GENESIS_MAX_TOKENS,
  GENESIS_TEMPERATURE,
  getAllowedPlatformModels,
  getMissingConnectionIds,
  getModelCandidates,
  getProviderBaseURL,
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

const RequestSchema = z.object({
  description: z.string().min(1).max(2000),
  connection_ids: z.array(z.string().uuid()).max(10),
  api_key_id: z.string().uuid().optional(),
  use_platform_key: z.boolean().optional(),
  model: z.string().min(1).optional(),
  // Refinement (AI edit) mode — all three must be present together
  existing_schema: z.unknown().optional(),
  refinement: z.string().min(1).max(2000).optional(),
  existing_program_id: z.string().uuid().optional(),
}).refine(
  (d) => d.use_platform_key === true || (!!d.api_key_id && !!d.model),
  { message: "Either use_platform_key or both api_key_id and model are required" }
);

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

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { description, connection_ids, api_key_id, use_platform_key } = parsed.data;
  const isRefinement = !!parsed.data.refinement && !!parsed.data.existing_schema;
  const refinementText = parsed.data.refinement ?? null;
  const existingSchemaRaw = parsed.data.existing_schema ?? null;
  const usePlatformKey = use_platform_key === true;

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
    model = parsed.data.model!;
  }
  const requestedConnectionIds = uniqueRequestedConnectionIds(connection_ids);
  const startedAt = Date.now();
  // For refinements, run compliance on what the user actually typed (the edit instruction),
  // not the program name which is passed as description in that mode.
  const sanitizedDescription = sanitizeTextForLlm(isRefinement && refinementText ? refinementText : description);
  const serviceClient = createServiceClient();

  // Stage 1: rate limit + workspace lookup are independent
  const [rateLimitPassed, ws] = await Promise.all([
    rateLimit(`genesis:${userId}`, 10, 60_000),
    getActiveWorkspace(userId),
  ]);

  if (!rateLimitPassed) return sseErrorResponse("Too many requests. Please wait a moment and try again.", "RATE_LIMITED");
  if (!ws) return sseErrorResponse("No active workspace", "NO_WORKSPACE");
  if (!canContributeToWorkspace(ws.role)) return sseErrorResponse("Viewers cannot generate programs.", "FORBIDDEN");

  const workspaceId = ws.workspaceId;

  // Stage 2: genesis limit, program limit, connections, and API keys all need workspaceId — run in parallel
  const pendingConnections = requestedConnectionIds.length > 0
    ? supabase.from("connections").select("id, name, provider, scopes")
        .in("id", requestedConnectionIds).eq("workspace_id", workspaceId).eq("is_valid", true)
    : Promise.resolve({ data: [] as Array<{ id: string; name: string; provider: string; scopes: string[] | null }>, error: null });

  const pendingApiKeys = usePlatformKey
    ? Promise.resolve({ data: null as null, error: null })
    : serviceClient.from("api_keys").select("id, vault_secret_id, provider")
        .eq("workspace_id", workspaceId).eq("is_valid", true);

  const [genesisCheck, limitCheck, connResult, keysResult] = await Promise.all([
    checkGenesisAccess(userId, workspaceId),
    isRefinement ? Promise.resolve({ allowed: true, upgradeMessage: null }) : checkProgramLimit(userId, workspaceId),
    pendingConnections,
    pendingApiKeys,
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
  const selectedProviders = availableConnections.map((conn) => conn.type);
  const genesisSystemPrompt = buildGenesisSystemPrompt(selectedProviders.length > 0 ? selectedProviders : null);

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
        if (delta.programName) send({ type: "meta", program_name: delta.programName });
        for (const node of delta.newNodes) send({ type: "node", node });
        for (const edge of delta.newEdges) send({ type: "edge", edge });
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
            const result = await runEuComplianceFilter(sanitizedDescription.value, filterKeyRow, filterApiKey);
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

        const userMessage = isRefinement && refinementText && existingSchemaRaw
          ? buildRefinementUserMessage(refinementText, existingSchemaRaw as object, availableConnections)
          : buildGenesisUserMessage(sanitizedDescription.value, availableConnections, null);

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
        if (finalDelta.programName) send({ type: "meta", program_name: finalDelta.programName });
        for (const node of finalDelta.newNodes) send({ type: "node", node });
        for (const edge of finalDelta.newEdges) send({ type: "edge", edge });

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

        normalizeSchema(parsedSchema);
        parsedSchema = normalizeProgramDraft(parsedSchema);
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

          const { data: rawProgram, error: insertError } = await serviceClient
            .from("programs")
            .insert({
              user_id: userId,
              workspace_id: workspaceId,
              name: schema.program_name,
              description,
              schema: schema as unknown as Record<string, unknown>,
              execution_mode: mapExecutionMode(schema.execution_mode),
              ...(complianceObligations ? { ai_act_notes: complianceObligations } : {}),
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
              schema: schema as unknown as Record<string, unknown>,
              change_summary: "Genesis — AI-generated from description",
            } as unknown as never),
          ]);

          if (connections.length > 0 && postSaveResults[1].error) {
            throw new Error("The workflow was saved but we could not link your connections to it. You can add them manually in the editor.");
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
              raw_preview: truncateForLog(sanitizeTextForLlm(rawText).value, 2000),
              pii_redacted: hasPiiRedactions(sanitizedDescription.redactions),
              pii_redactions: sanitizedDescription.redactions,
            },
          });
          send({ type: "error", message });
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
