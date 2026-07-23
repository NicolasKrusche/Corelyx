import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { validatePostGenesis } from "@/lib/validation";
import { withAllSchemaTriggersPaused } from "@/lib/triggers/schema-trigger-state";
import { canContributeToWorkspace, getActiveWorkspace } from "@/lib/workspaces";
import { ensureUserProvisioned } from "@/lib/auth/provisioning";

/**
 * POST /api/templates/[id]/fork
 *
 * Forks a template into the authenticated user's account as a new program.
 * - Reads the template's genesis_prompt as a description hint
 * - Uses the template's program_json as the base schema
 * - Auto-links connections the user already has by name
 * - Returns the new program + missing connection names
 */
export async function POST(
  _request: Request,
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
    return apiError("Viewers cannot fork templates.", 403);
  }

  const db = createServiceClient() as any;

  // Fetch the template
  const { data: template, error: templateError } = await db
    .from("templates")
    .select("id, name, description, genesis_prompt, program_json")
    .eq("id", params.id)
    .single();

  if (templateError || !template) {
    return apiError("Template not found", 404);
  }

  // Validate the schema
  const schemaResult = ProgramSchemaZ.safeParse(template.program_json);
  if (!schemaResult.success) {
    return apiError("Template schema is invalid", 422);
  }

  const schema = schemaResult.data as unknown as ProgramSchema;
  const now = new Date().toISOString();

  const forkedName = template.name;
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
      description: template.description || null,
      schema: forkedSchema as unknown as Record<string, unknown>,
      execution_mode: mapExecutionMode(forkedSchema.execution_mode),
      is_active: false,
      updated_at: now,
    } as unknown as never)
    .select("id, name, description, execution_mode, is_active, schema_version, created_at")
    .single();

  if (insertError || !newProgRaw) return apiError("Failed to fork template", 500);

  const newProg = newProgRaw as unknown as { id: string; name: string };

  // Stamp the real DB UUID into schema.program_id
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
    change_summary: `Created from template "${template.name}" (${template.id})`,
  } as unknown as never);

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
