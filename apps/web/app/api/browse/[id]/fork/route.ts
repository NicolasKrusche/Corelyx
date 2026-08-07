import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import { findPremadeBrowseProgram } from "@/lib/browse-programs";
import { withAllSchemaTriggersPaused } from "@/lib/triggers/schema-trigger-state";
import { sanitizeSchemaForPublicCopy } from "@/lib/programs/public-schema";
import { canContributeToWorkspace, getActiveWorkspace } from "@/lib/workspaces";
import { ensureUserProvisioned } from "@/lib/auth/provisioning";
import { checkProgramLimit } from "@/lib/limits";

/**
 * POST /api/browse/[id]/fork
 *
 * Forks a public program into the authenticated user's account.
 * - Copies the sanitized schema (api_key_ref already __USER_ASSIGNED__)
 * - Auto-links connections the user already has by name
 * - Increments the source program's fork_count
 * - Returns the new program + any missing connection names
 */
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    await ensureUserProvisioned(user);
  } catch {
    return apiError("Workspace could not be prepared.", 500);
  }

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) {
    return apiError("Viewers cannot fork programs.", 403);
  }

  // Forking creates a program like every other creation path, so it owes the
  // same plan check — without this it was the one way past the program cap.
  const limitCheck = await checkProgramLimit(user.id, ws.workspaceId);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: "PROGRAM_LIMIT_REACHED",
        message: limitCheck.upgradeMessage ?? "Program limit reached.",
      },
      { status: 403 }
    );
  }

  const db = createServiceClient();

  type SourceRow = { id: string; name: string; description: string | null; schema: unknown; is_public: boolean };
  const premade = findPremadeBrowseProgram(params.id);
  let source: SourceRow | null = null;
  let shouldIncrementForkCount = false;

  if (premade?.schema) {
    source = {
      id: premade.id,
      name: premade.name,
      description: premade.description,
      schema: premade.schema,
      is_public: true,
    };
  } else {
    // Fetch the published program. The is_public filter is the access check in
    // its own right — this is a service-role client, so it does not (and since
    // migration 20260807120000 could not) lean on an RLS policy for it.
    const { data: sourceRaw, error: sourceError } = await db
      .from("programs")
      .select("id, name, description, schema, is_public")
      .eq("id", params.id)
      .eq("is_public", true)
      .single();

    if (sourceError || !sourceRaw) return apiError("Program not found or not public", 404);
    source = sourceRaw as unknown as SourceRow;
    shouldIncrementForkCount = true;
  }

  // Strip the publisher's credentials before anything is copied. The stored
  // schema still holds their real API keys, HTTP auth values and device/webhook
  // ids — publishing deliberately no longer rewrites it (see the publish
  // route), so this is the boundary where a program stops being the author's.
  const sanitizedSource = sanitizeSchemaForPublicCopy(source.schema);

  // Validate the schema (should always be valid, but be defensive)
  const schemaResult = ProgramSchemaZ.safeParse(sanitizedSource);
  if (!schemaResult.success) {
    return apiError("Source program schema is invalid", 422);
  }

  const schema = schemaResult.data as unknown as ProgramSchema;
  const now = new Date().toISOString();

  const forkedName = source.name;
  const forkedSchema = withAllSchemaTriggersPaused(
    {
      ...schema,
      program_name: forkedName,
    } as unknown as Record<string, unknown>,
    now
  ) as unknown as ProgramSchema;

  // Auto-link connections the user already has by name
  type ConnectionRow = { id: string; name: string; provider: string; scopes: string[] | null };

  const referencedNames = getConnectionNames(forkedSchema);
  let matchedConnections: ConnectionRow[] = [];

  if (referencedNames.length > 0) {
    const { data: connsRaw } = await supabase
      .from("connections")
      .select("id, name, provider, scopes")
      .eq("workspace_id", ws.workspaceId)
      .in("name", referencedNames);
    matchedConnections = (connsRaw ?? []) as unknown as ConnectionRow[];
  }

  const validation = validatePostGenesis(forkedSchema, matchedConnections);

  // Insert forked program
  const { data: newProgRaw, error: insertError } = await db
    .from("programs")
    .insert({
      user_id: user.id,
      workspace_id: ws.workspaceId,
      name: forkedName,
      description: source.description ?? null,
      schema: forkedSchema as unknown as Record<string, unknown>,
      execution_mode: mapExecutionMode(forkedSchema.execution_mode),
      is_active: false, // forked programs start inactive until user reviews
      updated_at: now,
    } as unknown as never)
    .select("id, name, description, execution_mode, is_active, schema_version, created_at")
    .single();

  if (insertError || !newProgRaw) return apiError("Failed to use program", 500);

  const newProg = newProgRaw as unknown as { id: string; name: string };

  // Always stamp the real DB UUID into schema.program_id — the source schema
  // (premade or otherwise) may carry a different value which would break
  // runtime DB queries that use program_id as a UUID.
  const finalSchema = { ...(forkedSchema as unknown as Record<string, unknown>), program_id: newProg.id };
  await db.from("programs").update({ schema: finalSchema } as unknown as never).eq("id", newProg.id);

  await db.from("program_memberships").insert({
    program_id: newProg.id,
    user_id: user.id,
    role: "editor",
    created_by: user.id,
  } as unknown as never);

  // Link matched connections
  if (matchedConnections.length > 0) {
    await db.from("program_connections").insert(
      matchedConnections.map((c) => ({ program_id: newProg.id, connection_id: c.id })) as unknown as never
    );
  }

  // Version snapshot
  await db.from("program_versions").insert({
    program_id: newProg.id,
    version: 0,
    schema: finalSchema,
    change_summary: `Created from browse program "${source.name}" (${source.id})`,
  } as unknown as never);

  // Increment fork_count on the source (best-effort via RPC).
  // `.rpc()` returns a PostgrestFilterBuilder, which is only PromiseLike: it
  // has `then` but no `catch`, so the previous `.catch(() => {})` threw a
  // TypeError outside the try block and turned every community fork into a 500
  // *after* the program had already been created.
  if (shouldIncrementForkCount) {
    try {
      await db.rpc("increment_fork_count", { program_id: params.id });
    } catch {
      // A stalled counter must not fail a fork that already succeeded.
    }
  }

  const linkedNames = new Set(matchedConnections.map((c) => c.name));
  const missingNames = referencedNames.filter((n) => !linkedNames.has(n));

  return NextResponse.json(
    {
      program: newProgRaw,
      validation,
      linked_connection_names: [...linkedNames],
      missing_connection_names: missingNames,
    },
    { status: 201 }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConnectionNames(schema: ProgramSchema): string[] {
  const names = new Set<string>();
  for (const node of schema.nodes) {
    if (node.connection) names.add(node.connection.trim());
  }
  return [...names].filter(Boolean);
}

function mapExecutionMode(mode: ProgramSchema["execution_mode"]): "autonomous" | "supervised" | "manual" {
  return mode === "approval_required" ? "supervised" : mode;
}
