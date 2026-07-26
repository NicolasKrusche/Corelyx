import { NextResponse } from "next/server";
import { z } from "zod";
import { ProgramSchemaZ, type ProgramSchema } from "@flowos/schema";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { canView, canEdit, getProgramAccess } from "@/lib/workspaces";
import { applyJsonPatch, JsonPatchOpZ, type JsonPatchOp } from "@/lib/genesis/fixit";
import {
  classifyError,
  type DLQEntry,
  type ErrorCategory,
  type ErrorAnalysisResult,
} from "@/lib/errors/error-analysis";

// ─── POST: Analyze a DLQ error and return AI fix suggestion ──────────────────

const postSchema = z.object({
  error_id: z.string().min(1),
});

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

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  // Fetch the DLQ entry from Supabase
  const serviceClient = createServiceClient();
  const { data: dlqRow, error: dlqError } = await serviceClient
    .from("dead_letter_entries")
    .select("*")
    .eq("id", parsed.data.error_id)
    .eq("program_id", params.id)
    .single();

  if (dlqError || !dlqRow) return apiError("DLQ entry not found", 404);

  const entry = dlqRow as unknown as DLQEntry;

  // Classify the error
  const errorCategory: ErrorCategory = classifyError(entry.error_message);

  // Fetch current program schema for context
  const { data: programRow } = await serviceClient
    .from("programs")
    .select("schema")
    .eq("id", params.id)
    .single();

  const programSchema = programRow?.schema as ProgramSchema | undefined;

  // Generate AI fix suggestion
  const fixSuggestion = await generateFixSuggestion(entry, errorCategory, programSchema);

  const result: ErrorAnalysisResult = {
    dlq_entry_id: entry.id,
    error_category: errorCategory,
    root_cause: fixSuggestion?.root_cause ?? `Error classified as: ${errorCategory.replace(/_/g, " ")}`,
    fix_suggestion: fixSuggestion?.fix
      ? { ...fixSuggestion.fix, addresses_errors: fixSuggestion.fix.addresses_errors ?? [entry.id] }
      : null,
    confidence: fixSuggestion?.confidence ?? 0.5,
    analyzed_at: new Date().toISOString(),
  };

  return NextResponse.json({ ok: true, analysis: result });
}

// ─── PUT: Apply a fix patch and re-run the program ───────────────────────────

const putSchema = z.object({
  error_id: z.string().min(1),
  patch: z.array(JsonPatchOpZ).min(1).max(50),
});

export async function PUT(
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
  if (!canEdit(access)) return apiError("Only program editors can apply fixes.", 403);

  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  // Verify the DLQ entry exists
  const serviceClient = createServiceClient();
  const { data: dlqRow, error: dlqError } = await serviceClient
    .from("dead_letter_entries")
    .select("id, error_message")
    .eq("id", parsed.data.error_id)
    .eq("program_id", params.id)
    .single();

  if (dlqError || !dlqRow) return apiError("DLQ entry not found", 404);

  // Fetch and parse current program schema
  const { data: programRow } = await supabase
    .from("programs")
    .select("id, schema, schema_version")
    .eq("id", params.id)
    // @supabase/ssr 0.5.2's generics predate supabase-js 2.101, so its .from()
    // resolves to never. Type the row here rather than casting the client.
    .returns<{ id: string; schema: unknown; schema_version: number | null }[]>()
    .single();

  if (!programRow) return apiError("Program not found", 404);

  const parsedSchema = ProgramSchemaZ.safeParse(programRow.schema);
  if (!parsedSchema.success) {
    return apiError("Program schema is invalid and cannot be patched", 409);
  }

  // Apply the JSON Patch
  const patched = applyJsonPatch(parsedSchema.data, parsed.data.patch);
  if (!patched.ok) {
    return apiError(patched.error ?? "The fix could not be applied", 422);
  }

  // Re-validate the patched schema — trust boundary
  const revalidated = ProgramSchemaZ.safeParse(patched.result);
  if (!revalidated.success) {
    return apiError("The fix produced an invalid workflow schema", 422);
  }

  const nextSchema = {
    ...(revalidated.data as ProgramSchema),
    updated_at: new Date().toISOString(),
  };
  const nextVersion = ((programRow as { schema_version: number | null }).schema_version ?? 0) + 1;

  // Persist the patched schema
  const { error: updateError } = await supabase
    .from("programs")
    .update({
      schema: nextSchema as unknown,
      schema_version: nextVersion,
      updated_at: nextSchema.updated_at,
    } as unknown as never)
    .eq("id", params.id);

  if (updateError) return apiError(updateError.message, 500);

  // Record version history
  await supabase
    .from("program_versions")
    .insert({
      program_id: params.id,
      version: nextVersion,
      schema: nextSchema as unknown,
      change_summary: "Error recovery fix: applied AI-suggested patch",
    } as unknown as never);

  // Mark the DLQ entry as resolved
  await serviceClient
    .from("dead_letter_entries")
    .update({ status: "resolved", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.error_id);

  return NextResponse.json({
    ok: true,
    applied: true,
    schema_version: nextVersion,
  });
}

// ─── LLM fix generation ─────────────────────────────────────────────────────

interface LLMFixResponse {
  root_cause: string;
  confidence: number;
  fix: {
    description: string;
    patch: JsonPatchOp[];
    confidence: number;
    // FixSuggestion requires this; the model does not reliably return it, so
    // the call site defaults it to the DLQ entry being addressed.
    addresses_errors?: string[];
  } | null;
}

async function generateFixSuggestion(
  entry: DLQEntry,
  category: ErrorCategory,
  programSchema?: ProgramSchema
): Promise<LLMFixResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `You are a workflow runtime error analyst for Corelyx, a Visual Agentic OS.
A workflow run failed and the error was enqueued to the Dead Letter Queue.
Analyze the error and suggest a fix using RFC 6902 JSON Patch operations.

RULES:
1. ONLY produce patches under /nodes or /edges paths.
2. For connector_auth errors: suggest replacing api_key_ref or connection_id.
3. For rate_limit: suggest adding retry_policy.backoff_ms.
4. For timeout: suggest increasing node config timeout_ms.
5. For schema_validation: suggest correcting the invalid field.
6. For data_format_mismatch: suggest adding output_transform.
7. For connection_not_found: suggest removing the broken edge.
8. For api_key_invalid: suggest assigning a valid api_key_ref.

Response: JSON with { root_cause, confidence, fix: { description, patch, confidence } | null }`;

  const userPrompt = `## Error Category: ${category}
## Node ID: ${entry.node_id}
## Node Type: ${entry.node_type}
## Error Message: ${entry.error_message}
## Input Data: ${JSON.stringify(entry.input_data ?? {}).slice(0, 1000)}
## Node Config: ${JSON.stringify(entry.node_config ?? {}).slice(0, 1000)}
${programSchema ? `## Current Schema (nodes): ${JSON.stringify(programSchema.nodes.map(n => ({ id: n.id, type: n.type, label: n.label }))).slice(0, 2000)}` : ""}

Classify the root cause and suggest a fix (or null if not auto-fixable).`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as LLMFixResponse;

    // Validate the patch if present
    if (parsed.fix?.patch) {
      const validOps = ["add", "remove", "replace", "move", "copy", "test"];
      parsed.fix.patch = parsed.fix.patch.filter(
        (op) => validOps.includes(op.op) && op.path.startsWith("/nodes") || op.path.startsWith("/edges")
      );
      if (parsed.fix.patch.length === 0) parsed.fix = null;
    }

    return parsed;
  } catch {
    return null;
  }
}
