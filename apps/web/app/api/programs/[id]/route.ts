import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { validatePostGenesis } from "@/lib/validation";
import { syncEventTriggers, syncCronTriggers, syncFileWatchTriggers, syncWebhookTriggers } from "@/lib/triggers/event-trigger-sync";
import { ensureGmailWatchesForProgram } from "@/lib/triggers/gmail-watch";
import { serverLog } from "@/lib/server-log";
import {
  getDraftValidationMessage,
  normalizeProgramDraft,
  validateProgramDraft,
} from "@/lib/workflow/normalize";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";

// GET /api/programs/:id — full schema (any program member with view rights).
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) return apiError("Program not found", 404);
  return NextResponse.json({ ...(data as Record<string, unknown>), access: access?.effective ?? null });
}

// PATCH /api/programs/:id — save updated schema (editor only).
export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("You do not have permission to edit this program.", 403);

  const body = await request.json().catch(() => null);
  if (!body) return apiError("Invalid body", 400);

  const bodySchema = z.object({
    schema: z.unknown().optional(),
    // Version the client based its edits on. When present, a mismatch with the
    // stored version rejects the save (409) instead of silently overwriting
    // changes made elsewhere (another tab, the Triggers page, Genesis).
    expected_schema_version: z.number().int().nonnegative().optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    is_active: z.boolean().optional(),
    execution_mode: z.enum(["autonomous", "approval_required", "supervised"]).optional(),
    folder_id: z.string().uuid().nullable().optional(),
  });

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  type ExistingRow = { id: string; schema_version: number | null };

  const { data: rawExisting, error: fetchError } = await supabase
    .from("programs")
    .select("id, schema_version")
    .eq("id", params.id)
    .single();

  if (fetchError || !rawExisting) return apiError("Program not found", 404);

  const existing = rawExisting as unknown as ExistingRow;
  const { schema: rawSchema, expected_schema_version: expectedSchemaVersion, ...metaPatch } = parsed.data;

  // A stale client (e.g. an editor tab opened before a pause on the Triggers
  // page) must not silently overwrite trigger state or newer edits.
  if (
    rawSchema !== undefined &&
    expectedSchemaVersion !== undefined &&
    (existing.schema_version ?? 0) !== expectedSchemaVersion
  ) {
    return NextResponse.json(
      {
        error: "SCHEMA_VERSION_CONFLICT",
        message:
          "This workflow was changed elsewhere (another tab, the Triggers page, or Genesis). Reload the editor to continue.",
        current_version: existing.schema_version ?? 0,
      },
      { status: 409 }
    );
  }

  const schema = rawSchema === undefined
    ? undefined
    : normalizeProgramDraft(rawSchema, { program_id: params.id });

  let validationResult = null;
  if (schema) {
    const draftResult = validateProgramDraft(schema);
    if (!draftResult.success) {
      return NextResponse.json(
        {
          error: "DRAFT_VALIDATION_FAILED",
          message: getDraftValidationMessage(draftResult.error),
          details: draftResult.error.flatten(),
        },
        { status: 422 }
      );
    }
    const { data: linkedConnsRaw } = await supabase
      .from("program_connections")
      .select("connections(id, name, provider, scopes)")
      .eq("program_id", params.id);
    const linkedConnections = (linkedConnsRaw ?? [])
      .map((r: { connections: { id: string; name: string; provider: string; scopes: string[] | null } | null }) => r.connections)
      .filter(Boolean) as { id: string; name: string; provider: string; scopes: string[] | null }[];
    validationResult = validatePostGenesis(schema, linkedConnections);
  }

  const now = new Date().toISOString();
  const nextVersion = (existing.schema_version ?? 0) + 1;

  const updatePayload = {
    ...metaPatch,
    updated_at: now,
    ...(schema
      ? {
          name: schema.program_name,
          schema: schema as unknown,
          schema_version: nextVersion,
          execution_mode: schema.execution_mode === "approval_required" ? "supervised" : schema.execution_mode,
        }
      : {}),
  };

  // Compare-and-swap on schema_version when writing a schema, so two
  // concurrent saves can't both write the same next version (the loser gets a
  // 409 instead of silently clobbering the winner).
  let updateQuery = supabase
    .from("programs")
    .update(updatePayload as unknown as never)
    .eq("id", params.id);
  if (schema) {
    updateQuery =
      existing.schema_version === null
        ? updateQuery.is("schema_version", null)
        : updateQuery.eq("schema_version", existing.schema_version);
  }
  const { data: updatedProgram, error: updateError } = await updateQuery
    .select("id, name, description, execution_mode, is_active, schema_version, updated_at")
    .maybeSingle();

  if (updateError) return apiError(updateError.message, 500);
  if (!updatedProgram) {
    if (schema) {
      return NextResponse.json(
        {
          error: "SCHEMA_VERSION_CONFLICT",
          message:
            "This workflow was changed elsewhere (another tab, the Triggers page, or Genesis). Reload the editor to continue.",
          current_version: null,
        },
        { status: 409 }
      );
    }
    return apiError("Program not found", 404);
  }

  if (schema) {
    await supabase
      .from("program_versions")
      .insert({
        program_id: params.id,
        version: nextVersion,
        schema: schema as unknown,
        change_summary: "Saved from visual editor",
      } as unknown as never);

    // Reconcile event triggers from the schema into the `triggers` table so the
    // event dispatcher (which reads that table) can match them, then register
    // Gmail watches for any linked Gmail connection. Best-effort: a failure here
    // must not block saving the program.
    try {
      const serviceClient = createServiceClient();
      await syncEventTriggers(serviceClient, params.id, schema);
      await syncCronTriggers(serviceClient, params.id, schema);
      await syncWebhookTriggers(serviceClient, params.id, schema);
      await syncFileWatchTriggers(serviceClient, params.id, schema);
      await ensureGmailWatchesForProgram(serviceClient, params.id);
    } catch (err) {
      serverLog({
        level: "error",
        event: "programs.save.trigger_sync_failed",
        message: "Failed to sync event triggers or register Gmail watch on save.",
        details: { program_id: params.id, error: err instanceof Error ? err.message : "unknown" },
      });
    }
  }

  return NextResponse.json({
    program: updatedProgram,
    validation: validationResult,
  });
}

// DELETE /api/programs/:id — editor only.
export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("You do not have permission to delete this program.", 403);

  const { error } = await supabase
    .from("programs")
    .delete()
    .eq("id", params.id);

  if (error) return apiError(error.message, 500);
  return new NextResponse(null, { status: 204 });
}
