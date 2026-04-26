import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

export const maxDuration = 300;

import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { vaultRetrieve } from "@/lib/vault";
import { GENESIS_SYSTEM_PROMPT, buildGenesisUserMessage } from "@/lib/genesis/prompt";
import { ProgramSchemaZ } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import { checkProgramLimit, checkGenesisAccess, incrementGenesisUses } from "@/lib/limits";
import { rateLimit } from "@/lib/rate-limit";
import { truncateForLog, writeAppLog } from "@/lib/app-logs";
import { extractJson, normalizeSchema } from "@/lib/genesis/parsing";
import { PartialSchemaScanner } from "@/lib/genesis/partial-schema";
import {
  getMissingConnectionIds,
  getModelCandidates,
  getProviderBaseURL,
  isKeyError,
  isPromptTooLarge,
  isRetryableModelError,
  KEY_DEFAULT_MODELS,
  mapExecutionMode,
  sortApiKeyFallbacks,
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
});

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

  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { description, connection_ids, api_key_id, model } = parsed.data;
  const requestedConnectionIds = uniqueRequestedConnectionIds(connection_ids);
  const startedAt = Date.now();

  // Rate limit
  if (!rateLimit(`genesis:${userId}`, 10, 60_000)) {
    return sseErrorResponse("Too many requests. Please wait a moment and try again.", "RATE_LIMITED");
  }

  // Genesis AI monthly limit (Free tier: 1 use/month)
  const genesisCheck = await checkGenesisAccess(userId);
  if (!genesisCheck.allowed) {
    return sseErrorResponse(genesisCheck.upgradeMessage ?? "Genesis AI limit reached.", "GENESIS_LIMIT_REACHED");
  }

  // Program limit
  const limitCheck = await checkProgramLimit(userId);
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
      .eq("user_id", userId)
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

  // Resolve API keys — preferred first, then fallbacks sorted by provider priority
  const serviceClient = createServiceClient();
  const { data: allKeyRows, error: keysError } = await serviceClient
    .from("api_keys")
    .select("id, vault_secret_id, provider")
    .eq("user_id", userId)
    .eq("is_valid", true);

  const validKeyRows = (allKeyRows ?? []) as unknown as GenesisApiKeyRow[];
  if (keysError || validKeyRows.length === 0) {
    return sseErrorResponse("API key not found. Please add a valid API key.", "API_KEY_INVALID");
  }

  const keyCandidates = sortApiKeyFallbacks(api_key_id, validKeyRows);
  if (keyCandidates.length === 0) {
    return sseErrorResponse("Selected API key not found or invalid.", "API_KEY_INVALID");
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
        send({ type: "status", message: "Contacting model..." });

        const userMessage = buildGenesisUserMessage(description, availableConnections);

        keyAttemptLoop:
        for (let keyIndex = 0; keyIndex < keyCandidates.length; keyIndex += 1) {
          const currentKeyRow = keyCandidates[keyIndex]!;

          let currentApiKey: string;
          try {
            currentApiKey = await vaultRetrieve(serviceClient, currentKeyRow.vault_secret_id);
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
                  max_tokens: 8192,
                  system: GENESIS_SYSTEM_PROMPT,
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
                  max_tokens: 8192,
                  stream: true,
                  messages: [
                    { role: "system", content: GENESIS_SYSTEM_PROMPT },
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
        const schemaResult = ProgramSchemaZ.safeParse(parsedSchema);
        if (!schemaResult.success) {
          const issues = schemaResult.error.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`).join(" | ");
          console.error("[genesis] schema validation failed:", schemaResult.error.flatten());
          throw new Error(`Schema validation failed: ${issues}`);
        }
        const schema = schemaResult.data;
        const validation = validatePostGenesis(schema as unknown as Parameters<typeof validatePostGenesis>[0], connections);

        send({ type: "status", message: "Saving program..." });

        const { data: rawProgram, error: insertError } = await supabase
          .from("programs")
          .insert({
            user_id: userId,
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

        if (connections.length > 0) {
          const { error: linkError } = await supabase
            .from("program_connections")
            .insert(
              toProgramConnectionLinks(program.id, connections) as unknown as never
            );
          if (linkError) {
            throw new Error(`Failed to link selected connections: ${linkError.message}`);
          }
        }

        await supabase.from("program_versions").insert({
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
          },
        });

        await incrementGenesisUses(userId);

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
            description: truncateForLog(description, 1000),
            raw_preview: truncateForLog(rawText, 2000),
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
