import { NextResponse } from "next/server";
import type { ProgramSchema } from "@flowos/schema";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { vaultDelete } from "@/lib/vault";
import { getValidOAuthToken } from "@/lib/oauth-token";
import { getPrimaryConnectionName } from "@/lib/connection-utils";
import { canContributeToWorkspace, getWorkspaceRole } from "@/lib/workspaces";

type AppSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;
type ProgramRecord = {
  id: string;
  schema: unknown;
  schema_version: number | null;
};

async function loadConnectionForUser(
  supabase: AppSupabaseClient,
  connectionId: string,
  userId: string,
  columns: string,
  level: "view" | "write"
) {
  const { data, error } = await supabase
    .from("connections")
    .select(`${columns}, workspace_id`)
    .eq("id", connectionId)
    .single();

  if (error || !data) return { error: apiError("Connection not found", 404) };
  const row = data as Record<string, unknown> & { workspace_id: string };

  const role = await getWorkspaceRole(row.workspace_id, userId);
  if (!role) return { error: apiError("Connection not found", 404) };
  if (level === "write" && !canContributeToWorkspace(role)) {
    return { error: apiError("Viewers cannot modify connections.", 403) };
  }
  return { row, workspaceId: row.workspace_id, role };
}

// DELETE /api/connections/:id — workspace contributor.
export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const result = await loadConnectionForUser(supabase, params.id, user.id, "vault_secret_id", "write");
  if ("error" in result) return result.error;
  const row = result.row as unknown as { vault_secret_id: string };

  // Delete from Vault first. If this fails, do not remove DB row (avoid orphaned secret state).
  try {
    const serviceClient = createServiceClient();
    await vaultDelete(serviceClient, row.vault_secret_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown vault deletion error";
    console.error(`[connections.delete] Vault delete failed for connection ${params.id}: ${message}`);
    return apiError("Failed to delete connection secret from vault. Connection was not deleted.", 502);
  }

  const { error } = await supabase.from("connections").delete().eq("id", params.id);
  if (error) return apiError(error.message, 500);

  return new NextResponse(null, { status: 204 });
}

// POST /api/connections/:id — live ping (any workspace member).
export async function POST(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const result = await loadConnectionForUser(supabase, params.id, user.id, "provider", "view");
  if ("error" in result) return result.error;
  const row = result.row as unknown as { provider: string };

  const serviceClient = createServiceClient();
  let accessToken: string;
  try {
    // getValidOAuthToken handles token refresh + vault rotation transparently
    accessToken = await getValidOAuthToken(serviceClient, params.id);
  } catch {
    await supabase
      .from("connections")
      .update({ is_valid: false, last_validated_at: new Date().toISOString() } as unknown as never)
      .eq("id", params.id);
    return NextResponse.json({ is_valid: false });
  }

  const isValid = await pingProvider(row.provider, accessToken);

  await supabase
    .from("connections")
    .update({ is_valid: isValid, last_validated_at: new Date().toISOString() } as unknown as never)
    .eq("id", params.id);

  return NextResponse.json({ is_valid: isValid });
}

// PATCH /api/connections/:id — connection settings actions (contributor).
export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null) as { action?: string } | null;
  if (body?.action !== "set_primary") return apiError("Invalid action", 400);

  const targetResult = await loadConnectionForUser(
    supabase,
    params.id,
    user.id,
    "id, name, provider",
    "write"
  );
  if ("error" in targetResult) return targetResult.error;
  const target = targetResult.row as unknown as { id: string; name: string; provider: string };
  const workspaceId = targetResult.workspaceId;

  const primaryName = getPrimaryConnectionName(target.provider);
  if (target.name === primaryName) {
    return NextResponse.json({ ok: true, already_primary: true });
  }

  const { data: providerRowsRaw, error: providerError } = await supabase
    .from("connections")
    .select("id, name, provider")
    .eq("workspace_id", workspaceId)
    .eq("provider", target.provider);

  if (providerError) return apiError(providerError.message, 500);

  const providerRows = (providerRowsRaw ?? []) as Array<{ id: string; name: string; provider: string }>;
  const currentPrimary = providerRows.find((row) => row.name === primaryName && row.id !== target.id) ?? null;
  const targetOldName = target.name;
  const now = new Date().toISOString();
  const tempName = currentPrimary ? `${target.provider}:swap:${Date.now()}` : null;

  async function restoreConnectionNames() {
    await supabase
      .from("connections")
      .update({ name: targetOldName, updated_at: now } as unknown as never)
      .eq("id", target.id);

    if (!currentPrimary) return;

    await supabase
      .from("connections")
      .update({ name: primaryName, updated_at: now } as unknown as never)
      .eq("id", currentPrimary.id);
  }

  if (currentPrimary && tempName) {
    const { error: tempError } = await supabase
      .from("connections")
      .update({ name: tempName, updated_at: now } as unknown as never)
      .eq("id", currentPrimary.id);

    if (tempError) return apiError(tempError.message, 500);
  }

  const { error: targetUpdateError } = await supabase
    .from("connections")
    .update({ name: primaryName, updated_at: now } as unknown as never)
    .eq("id", target.id);

  if (targetUpdateError) {
    await restoreConnectionNames();
    return apiError(targetUpdateError.message, 500);
  }

  if (currentPrimary) {
    const { error: primaryUpdateError } = await supabase
      .from("connections")
      .update({ name: targetOldName, updated_at: now } as unknown as never)
      .eq("id", currentPrimary.id);

    if (primaryUpdateError) {
      await restoreConnectionNames();
      return apiError(primaryUpdateError.message, 500);
    }
  }

  try {
    await migrateProgramsForPrimarySwitch(supabase, {
      workspaceId,
      provider: target.provider,
      oldName: targetOldName,
      primaryName,
      targetId: target.id,
      changedAt: now,
    });
  } catch (error) {
    await restoreConnectionNames();
    const message = error instanceof Error ? error.message : "Failed to update linked programs";
    return apiError(message, 500);
  }

  return NextResponse.json({ ok: true });
}

async function pingProvider(provider: string, accessToken: string): Promise<boolean> {
  try {
    switch (provider) {
      case "gmail":
      case "sheets":
      case "calendar":
      case "docs":
      case "drive":
        return (await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        })).ok;

      case "notion":
        return (await fetch("https://api.notion.com/v1/users/me", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Notion-Version": "2022-06-28",
          },
          cache: "no-store",
        })).ok;

      case "slack": {
        const res = await fetch("https://slack.com/api/auth.test", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const data = await res.json() as { ok: boolean };
        return data.ok === true;
      }

      case "github":
        return (await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          cache: "no-store",
        })).ok;

      case "airtable":
        return (await fetch("https://api.airtable.com/v0/meta/whoami", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        })).ok;

      case "hubspot":
        return (await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`, {
          cache: "no-store",
        })).ok;

      case "outlook":
        return (await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        })).ok;

      case "asana":
        return (await fetch("https://app.asana.com/api/1.0/users/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        })).ok;

      case "typeform":
        return (await fetch("https://api.typeform.com/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        })).ok;

      default:
        return true;
    }
  } catch {
    return false;
  }
}

async function migrateProgramsForPrimarySwitch(
  supabase: AppSupabaseClient,
  params: {
    workspaceId: string;
    provider: string;
    oldName: string;
    primaryName: string;
    targetId: string;
    changedAt: string;
  },
) {
  const { data: programsRaw, error: programsError } = await supabase
    .from("programs")
    .select("id, schema, schema_version")
    .eq("workspace_id", params.workspaceId);

  if (programsError) {
    throw new Error(programsError.message);
  }

  const programs = (programsRaw ?? []) as ProgramRecord[];
  const linkPairs = new Set<string>();

  for (const program of programs) {
    const renamedSchema = renameProgramConnection(program.schema, params.oldName, params.primaryName, params.changedAt);
    const usesPrimary = programUsesConnectionName(
      renamedSchema ?? program.schema,
      params.primaryName,
    );

    if (!renamedSchema && !usesPrimary) continue;

    linkPairs.add(`${program.id}:${params.targetId}`);

    if (!renamedSchema) continue;

    const nextVersion = (program.schema_version ?? 0) + 1;
    const { error: updateError } = await supabase
      .from("programs")
      .update({
        schema: renamedSchema as unknown,
        schema_version: nextVersion,
        updated_at: params.changedAt,
      } as unknown as never)
      .eq("id", program.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await supabase.from("program_versions").insert({
      program_id: program.id,
      version: nextVersion,
      schema: renamedSchema as unknown,
      change_summary: `Switched ${params.provider} primary account`,
    } as unknown as never);
  }

  if (linkPairs.size === 0) return;

  const linkRows = [...linkPairs].map((pair) => {
    const [program_id, connection_id] = pair.split(":");
    return { program_id, connection_id };
  });

  const { error: linkError } = await supabase
    .from("program_connections")
    .upsert(linkRows as unknown as never, {
      onConflict: "program_id,connection_id",
      ignoreDuplicates: true,
    });

  if (linkError) {
    throw new Error(linkError.message);
  }
}

function programUsesConnectionName(schema: unknown, connectionName: string): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;

  const nodes = (schema as { nodes?: Array<{ connection?: string | null }> }).nodes;
  if (!Array.isArray(nodes)) return false;

  return nodes.some((node) => node?.connection === connectionName);
}

function renameProgramConnection(
  schema: unknown,
  oldName: string,
  nextName: string,
  changedAt: string,
): ProgramSchema | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;

  const programSchema = schema as ProgramSchema;
  if (!Array.isArray(programSchema.nodes)) return null;

  let changed = false;
  const nextNodes = programSchema.nodes.map((node) => {
    if (node.connection !== oldName) return node;

    changed = true;
    return { ...node, connection: nextName };
  });

  if (!changed) return null;

  return {
    ...programSchema,
    updated_at: changedAt,
    nodes: nextNodes,
  };
}
