import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@flowos/db";
import { vaultDelete, vaultRetrieve, vaultStore } from "@/lib/vault";

type Client = SupabaseClient<Database>;
type SecretRow = { id: string; vault_secret_id: string };

export async function storeConnectionWebhookSecret(
  supabase: Client,
  params: {
    connectionId: string;
    provider: string;
    secretName: string;
    secretValue: string;
  }
): Promise<void> {
  const { data: existingRaw } = await supabase
    .from("connection_webhook_secrets")
    .select("id, vault_secret_id")
    .eq("connection_id", params.connectionId)
    .eq("provider", params.provider)
    .eq("secret_name", params.secretName)
    .maybeSingle();

  const existing = existingRaw as unknown as SecretRow | null;
  const vaultSecretId = await vaultStore(
    supabase,
    params.secretValue,
    `webhook:${params.provider}:${params.connectionId}:${params.secretName}`,
    `Webhook secret for ${params.provider} connection ${params.connectionId}`
  );

  const payload = {
    connection_id: params.connectionId,
    provider: params.provider,
    secret_name: params.secretName,
    vault_secret_id: vaultSecretId,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase
        .from("connection_webhook_secrets")
        .update(payload as unknown as never)
        .eq("id", existing.id)
    : await supabase
        .from("connection_webhook_secrets")
        .insert(payload as unknown as never);

  if (error) {
    await vaultDelete(supabase, vaultSecretId).catch(() => undefined);
    throw new Error(`Failed to store webhook secret reference: ${error.message}`);
  }

  if (existing?.vault_secret_id && existing.vault_secret_id !== vaultSecretId) {
    await vaultDelete(supabase, existing.vault_secret_id).catch(() => undefined);
  }
}

export async function retrieveConnectionWebhookSecret(
  supabase: Client,
  params: {
    connectionId: string;
    provider: string;
    secretName: string;
  }
): Promise<string | null> {
  const { data } = await supabase
    .from("connection_webhook_secrets")
    .select("vault_secret_id")
    .eq("connection_id", params.connectionId)
    .eq("provider", params.provider)
    .eq("secret_name", params.secretName)
    .maybeSingle();

  const row = data as unknown as { vault_secret_id: string } | null;
  if (!row?.vault_secret_id) return null;

  return vaultRetrieve(supabase, row.vault_secret_id);
}
