import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { vaultStore, vaultDelete } from "@/lib/vault";
import { canContributeToWorkspace, getActiveWorkspace } from "@/lib/workspaces";

// DELETE /api/env-vars/[id] — remove an env var and its vault secret.
export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const { id } = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) {
    return apiError("Viewers cannot delete environment variables.", 403);
  }

  const serviceClient = createServiceClient();

  // Fetch the row to get vault_secret_id (and verify ownership)
  type EnvVarRow = { id: string; vault_secret_id: string; workspace_id: string };
  const { data: rowRaw, error: fetchError } = await serviceClient
    .from("workspace_env_vars")
    .select("id, vault_secret_id, workspace_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !rowRaw) return apiError("Variable not found", 404);
  const row = rowRaw as unknown as EnvVarRow;

  if (row.workspace_id !== ws.workspaceId) return apiError("Variable not found", 404);

  // Delete the vault secret first (fail-safe: if vault fails, leave DB row intact)
  try {
    await vaultDelete(serviceClient, row.vault_secret_id);
  } catch (err) {
    console.error("[env-vars/delete] vault delete failed:", err);
    return apiError("Failed to remove value from vault. The variable was not deleted.", 500);
  }

  const { error: deleteError } = await serviceClient
    .from("workspace_env_vars")
    .delete()
    .eq("id", id);

  if (deleteError) return apiError("Failed to delete variable", 500);
  return new NextResponse(null, { status: 204 });
}

// PATCH /api/env-vars/[id] — update the value of an existing env var.
const UpdateSchema = z.object({
  value: z.string().min(1, "Value cannot be empty"),
});

export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const { id } = await routeParams;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) {
    return apiError("Viewers cannot update environment variables.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  type EnvVarRow = { id: string; name: string; vault_secret_id: string; workspace_id: string };
  const { data: rowRaw, error: fetchError } = await serviceClient
    .from("workspace_env_vars")
    .select("id, name, vault_secret_id, workspace_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !rowRaw) return apiError("Variable not found", 404);
  const row = rowRaw as unknown as EnvVarRow;
  if (row.workspace_id !== ws.workspaceId) return apiError("Variable not found", 404);

  // Delete old vault secret and store new one
  try {
    await vaultDelete(serviceClient, row.vault_secret_id);
  } catch {
    // Non-fatal — vault may have already been cleaned up
  }

  let newVaultId: string;
  try {
    newVaultId = await vaultStore(
      serviceClient,
      parsed.data.value,
      `envvar:${ws.workspaceId}:${row.name}`,
      `Env var ${row.name} — workspace ${ws.workspaceId}`
    );
  } catch (err) {
    return apiError(`Failed to store new value: ${(err as Error).message}`, 500);
  }

  const { data, error } = await serviceClient
    .from("workspace_env_vars")
    .update({
      vault_secret_id: newVaultId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .select("id, name, created_by, created_at, updated_at")
    .single();

  if (error) return apiError("Failed to update variable", 500);
  return NextResponse.json(data);
}
