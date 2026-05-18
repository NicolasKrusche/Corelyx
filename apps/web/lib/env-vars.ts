import { createServiceClient } from "@/lib/api";
import { vaultRetrieve } from "@/lib/vault";

/**
 * Resolve all workspace env vars to their plaintext values.
 * Uses the service-role client so it bypasses RLS and can call vault_retrieve_secret.
 * Only call this server-side (API routes, server actions).
 *
 * Returns a flat { NAME: "value" } record — empty object if none defined.
 */
export async function resolveWorkspaceEnvVars(
  workspaceId: string
): Promise<Record<string, string>> {
  const serviceClient = createServiceClient();

  const { data, error } = await serviceClient
    .from("workspace_env_vars")
    .select("name, vault_secret_id")
    .eq("workspace_id", workspaceId);

  if (error || !data || data.length === 0) return {};

  type Row = { name: string; vault_secret_id: string };
  const rows = data as unknown as Row[];

  const result: Record<string, string> = {};
  await Promise.all(
    rows.map(async (row) => {
      try {
        result[row.name] = await vaultRetrieve(serviceClient, row.vault_secret_id);
      } catch {
        // A single failed retrieval should not abort the whole dispatch.
        // The runtime will surface a clearer error if the var is referenced.
      }
    })
  );

  return result;
}
