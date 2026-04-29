import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { validatePostGenesis } from "@/lib/validation";
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
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    is_active: z.boolean().optional(),
    execution_mode: z.enum(["autonomous", "approval_required", "supervised"]).optional(),
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
  const { schema: rawSchema, ...metaPatch } = parsed.data;

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
    validationResult = validatePostGenesis(schema, []);
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

  const { data: updatedProgram, error: updateError } = await supabase
    .from("programs")
    .update(updatePayload as unknown as never)
    .eq("id", params.id)
    .select("id, name, description, execution_mode, is_active, schema_version, updated_at")
    .single();

  if (updateError) return apiError(updateError.message, 500);

  if (schema) {
    await supabase
      .from("program_versions")
      .insert({
        program_id: params.id,
        version: nextVersion,
        schema: schema as unknown,
        change_summary: "Saved from visual editor",
      } as unknown as never);
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
