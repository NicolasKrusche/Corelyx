import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { convertN8nToCorelyx } from "@flowos/schema";
import { checkProgramLimit } from "@/lib/limits";
import { validatePostGenesis } from "@/lib/validation";
import { serverLog } from "@/lib/server-log";
import {
  getDraftValidationMessage,
  normalizeProgramDraft,
  validateProgramDraft,
} from "@/lib/workflow/normalize";
import { canContributeToWorkspace, getActiveWorkspace } from "@/lib/workspaces";

const N8nImportBodyZ = z.object({
  json: z.string().optional(),
  schema: z.unknown().optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(5000).optional(),
});

type ConnectionRow = {
  id: string;
  name: string;
  provider: string;
  scopes: string[] | null;
};

function stripMarkdownCodeFence(input: string): string {
  return input
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function getSchemaConnectionNames(schema: { nodes: Array<{ connection?: string | null }> }): string[] {
  const names = new Set<string>();
  for (const node of schema.nodes) {
    if (!node.connection) continue;
    const trimmed = node.connection.trim();
    if (trimmed.length > 0) names.add(trimmed);
  }
  return [...names];
}

// POST /api/programs/import/n8n — accepts n8n workflow JSON and creates a program.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = N8nImportBodyZ.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) {
    return apiError("Viewers cannot import programs.", 403);
  }

  const limitCheck = await checkProgramLimit(user.id, ws.workspaceId);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: "PROGRAM_LIMIT_REACHED", message: limitCheck.upgradeMessage },
      { status: 403 }
    );
  }

  if (!parsed.data.schema && !parsed.data.json) {
    return apiError("Provide either `schema` (n8n JSON object) or `json` (stringified n8n JSON)", 400);
  }

  let rawN8nJson: unknown = parsed.data.schema;
  if (!rawN8nJson && parsed.data.json) {
    try {
      rawN8nJson = JSON.parse(stripMarkdownCodeFence(parsed.data.json));
    } catch {
      return apiError("JSON could not be parsed. Check for syntax errors and try again.", 400);
    }
  }

  // Run n8n → Corelyx conversion
  let conversionResult;
  try {
    conversionResult = convertN8nToCorelyx(rawN8nJson);
  } catch (err) {
    return apiError(
      `n8n conversion failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      422
    );
  }

  const { schema: convertedSchema, warnings } = conversionResult;

  // Normalize and validate the draft
  const schemaCandidate = normalizeProgramDraft(convertedSchema);
  const draftResult = validateProgramDraft(schemaCandidate);
  if (!draftResult.success) {
    return NextResponse.json(
      {
        error: "Converted n8n workflow is not a valid workflow draft",
        message: getDraftValidationMessage(draftResult.error),
        details: draftResult.error.flatten(),
        conversion_warnings: warnings,
      },
      { status: 422 }
    );
  }

  const schema = draftResult.data as import("@flowos/schema").ProgramSchema;
  const now = new Date().toISOString();

  const finalName = parsed.data.name?.trim() || schema.program_name;
  const finalDescription = (
    parsed.data.description?.trim() ?? schema.metadata.description ?? ""
  ).trim();

  const normalizedSchema: import("@flowos/schema").ProgramSchema = {
    ...schema,
    updated_at: now,
    program_name: finalName,
    metadata: {
      ...schema.metadata,
      description: finalDescription,
    },
  };

  // Match referenced connection names to workspace connections
  const referencedConnectionNames = getSchemaConnectionNames(normalizedSchema);
  let matchedConnections: ConnectionRow[] = [];
  if (referencedConnectionNames.length > 0) {
    const { data: connectionsRaw, error: connError } = await supabase
      .from("connections")
      .select("id, name, provider, scopes")
      .eq("workspace_id", ws.workspaceId)
      .in("name", referencedConnectionNames);

    if (connError) return apiError(connError.message, 500);
    matchedConnections = (connectionsRaw ?? []) as unknown as ConnectionRow[];
  }

  const validation = validatePostGenesis(normalizedSchema, matchedConnections);
  const serviceClient = createServiceClient();

  const { data: programRaw, error: insertError } = await serviceClient
    .from("programs")
    .insert({
      user_id: user.id,
      workspace_id: ws.workspaceId,
      name: finalName,
      description: finalDescription || null,
      schema: normalizedSchema as unknown as Record<string, unknown>,
      execution_mode: normalizedSchema.execution_mode === "approval_required" ? "supervised" : normalizedSchema.execution_mode,
      is_active: normalizedSchema.metadata.is_active,
      updated_at: now,
    } as unknown as never)
    .select(
      "id, name, description, execution_mode, is_active, schema_version, created_at, updated_at"
    )
    .single();

  if (insertError || !programRaw) {
    return apiError(insertError?.message ?? "Failed to import n8n program", 500);
  }

  const program = programRaw as unknown as {
    id: string;
    name: string;
    description: string | null;
    execution_mode: string;
    is_active: boolean;
    schema_version: number;
    created_at: string;
    updated_at: string;
  };

  // Insert creator membership
  const { error: membershipError } = await serviceClient
    .from("program_memberships")
    .insert({
      program_id: program.id,
      user_id: user.id,
      role: "editor",
      created_by: user.id,
    } as unknown as never);
  if (membershipError) {
    serverLog({
      level: "error",
      event: "programs.import.n8n.membership_insert_failed",
      message: "Failed to insert creator membership; program was imported from n8n.",
    });
  }

  // Link matching connections
  if (matchedConnections.length > 0) {
    const { error: linkError } = await serviceClient.from("program_connections").insert(
      matchedConnections.map((conn) => ({
        program_id: program.id,
        connection_id: conn.id,
      })) as unknown as never
    );
    if (linkError) {
      serverLog({
        level: "error",
        event: "programs.import.n8n.connection_link_failed",
        message: "Failed to link connections to imported n8n program.",
      });
    }
  }

  // Store initial version snapshot
  const { error: versionErr } = await serviceClient.from("program_versions").insert({
    program_id: program.id,
    version: 0,
    schema: normalizedSchema as unknown as Record<string, unknown>,
    change_summary: "Imported from n8n workflow",
  } as unknown as never);

  if (versionErr) {
    serverLog({
      level: "error",
      event: "programs.import.n8n.version_insert_failed",
      message: "Failed to store version snapshot for imported n8n program.",
    });
  }

  const linkedConnectionNames = new Set(matchedConnections.map((conn) => conn.name));
  const missingConnectionNames = referencedConnectionNames.filter(
    (name) => !linkedConnectionNames.has(name)
  );

  return NextResponse.json(
    {
      program,
      validation,
      conversion_warnings: warnings,
      linked_connection_names: [...linkedConnectionNames],
      missing_connection_names: missingConnectionNames,
    },
    { status: 201 }
  );
}
