import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { buildGenesisSystemPrompt, buildGenesisUserMessage, buildRefinementUserMessage } from "@/lib/genesis/prompt";
import { extractJson, normalizeSchema } from "@/lib/genesis/parsing";
import { applyDeterministicRepairs } from "@/lib/genesis/semantic-repair";
import { diffSchemas, type GenesisPatchSummary } from "@/lib/genesis/patch";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";

// Extend Vercel serverless function timeout
export const maxDuration = 120;

/**
 * POST /api/playground/generate
 *
 * Takes a natural-language prompt + optional existing schema and returns a
 * generated schema along with reasoning. Uses the same Genesis prompt-building
 * logic as the main /api/genesis route, but without billing or workspace
 * constraints (this is a testing/learning interface).
 *
 * Body:
 *   prompt: string         — the natural-language description
 *   existing_schema?: object — if provided, treated as an iteration/refinement
 *   connection_ids?: string[] — simulated connection context
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.prompt !== "string" || body.prompt.trim().length < 5) {
    return apiError("prompt is required and must be at least 5 characters", 400);
  }

  const { prompt, existing_schema, connection_ids } = body as {
    prompt: string;
    existing_schema?: ProgramSchema;
    connection_ids?: string[];
  };

  const isRefinement = !!existing_schema;
  const requestedConnectionIds = Array.isArray(connection_ids) ? connection_ids.filter((id: unknown) => typeof id === "string") : [];

  // Build available connections list (empty for playground — no real connections required)
  const availableConnections: Array<{ name: string; type: string; scopes: string[] }> = [];

  // Build the Genesis system prompt
  const genesisSystemPrompt = buildGenesisSystemPrompt(
    availableConnections.length > 0 ? availableConnections.map((c) => c.type) : null,
    "free", // playground uses free tier prompt structure
    null    // no live capability introspection
  );

  // Build user message
  const userMessage = isRefinement
    ? buildRefinementUserMessage(
        prompt,
        existing_schema as unknown as object,
        availableConnections,
        null,
        { usePatch: false }
      )
    : buildGenesisUserMessage(prompt, availableConnections, null);

  // Resolve OpenRouter API key for the LLM call
  const platformRawKey = process.env.PLATFORM_OPENROUTER_API_KEY ?? "";
  if (!platformRawKey) {
    return apiError("AI service is not configured for playground mode.", 503);
  }

  let rawText = "";
  let lastErr: unknown;

  // Try the platform key directly
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${platformRawKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://corelyx.ai",
        "X-Title": "Corelyx Playground",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [
          { role: "system", content: genesisSystemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0,
        max_tokens: 16384,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`LLM provider returned ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    rawText = json.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    lastErr = err;
  }

  if (!rawText) {
    return apiError(
      `Failed to generate schema. ${lastErr instanceof Error ? lastErr.message : "Unknown error"}`,
      500
    );
  }

  // Parse the LLM response
  const parsed = extractJson(rawText);
  if (!parsed) {
    return apiError("The AI returned a response that could not be parsed as JSON.", 500);
  }

  // Apply deterministic repairs (fix common model mistakes)
  const repaired = applyDeterministicRepairs(parsed as unknown as ProgramSchema, { errors: [] }) as unknown as Record<string, unknown>;

  // Normalize the schema
  const normalized = normalizeSchema(repaired as Record<string, unknown>);

  // Validate with Zod
  const result = ProgramSchemaZ.safeParse(normalized);
  if (!result.success) {
    // Try to surface a useful error — the schema is close but invalid
    return apiError(
      `Generated schema has validation errors: ${result.error.issues.map((i) => i.message).join("; ")}`,
      500
    );
  }

  const schema = result.data;

  // If this was a refinement, compute a diff summary
  let diffSummary: GenesisPatchSummary | null = null;
  if (isRefinement) {
    diffSummary = diffSchemas(existing_schema as object, schema as object);
  }

  return NextResponse.json({
    schema,
    reasoning: isRefinement
      ? `Refined the workflow based on your feedback: "${prompt.slice(0, 200)}"`
      : `Generated workflow from: "${prompt.slice(0, 200)}"`,
    diff: diffSummary,
    iteration_count: isRefinement ? 1 : 0,
  });
}
