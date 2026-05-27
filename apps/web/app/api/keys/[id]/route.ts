import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { vaultRetrieve, vaultDelete } from "@/lib/vault";
import { canContributeToWorkspace, getWorkspaceRole } from "@/lib/workspaces";
import { serverLog } from "@/lib/server-log";

// DELETE /api/keys/:id
export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { data: row, error: fetchError } = await supabase
    .from("api_keys")
    .select("vault_secret_id, workspace_id")
    .eq("id", params.id)
    .single();

  if (fetchError || !row) return apiError("Key not found", 404);

  const keyRow = row as unknown as { vault_secret_id: string; workspace_id: string };
  const role = await getWorkspaceRole(keyRow.workspace_id, user.id);
  if (!role) return apiError("Key not found", 404);
  if (!canContributeToWorkspace(role)) {
    return apiError("Viewers cannot delete keys.", 403);
  }

  // Delete from Vault first. If this fails, do not remove DB row (avoid orphaned secret state).
  try {
    const serviceClient = createServiceClient();
    await vaultDelete(serviceClient, keyRow.vault_secret_id);
  } catch (err) {
    serverLog({ level: "error", event: "keys.delete.vault_failed", message: "Vault delete failed; key row not removed." });
    return apiError("Failed to delete key secret from vault. Key was not deleted.", 502);
  }

  const { error } = await supabase.from("api_keys").delete().eq("id", params.id);
  if (error) return apiError(error.message, 500);

  return new NextResponse(null, { status: 204 });
}

// POST /api/keys/:id/validate — check the key is still valid
export async function POST(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { data: row, error: fetchError } = await supabase
    .from("api_keys")
    .select("provider, vault_secret_id, workspace_id")
    .eq("id", params.id)
    .single();

  if (fetchError || !row) return apiError("Key not found", 404);

  const keyRow = row as unknown as { provider: string; vault_secret_id: string; workspace_id: string };
  const role = await getWorkspaceRole(keyRow.workspace_id, user.id);
  if (!role) return apiError("Key not found", 404);

  const serviceClient = createServiceClient();
  let keyValue: string;
  try {
    keyValue = await vaultRetrieve(serviceClient, keyRow.vault_secret_id);
  } catch {
    return apiError("Failed to retrieve key from vault", 500);
  }

  const isValid = await probeKey(keyRow.provider, keyValue);

  await supabase
    .from("api_keys")
    .update({ is_valid: isValid, last_validated_at: new Date().toISOString() } as never)
    .eq("id", params.id);

  return NextResponse.json({ is_valid: isValid });
}

async function probeKey(provider: string, key: string): Promise<boolean> {
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        cache: "no-store",
      });
      return res.ok;
    }
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      return res.ok;
    }
    if (provider === "google") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
        { cache: "no-store" }
      );
      return res.ok;
    }
    // For other providers, assume valid if non-empty
    return key.length > 0;
  } catch {
    return false;
  }
}
