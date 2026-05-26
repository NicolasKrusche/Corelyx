import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

export const maxDuration = 300;

import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { vaultRetrieve } from "@/lib/vault";
import { buildGenesisSystemPrompt, buildGenesisUserMessage } from "@/lib/genesis/prompt";
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
import { getUserCreditBalance, deductUserCredits } from "@/lib/credits";
import {
  GENESIS_MAX_TOKENS,
  GENESIS_TEMPERATURE,
  getMissingConnectionIds,
  getModelCandidates,
  getProviderBaseURL,
  isKeyError,
  isPromptTooLarge,
  isRetryableModelError,
  KEY_DEFAULT_MODELS,
  mapExecutionMode,
  sortApiKeyFallbacks,
  supportsOpenAiJsonMode,
  toGenesisConnectionList,
  toProgramConnectionLinks,
  uniqueRequestedConnectionIds,
  type GenesisApiKeyRow,
  type GenesisConnectionRow,
} from "@/lib/genesis/request";

const GENESIS_PLATFORM_RATE_USD = 2.0;
const PLATFORM_MODEL = "anthropic/claude-sonnet-4-6";

const RequestSchema = z.object({
  description: z.string().min(10).max(2000),
  connection_ids: z.array(z.string().uuid()).max(10),
  api_key_id: z.string().uuid().optional(),
  use_platform_key: z.boolean().optional(),
  model: z.string().min(1).optional(),
}).refine(
  (d) => d.use_platform_key === true || (!!d.api_key_id && !!d.model),
  { message: "Either use_platform_key or both api_key_id and model are required" }
);

type StreamEvent =
  | { type: "meta"; program_name: string }
  | { type: "node"; node: unknown }
  | { type: "edge"; edge: unknown }
  | { type: "status"; message: string }
  | { type: "done"; program_id: string; program_name: string; validation: unknown }
  | { type: "error"; message: string; code?: string };

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const userId = user.id;

  const processingRestriction = await ensureProcessingAllowed(userId);
  if (processingRestriction) return processingRestriction;

  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { description, connection_ids, api_key_id, use_platform_key } = parsed.data;
  const usePlatformKey = use_platform_key === true;
  const model = usePlatformKey ? PLATFORM_MODEL : parsed.data.model!;
  const requestedConnectionIds = uniqueRequestedConnectionIds(connection_ids);
  const startedAt = Date.now();
  const sanitizedDescription = sanitizeTextForLlm(description);

  // Rate limit
  if (!(await rateLimit(`genesis:${userId}`, 10, 60_000))) {
    return sseErrorResponse("Too many requests. Please wait a moment and try again.", "RATE_LIMITED");
  }

  // Active workspace
  const ws = await getActiveWorkspace(userId);
  if (!ws) return sseErrorResponse("No active workspace", "NO_WORKSPACE");
  if (!canContributeToWorkspace(ws.role)) {
    return sseErrorResponse("Viewers cannot generate programs.", "FORBIDDEN");
  }
  const workspaceId = ws.workspaceId;

  // Genesis AI monthly limit
  const genesisCheck = await checkGenesisAccess(userId, workspaceId);
  if (!genesisCheck.allowed) {
    return sseErrorResponse(genesisCheck.upgradeMessage ?? "Genesis AI limit reached.", "GENESIS_LIMIT_REACHED");
  }

  // Program limit
  const limitCheck = await checkProgramLimit(userId, workspaceId);
  if (!limitCheck.allowed) {
    return sseErrorResponse(limitCheck.upgradeMessage ?? "Program limit reached.", "PROGRAM_LIMIT_REACHED");
  }

  // Fetch connections
  let connections: GenesisConnectionRow[] = [];
  if (requestedConnectionIds.length > 0) {
    const { data: rawConnections, error: connError } = await supabase
      .from("connections")
      .select("id, name, provider, scopes")
      .in("id", requestedConnectionIds)
      .eq("workspace_id", workspaceId)
      .eq("is_valid", true);

    if (connError) {
      return sseErrorResponse("Could not verify selected connections.", "CONNECTION_LOOKUP_FAILED");
    }

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

  // Extract provider names from available connections for dynamic prompt generation
  const selectedProviders = availableConnections.map((conn) => conn.type);
  const genesisSystemPrompt = buildGenesisSystemPrompt(
    selectedProviders.length > 0 ? selectedProviders : null
  );

  // Resolve API keys
  const serviceClient = createServiceClient();
  let keyCandidates: GenesisApiKeyRow[];

  if (usePlatformKey) {
    const platformRawKey = process.env.PLATFORM_OPENROUTER_API_KEY ?? "";
    if (!platformRawKey) {
      return sseErrorResponse("Platform AI key is not available.", "PLATFORM_KEY_UNAVAILABLE");
    }
    const balance = await getUserCreditBalance(userId);
    if (balance.total < GENESIS_PLATFORM_RATE_USD) {
      return sseErrorResponse(
        `At least $${GENESIS_PLATFORM_RATE_USD.toFixed(2)} in credits is required to use the Corelyx platform key.`,
        "INSUFFICIENT_CREDITS"
      );
    }
    keyCandidates = [{ id: "platform", vault_secret_id: platformRawKey, provider: "openrouter" }];
  } else {
    const { data: allKeyRows, error: keysError } = await serviceClient
      .from("api_keys")
      .select("id, vault_secret_id, provider")
      .eq("workspace_id", workspaceId)
      .eq("is_valid", true);

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

      try {
        // Step 1: EU compliance pre-filter — identify relevant EU regulatory
        // obligations before Genesis generates the workflow. Non-blocking.
        send({ type: "status", message: "Checking EU compliance requirements..." });
        let euComplianceContext: string | null = null;
        try {
          const filterKeyRow = pickEuComplianceFilterKey(keyCandidates);
          if (filterKeyRow) {
            const filterApiKey = filterKeyRow.id === "platform"
                ? filterKeyRow.vault_secret_id
                : await vaultRetrieve(serviceClient, filterKeyRow.vault_secret_id);
            euComplianceContext = await runEuComplianceFilter(
              sanitizedDescription.value,
              filterKeyRow,
              filterApiKey
            );
          }
        } catch {
          // Non-blocking — continue without compliance context
        }

        // Step 2: Build the Genesis user message with any EU compliance context.
        send({ type: "status", message: "Contacting model..." });

        const userMessage = buildGenesisUserMessage(sanitizedDescription.value, availableConnections, euComplianceContext);

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
                });

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
                });

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
                throw new Error(`Model returned empty response for ${candidateModel}.`);
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

        if (!rawText) throw new Error("Model returned empty response.");

        send({ type: "status", message: "Validating schema..." });

        // Full parse with three-layer recovery (same as original route)
        let parsedSchema: unknown;
        try {
          parsedSchema = JSON.parse(extractJson(rawText));
        } catch {
          try {
            parsedSchema = JSON.parse(jsonrepair(extractJson(rawText)));
          } catch (err) {
            throw new Error(
              `Genesis model returned invalid JSON that could not be repaired: ${(err as Error).message}`
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
          console.error("[genesis] draft validation failed:", draftResult.error.flatten());
          throw new Error(`Workflow draft validation failed: ${getDraftValidationMessage(draftResult.error)}`);
        }
        const schemaResult = ProgramSchemaZ.safeParse(parsedSchema);
        const schema = schemaResult.success ? schemaResult.data : draftResult.data;
        const validation = validatePostGenesis(schema as unknown as Parameters<typeof validatePostGenesis>[0], connections);

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
          } as unknown as never)
          .select("id, name")
          .single();

        const program = rawProgram as unknown as { id: string; name: string } | null;

        if (insertError || !program) {
          throw new Error(`Failed to save program: ${insertError?.message ?? "unknown error"}`);
        }

        await serviceClient.from("program_memberships").insert({
          program_id: program.id,
          user_id: userId,
          role: "editor",
          created_by: userId,
        } as unknown as never);

        if (connections.length > 0) {
          const { error: linkError } = await serviceClient
            .from("program_connections")
            .insert(
              toProgramConnectionLinks(program.id, connections) as unknown as never
            );
          if (linkError) {
            throw new Error(`Failed to link selected connections: ${linkError.message}`);
          }
        }

        await serviceClient.from("program_versions").insert({
          program_id: program.id,
          version: 0,
          schema: schema as unknown as Record<string, unknown>,
          change_summary: "Genesis — AI-generated from description",
        } as unknown as never);

        await writeAppLog(supabase, {
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
        });

        await incrementGenesisUses(userId, workspaceId);
        if (usePlatformKey) await deductUserCredits(userId, GENESIS_PLATFORM_RATE_USD);

        send({
          type: "done",
          program_id: program.id,
          program_name: schema.program_name,
          validation,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
