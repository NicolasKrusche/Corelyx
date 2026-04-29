import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getValidInternalServiceClaims } from "@/lib/internal-auth";
import { getValidOAuthToken } from "@/lib/oauth-token";

// GET /api/internal/connections/[id]/token
// Called by the Python runtime to get a valid (auto-refreshed) OAuth token for a connection.
// Header: x-internal-service-token: <scoped signed token, subject=user_id>
// Returns: { access_token: string }
//
// S14: token MUST carry a subject claim (user_id of the run owner) and the
// connection's user_id must match. Bounds blast radius of a leaked token.
export async function GET(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const claims = getValidInternalServiceClaims(
    request.headers,
    "next:connections:token"
  );
  if (!claims) {
    return apiError("Unauthorized", 401);
  }
  if (!claims.sub) {
    return apiError("Unauthorized: token missing subject", 401);
  }

  const { id } = params;
  if (!id) return apiError("Missing connection id", 400);

  const serviceClient = createServiceClient();

  type ConnectionRow = { id: string; user_id: string };
  const { data: connRowRaw, error: connErr } = await serviceClient
    .from("connections")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (connErr || !connRowRaw) {
    return apiError("Connection not found", 404);
  }
  const connRow = connRowRaw as unknown as ConnectionRow;
  if (connRow.user_id !== claims.sub) {
    return apiError("Connection not found", 404);
  }

  const forceRefresh = new URL(request.url).searchParams.get("force_refresh") === "true";

  let accessToken: string;
  try {
    accessToken = await getValidOAuthToken(serviceClient, id, forceRefresh);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to retrieve token";
    return apiError(message, 500);
  }

  return NextResponse.json({ access_token: accessToken });
}
