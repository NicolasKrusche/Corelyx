import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getValidInternalServiceClaims } from "@/lib/internal-auth";
import { getValidOAuthToken, TransientTokenRefreshError } from "@/lib/oauth-token";
import { OAuthRefreshLockTimeoutError } from "@/lib/oauth-refresh-lock";

// A refresh may wait on the shared credential lock (up to ~25s) before it even
// starts. Keep the function alive past the platform default so a slow-but-
// successful refresh answers instead of being killed mid-flight.
export const maxDuration = 60;

// GET /api/internal/connections/[id]/token
// Called by the Python runtime to get a valid (auto-refreshed) OAuth token for a connection.
// Header: x-internal-service-token: <scoped signed token, subject=user_id>
// Returns: { access_token: string }
//
// S14: token MUST carry a subject claim (user_id of the run owner) and either:
//   (a) the connection's user_id must match (direct ownership), OR
//   (b) the connection belongs to a workspace the subject user is a member of
//       (workspace-shared connections — needed for multi-user workspaces).
// Both paths bound the blast radius of a leaked token to workspace boundaries.
export async function GET(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const claims = getValidInternalServiceClaims(
    request.headers,
    "next:connections:token",
    {
      method: "GET",
      path: new URL(request.url).pathname,
    }
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

  type ConnectionRow = { id: string; user_id: string; workspace_id: string | null };
  const { data: connRowRaw, error: connErr } = await serviceClient
    .from("connections")
    .select("id, user_id, workspace_id")
    .eq("id", id)
    .single();

  if (connErr || !connRowRaw) {
    return apiError("Connection not found", 404);
  }
  const connRow = connRowRaw as unknown as ConnectionRow;

  // (a) Direct ownership — fast path, no extra DB round-trip.
  const isOwner = connRow.user_id === claims.sub;

  // (b) Workspace membership — allows workspace-shared connections where
  //     user_id reflects the connection creator, not the program runner.
  let isWorkspaceMember = false;
  if (!isOwner && connRow.workspace_id) {
    const { data: membership } = await serviceClient
      .from("workspace_memberships")
      .select("role")
      .eq("workspace_id", connRow.workspace_id)
      .eq("user_id", claims.sub)
      .maybeSingle();
    isWorkspaceMember = Boolean(membership);
  }

  if (!isOwner && !isWorkspaceMember) {
    return apiError("Connection not found", 404);
  }

  const forceRefresh = new URL(request.url).searchParams.get("force_refresh") === "true";

  let accessToken: string;
  try {
    accessToken = await getValidOAuthToken(serviceClient, id, forceRefresh);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to retrieve token";
    // Lock contention and provider timeouts are transient — a retry moments
    // later usually succeeds (often via the fast path, because the concurrent
    // refresher finished). 503 tells the runtime to retry instead of failing
    // the whole run.
    if (err instanceof OAuthRefreshLockTimeoutError || err instanceof TransientTokenRefreshError) {
      return apiError(message, 503);
    }
    return apiError(message, 500);
  }

  return NextResponse.json({ access_token: accessToken });
}
