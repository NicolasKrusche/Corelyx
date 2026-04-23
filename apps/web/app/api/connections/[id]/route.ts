import { NextResponse } from "next/server";
import type { ProgramSchema } from "@flowos/schema";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { vaultDelete } from "@/lib/vault";
import { getValidOAuthToken } from "@/lib/oauth-token";
import { getPrimaryConnectionName } from "@/lib/connection-utils";

type AppSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;
type ProgramRecord = {
  id: string;
  schema: unknown;
  schema_version: number | null;
};

// DELETE /api/connections/:id
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const userId = user.id;

  const { data: rowRaw, error: fetchError } = await supabase
    .from("connections")
    .select("vault_secret_id")
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  const row = rowRaw as { vault_secret_id: string } | null;
  if (fetchError || !row) return apiError("Connection not found", 404);

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

// POST /api/connections/:id — live ping (test connection validity)
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const userId = user.id;

  const { data: rowRaw, error: fetchError } = await supabase
    .from("connections")
    .select("provider")
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  const row = rowRaw as { provider: string } | null;
  if (fetchError || !row) return apiError("Connection not found", 404);

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

// PATCH /api/connections/:id — connection settings actions
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const userId = user.id;

  const body = await request.json().catch(() => null) as { action?: string } | null;
  if (body?.action !== "set_primary") return apiError("Invalid action", 400);

  const { data: targetRaw, error: targetError } = await supabase
    .from("connections")
    .select("id, name, provider")
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  if (targetError || !targetRaw) return apiError("Connection not found", 404);

  const target = targetRaw as { id: string; name: string; provider: string };
  const primaryName = getPrimaryConnectionName(target.provider);
  if (target.name === primaryName) {
    return NextResponse.json({ ok: true, already_primary: true });
  }

  const { data: providerRowsRaw, error: providerError } = await supabase
    .from("connections")
    .select("id, name, provider")
    .eq("user_id", userId)
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
      .eq("id", target.id)
      .eq("user_id", userId);

    if (!currentPrimary) return;

    await supabase
      .from("connections")
      .update({ name: primaryName, updated_at: now } as unknown as never)
      .eq("id", currentPrimary.id)
      .eq("user_id", userId);
  }

  if (currentPrimary && tempName) {
    const { error: tempError } = await supabase
      .from("connections")
      .update({ name: tempName, updated_at: now } as unknown as never)
      .eq("id", currentPrimary.id)
      .eq("user_id", userId);

    if (tempError) return apiError(tempError.message, 500);
  }

  const { error: targetUpdateError } = await supabase
    .from("connections")
    .update({ name: primaryName, updated_at: now } as unknown as never)
    .eq("id", target.id)
    .eq("user_id", userId);

  if (targetUpdateError) {
    await restoreConnectionNames();
    return apiError(targetUpdateError.message, 500);
  }

  if (currentPrimary) {
    const { error: primaryUpdateError } = await supabase
      .from("connections")
      .update({ name: targetOldName, updated_at: now } as unknown as never)
      .eq("id", currentPrimary.id)
      .eq("user_id", userId);

    if (primaryUpdateError) {
      await restoreConnectionNames();
      return apiError(primaryUpdateError.message, 500);
    }
  }

  try {
    await migrateProgramsForPrimarySwitch(supabase, {
      userId,
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
    userId: string;
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
    .eq("user_id", params.userId);

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
      .eq("id", program.id)
      .eq("user_id", params.userId);

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
