import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getValidInternalServiceClaims } from "@/lib/internal-auth";
import { vaultRetrieve } from "@/lib/vault";

// GET /api/internal/vault/[ref]
// Called by the Python runtime to resolve API key refs.
// Header: x-internal-service-token: <scoped signed token, subject=user_id>
// Returns: { value: string }
// ref is the api_key id (UUID) — looks up vault_secret_id, fetches from Vault.
//
// S14: the token MUST carry a subject claim (user_id of the run owner) and
// the looked-up api_keys.user_id must match it. This contains the blast radius
// of a leaked or misused internal-service token to a single user.
export async function GET(
  request: Request,
  { params: routeParams }: { params: Promise<{ ref: string }> }
) {
  const params = await routeParams;
  const claims = getValidInternalServiceClaims(request.headers, "next:vault", {
    method: "GET",
    path: new URL(request.url).pathname,
  });
  if (!claims) {
    return apiError("Unauthorized", 401);
  }
  if (!claims.sub) {
    return apiError("Unauthorized: token missing subject", 401);
  }

  const { ref } = params;
  if (!ref) return apiError("Missing ref", 400);

  const serviceClient = createServiceClient();

  // Look up the api_key row to get vault_secret_id and verify ownership.
  type ApiKeyRow = {
    id: string;
    provider: string;
    user_id: string;
    vault_secret_id: string | null;
  };

  const { data: rawRow, error: keyError } = await serviceClient
    .from("api_keys")
    .select("id, provider, user_id, vault_secret_id")
    .eq("id", ref)
    .single();

  if (keyError || !rawRow) {
    return apiError("API key not found", 404);
  }

  const row = rawRow as unknown as ApiKeyRow;

  if (row.user_id !== claims.sub) {
    // 404 (not 403) so an attacker can't probe whether a given api_key id exists.
    return apiError("API key not found", 404);
  }

  if (!row.vault_secret_id) {
    return apiError("API key has no vault secret", 404);
  }

  // Retrieve from Vault — value is never logged
  let value: string;
  try {
    value = await vaultRetrieve(serviceClient, row.vault_secret_id);
  } catch {
    return apiError("Failed to retrieve secret from vault", 500);
  }

  // Stamp last_used_at — fire-and-forget, never blocks the response.
  void serviceClient
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq("id", ref);

  return NextResponse.json({ value, provider: row.provider });
}
