import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getValidInternalServiceClaims } from "@/lib/internal-auth";
import { getValidOAuthToken, TransientTokenRefreshError } from "@/lib/oauth-token";
import { OAuthRefreshLockTimeoutError } from "@/lib/oauth-refresh-lock";
import { checkConnectorAccess } from "@/lib/limits";
import { serverLog } from "@/lib/server-log";

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

  type ConnectionRow = {
    id: string;
    user_id: string;
    workspace_id: string | null;
    provider: string;
    disabled_reason: string | null;
  };

  const BASE_COLUMNS = "id, user_id, workspace_id, provider";

  // disabled_reason is requested separately from the columns we cannot run
  // without. PostgREST rejects the *entire* select when one column is missing,
  // so naming a not-yet-migrated column here would fail every token fetch on
  // every connection — a total execution outage, not a degraded gate. This DB
  // has drifted from its migration files repeatedly (see the same defensive
  // note in lib/limits.ts getBillingScope), so the deploy order is not assumed:
  // one round-trip when the column exists, a fallback only until it does.
  let connRowRaw: unknown = null;
  let connErr: { message?: string } | null = null;

  {
    const withGate = await serviceClient
      .from("connections")
      .select(`${BASE_COLUMNS}, disabled_reason`)
      .eq("id", id)
      .single();

    if (!withGate.error) {
      connRowRaw = withGate.data;
    } else {
      const base = await serviceClient
        .from("connections")
        .select(BASE_COLUMNS)
        .eq("id", id)
        .single();
      connRowRaw = base.data;
      connErr = base.error;
      if (base.data) {
        serverLog({
          level: "warn",
          event: "connections.token.disabled_reason_missing",
          message:
            "connections.disabled_reason is not present; tier-downgrade disabling is inert until " +
            "migration 20260730120000_connection_disabled_reason.sql is applied.",
        });
      }
    }
  }

  if (connErr || !connRowRaw) {
    return apiError("Connection not found", 404);
  }
  const connRow = connRowRaw as ConnectionRow;

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

  // Entitlement enforcement at the execution boundary.
  //
  // Connect-time checks alone left a "pay once, keep forever" hole: a user could
  // subscribe, connect a gated provider, cancel, and keep executing against the
  // stored credential indefinitely, because nothing re-checked the plan after
  // the row existed. This endpoint is the single chokepoint every execution
  // passes through — runtime, agents, desktop, and mobile all fetch tokens here
  // — so one check covers all of them, and a downgrade takes effect on the very
  // next run rather than never.
  //
  // Scoped to the connection's own workspace/owner, not the caller: a workspace
  // member's personal plan must not grant access to a credential the workspace
  // is no longer entitled to (or vice versa).
  if (connRow.disabled_reason ?? null) {
    return apiError(
      `Connection is disabled (${connRow.disabled_reason}). Reconnect it or upgrade your plan to resume.`,
      403
    );
  }

  const access = await checkConnectorAccess(
    connRow.user_id,
    connRow.provider,
    connRow.workspace_id
  );
  if (!access.allowed) {
    return apiError(access.upgradeMessage ?? access.reason ?? "Plan upgrade required", 403);
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
