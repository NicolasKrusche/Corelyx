import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { canView, canRun, getProgramAccess } from "@/lib/workspaces";
import {
  buildFixItPayload,
  parseFixSuggestions,
  type ValidationErrorInput,
} from "@/lib/genesis/fixit";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { normalizeSchema } from "@/lib/genesis/parsing";

const requestSchema = z.object({
  errors: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(["blocking", "critical"]),
      node_id: z.string().nullable(),
      edge_id: z.string().nullable(),
      message: z.string(),
      fix_suggestion: z.string(),
    })
  ),
});

// POST /api/programs/[id]/fixit — generate AI fix suggestions for validation errors
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canRun(access)) return apiError("You cannot request fix suggestions for this program.", 403);

  const body = await request.json().catch(() => null);
  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) return apiError(parsedBody.error.message, 400);

  if (parsedBody.data.errors.length === 0) {
    return apiError("No errors provided", 400);
  }

  // Fetch current schema
  const { data: program, error: progError } = await supabase
    .from("programs")
    .select("id, schema")
    .eq("id", params.id)
    .single();

  if (progError || !program) return apiError("Program not found", 404);

  const programRow = program as unknown as { schema: unknown };
  normalizeSchema(programRow.schema);
  const executableSchema = ProgramSchemaZ.safeParse(programRow.schema);
  if (!executableSchema.success) {
    return apiError("Program schema is invalid — cannot generate fix suggestions", 409);
  }

  const schema = executableSchema.data as unknown as ProgramSchema;
  const errors: ValidationErrorInput[] = parsedBody.data.errors;

  // Build the LLM prompt
  const { systemPrompt, userPrompt } = buildFixItPayload(schema, errors);

  // Call the LLM — server-side only, credentials never leave this path
  try {
    const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // No API key configured — fall back to rule-based suggestions only
      return NextResponse.json({ suggestions: [], fallback: true });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://corelyx.com",
        "X-Title": "Corelyx Fix-It Assistant",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      console.error("[fixit] LLM API error:", response.status, errorText);
      return NextResponse.json({ suggestions: [], error: "LLM service unavailable" });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ suggestions: [], error: "Empty LLM response" });
    }

    // Parse and validate the LLM response
    const parsed = parseFixSuggestions(content);
    if (!parsed) {
      return NextResponse.json({ suggestions: [], error: "Could not parse LLM response" });
    }

    // Filter out suggestions that reference paths outside the schema
    const validSuggestions = parsed.suggestions.filter((s) =>
      s.patch.every((op) => op.path.startsWith("/nodes/") || op.path.startsWith("/edges/"))
    );

    return NextResponse.json({ suggestions: validSuggestions });
  } catch (error) {
    console.error("[fixit] Error generating fix suggestions:", error);
    return NextResponse.json({ suggestions: [], error: "Failed to generate fix suggestions" });
  }
}
