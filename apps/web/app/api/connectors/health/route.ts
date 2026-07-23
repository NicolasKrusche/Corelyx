import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthStatus = "healthy" | "warning" | "critical";

type ConnectorHealthSummary = {
  connector_name: string;
  status: HealthStatus;
  status_icon: "🟢" | "🟡" | "🔴";
  last_checked_at: string | null;
  error_message: string | null;
  retry_count: number;
  next_retry_at: string | null;
  latency_ms: number | null;
  check_type: string;
};

type ConnectorHealthReport = {
  connectors: ConnectorHealthSummary[];
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  needs_attention: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the latest health event per connector for a workspace from
 * the `connector_health_events` table.  Server-side only — never
 * exposes credentials or raw tokens.
 */
async function getConnectorHealthReport(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceId: string,
): Promise<ConnectorHealthReport> {
  const { data, error } = await serviceClient
    .from("connector_health_events" as never)
    .select(
      "connector_name, status, error_message, retry_count, next_retry_at, checked_at, latency_ms, check_type",
    )
    .eq("workspace_id", workspaceId)
    .order("checked_at", { ascending: false })
    .limit(500);

  if (error || !data) {
    console.error("Failed to fetch connector health events:", error);
    return {
      connectors: [],
      total: 0,
      healthy: 0,
      warning: 0,
      critical: 0,
      needs_attention: [],
    };
  }

  // Deduplicate: keep only the most recent event per connector
  const seen = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const name = row.connector_name as string;
    if (!seen.has(name)) {
      seen.set(name, row);
    }
  }

  const connectors: ConnectorHealthSummary[] = [];
  const needsAttention: string[] = [];
  let healthy = 0;
  let warning = 0;
  let critical = 0;

  for (const [name, row] of seen) {
    const status = row.status as HealthStatus;
    const statusIcon: "🟢" | "🟡" | "🔴" =
      status === "healthy" ? "🟢" : status === "warning" ? "🟡" : "🔴";

    if (status === "healthy") healthy++;
    else if (status === "warning") {
      warning++;
      needsAttention.push(name);
    } else {
      critical++;
      needsAttention.push(name);
    }

    connectors.push({
      connector_name: name,
      status,
      status_icon: statusIcon,
      last_checked_at: (row.checked_at as string) ?? null,
      error_message: (row.error_message as string) ?? null,
      retry_count: (row.retry_count as number) ?? 0,
      next_retry_at: (row.next_retry_at as string) ?? null,
      latency_ms: (row.latency_ms as number) ?? null,
      check_type: (row.check_type as string) ?? "connection_test",
    });
  }

  return {
    connectors,
    total: connectors.length,
    healthy,
    warning,
    critical,
    needs_attention: needsAttention,
  };
}

/**
 * Trigger a manual health check by calling the runtime's health check
 * endpoint. The runtime performs the actual upstream API checks and stores
 * results in connector_health_events.  Credentials stay server-side.
 */
async function triggerHealthCheck(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  connectorName?: string,
): Promise<{ accepted: boolean; message: string }> {
  const runtimeUrl = process.env.RUNTIME_INTERNAL_URL;
  if (!runtimeUrl) {
    return { accepted: false, message: "Runtime URL not configured" };
  }

  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return { accepted: false, message: "Internal API secret not configured" };
  }

  try {
    const res = await fetch(`${runtimeUrl}/connectors/health/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        connector_name: connectorName,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return {
        accepted: false,
        message: body?.error ?? `Runtime returned HTTP ${res.status}`,
      };
    }

    return { accepted: true, message: "Health check triggered" };
  } catch (err) {
    console.error("Failed to trigger health check:", err);
    return {
      accepted: false,
      message: err instanceof Error ? err.message : "Failed to reach runtime",
    };
  }
}

// ---------------------------------------------------------------------------
// GET /api/connectors/health
// Returns per-connector health status (🟢/🟡/🔴) for the active workspace.
// Never exposes raw tokens, Vault IDs, or credential values.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError("Unauthorized", 401);

    const ws = await getActiveWorkspace(user.id);
    if (!ws) return apiError("No active workspace", 400);

    const serviceClient = createServiceClient();
    const report = await getConnectorHealthReport(serviceClient, ws.workspaceId);

    return NextResponse.json(report satisfies ConnectorHealthReport);
  } catch (error) {
    console.error("Connector health API error:", error);
    return apiError("Internal Server Error", 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/connectors/health/check
// Triggers a manual health check for all connectors (or a specific one).
// Returns the updated health report after checks complete.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError("Unauthorized", 401);

    const ws = await getActiveWorkspace(user.id);
    if (!ws) return apiError("No active workspace", 400);

    // Parse optional body for connector-specific checks
    let connectorName: string | undefined;
    try {
      const body = await request.json();
      connectorName = body?.connector_name;
    } catch {
      // No body or invalid JSON — check all connectors
    }

    const serviceClient = createServiceClient();

    // Trigger the health check via the runtime
    const result = await triggerHealthCheck(
      serviceClient,
      ws.workspaceId,
      connectorName,
    );

    if (!result.accepted) {
      return apiError(result.message, 502);
    }

    // Return the current health status (pre-check or partially updated)
    const report = await getConnectorHealthReport(serviceClient, ws.workspaceId);

    return NextResponse.json({
      ...report,
      check_triggered: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Connector health check API error:", error);
    return apiError("Internal Server Error", 500);
  }
}
