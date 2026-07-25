import { NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";
import { recordAdminAction } from "@/lib/audit/logger";

// ─── POST /api/programs/:id/rollback ─────────────────────────────────────────
// Restore a specific saved version (identified by its program_versions row id)
// as the program's current schema. Unlike the version-number based restore in
// /versions, this endpoint targets an immutable row id, records the action in
// the admin audit log, and reports whether a newer run is still executing so
// the UI can warn that the in-flight run is unaffected.

// Run statuses that mean an execution is still in flight. `waiting_approval`
// lives on node_executions, not runs — the runs table tops out at 'paused'.
const ACTIVE_RUN_STATUSES = ["pending", "running", "paused"] as const;

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

  const body = await request.json().catch(() => null);
  if (!body) return apiError("Invalid body", 400);

  const bodySchema = z.object({ version_id: z.string().uuid() });
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError("A valid version_id is required.", 400);

  const { version_id: versionId } = parsed.data;

  // Owner / editor enforcement. getProgramAccess mirrors the RLS role function
  // for service-role paths; canView/canEdit gate read vs. write.
  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("Only program editors can roll back versions.", 403);

  type ProgramRow = { id: string; name: string | null; schema_version: number | null };

  const { data: rawProgram, error: programError } = await supabase
    .from("programs")
    .select("id, name, schema_version")
    .eq("id", params.id)
    .single();

  if (programError || !rawProgram) return apiError("Program not found", 404);
  const program = rawProgram as unknown as ProgramRow;

  // Fetch the target version by its row id, scoped to this program so a version
  // id from another program cannot be restored here.
  type VersionRow = { id: string; version: number; schema: unknown; created_at: string };

  const { data: rawVersion, error: versionError } = await supabase
    .from("program_versions")
    .select("id, version, schema, created_at")
    .eq("id", versionId)
    .eq("program_id", params.id)
    .single();

  if (versionError || !rawVersion) return apiError("Version not found", 404);
  const targetVersion = rawVersion as unknown as VersionRow;

  // Validate the stored schema before adopting it as the live schema.
  const parsedSchema = ProgramSchemaZ.safeParse(targetVersion.schema);
  if (!parsedSchema.success) return apiError("Stored schema is invalid", 500);
  const restoredSchema = parsedSchema.data as unknown as ProgramSchema;
  const validationResult = validatePostGenesis(restoredSchema, []);

  // Optimistic locking: is a run that started after the target version still
  // executing? If so the rollback proceeds, but the in-flight run keeps running
  // against the schema it was dispatched with — surface a non-blocking warning.
  const { data: activeRuns } = await supabase
    .from("runs")
    .select("id")
    .eq("program_id", params.id)
    .in("status", ACTIVE_RUN_STATUSES as unknown as string[])
    .gt("created_at", targetVersion.created_at)
    .limit(1);

  const activeRunWarning = Array.isArray(activeRuns) && activeRuns.length > 0;

  const now = new Date().toISOString();
  const nextVersion = (program.schema_version ?? 0) + 1;
  const changeSummary = `Rolled back to version ${targetVersion.version} (rollback)`;

  const { data: updatedProgram, error: updateError } = await supabase
    .from("programs")
    .update({
      schema: restoredSchema as unknown,
      schema_version: nextVersion,
      updated_at: now,
    } as unknown as never)
    .eq("id", params.id)
    .select("id, name, description, execution_mode, is_active, schema_version, updated_at")
    .single();

  if (updateError) return apiError(updateError.message, 500);

  // Record the rollback as a new immutable snapshot. 'rollback' is captured in
  // the change_summary — program_versions has no dedicated reason column.
  await supabase
    .from("program_versions")
    .insert({
      program_id: params.id,
      version: nextVersion,
      schema: restoredSchema as unknown,
      change_summary: changeSummary,
    } as unknown as never);

  // Tamper-evident audit trail. recordAdminAction never throws — a logging
  // failure must not fail the rollback itself.
  const headersList = await headers();
  await recordAdminAction({
    actorId: user.id,
    actorEmail: user.email ?? undefined,
    actorIp: headersList.get("x-forwarded-for") ?? undefined,
    actorUserAgent: headersList.get("user-agent") ?? undefined,
    targetType: "program",
    targetId: params.id,
    targetIdentifier: program.name ?? undefined,
    action: "admin.program.update",
    riskLevel: "medium",
    reason: "rollback",
    metadata: {
      rollback: true,
      restored_version: targetVersion.version,
      restored_version_id: targetVersion.id,
      new_schema_version: nextVersion,
      active_run_warning: activeRunWarning,
    },
    workspaceId: access?.workspaceId,
    success: true,
  });

  return NextResponse.json({
    program: updatedProgram,
    schema: restoredSchema,
    restoredVersion: targetVersion.version,
    activeRunWarning,
    validation: validationResult,
  });
}
