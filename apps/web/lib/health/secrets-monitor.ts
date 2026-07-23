/**
 * Secrets Health Monitor — server-side only.
 * Evaluates the health of stored credentials (OAuth tokens, API keys)
 * in Supabase Vault and reports expiry, scope drift, and rotation status.
 *
 * Credentials are NEVER returned to callers — only metadata and health status.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@flowos/db";

type Client = SupabaseClient<Database>;

// ─── Types ─────────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "warning" | "critical";

export type ConnectionHealth = {
  connectionId: string;
  name: string;
  provider: string;
  authType: string;
  status: HealthStatus;
  /** Human-readable status label: 🟢 / 🟡 / 🔴 */
  statusIcon: "🟢" | "🟡" | "🔴";
  /** ISO timestamp of when the token expires, if known */
  expiresAt: string | null;
  /** ISO timestamp of when the token was last validated */
  lastValidatedAt: string | null;
  /** ISO timestamp of when the connection was created */
  createdAt: string;
  /** Whether the connection's stored is_valid flag is true */
  isValid: boolean;
  /** ISO timestamp of when the secret should next be rotated */
  rotationDueAt: string | null;
  /** Days until rotation is due (negative = overdue) */
  daysUntilRotation: number | null;
  /** Current scopes on the connection */
  currentScopes: string[];
  /** Expected scopes for the provider (null = not checked) */
  expectedScopes: string[] | null;
  /** Whether scope drift is detected */
  scopeDrift: boolean;
  /** Health issues for display */
  issues: HealthIssue[];
};

export type HealthIssue = {
  severity: "info" | "warning" | "critical";
  type:
    | "token_expiring"
    | "token_expired"
    | "token_expiring_soon"
    | "validation_stale"
    | "connection_invalid"
    | "scope_drift"
    | "rotation_overdue"
    | "rotation_due_soon";
  message: string;
};

export type SecretsHealthSummary = {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  /** Connections needing attention (warning or critical) */
  needsAttention: string[];
};

export type SecretsHealthReport = {
  connections: ConnectionHealth[];
  summary: SecretsHealthSummary;
};

// ─── Provider Rotation Policies ────────────────────────────────────────────

/**
 * Provider-specific rotation intervals (in days).
 * Providers not listed use a default of 90 days.
 */
const PROVIDER_ROTATION_INTERVALS: Record<string, number> = {
  // OAuth providers — rotate every 90 days
  gmail: 90,
  sheets: 90,
  calendar: 90,
  docs: 90,
  drive: 90,
  hubspot: 90,
  airtable: 90,
  outlook: 90,
  asana: 90,
  typeform: 90,
  linkedin: 90,
  facebook: 90,
  instagram: 90,
  dropbox: 90,
  reddit: 90,
  twitter: 90,
  webflow: 90,
  wordpress: 90,
  miro: 90,
  vimeo: 90,
  pinterest: 90,
  hootsuite: 90,
  // Non-expiring providers — rotate less frequently
  slack: 180,
  notion: 180,
  github: 180,
  thunderbird: 180,
};

/** Default rotation interval for unknown providers (days) */
const DEFAULT_ROTATION_INTERVAL_DAYS = 90;

/** Minimum days before expiry to flag as "expiring soon" (🟡) */
const EXPIRY_WARNING_DAYS = 7;

/** Minimum days before expiry to flag as "expiring very soon" (🟡, urgent) */
const EXPIRY_URGENT_DAYS = 1;

/** How many days of validation staleness before flagging (🟡) */
const STALE_VALIDATION_DAYS = 14;

// ─── Core Health Check Logic ───────────────────────────────────────────────

/**
 * Determine expected scopes for a provider.
 * Returns null if the provider doesn't have a well-defined scope list.
 */
function getExpectedScopes(_provider: string): string[] | null {
  // Provider-specific expected scopes can be added here as the product
  // evolves. For now, return null to indicate "not checked" — scope drift
  // detection only fires when we have a known-good baseline.
  return null;
}

/**
 * Get the rotation interval for a provider in days.
 */
function getRotationIntervalDays(provider: string): number {
  return (
    PROVIDER_ROTATION_INTERVALS[provider] ?? DEFAULT_ROTATION_INTERVAL_DAYS
  );
}

/**
 * Compute the rotation due date for a connection based on its creation
 * date and the provider's rotation interval.
 */
function computeRotationDueDate(
  createdAt: string,
  provider: string,
  customIntervalDays?: number | null,
): string {
  const intervalDays =
    customIntervalDays ?? getRotationIntervalDays(provider);
  const created = new Date(createdAt).getTime();
  const due = created + intervalDays * 24 * 60 * 60 * 1000;
  return new Date(due).toISOString();
}

/**
 * Check a single connection's health and return the health record.
 * This function does NOT access Vault — it only reads connection metadata.
 */
function evaluateConnectionHealth(conn: {
  id: string;
  name: string;
  provider: string;
  auth_type: string;
  is_valid: boolean | null;
  last_validated_at: string | null;
  created_at: string | null;
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
}): ConnectionHealth {
  const now = Date.now();
  const issues: HealthIssue[] = [];

  // Extract expires_at from metadata (stored as unix ms by storeOAuthTokens)
  const expiresAtMs =
    typeof conn.metadata?.expires_at === "number"
      ? (conn.metadata.expires_at as number)
      : null;
  const expiresAt = expiresAtMs
    ? new Date(expiresAtMs).toISOString()
    : null;

  const daysUntilExpiry = expiresAtMs
    ? Math.ceil((expiresAtMs - now) / (24 * 60 * 60 * 1000))
    : null;

  // 1. Check connection validity
  if (conn.is_valid === false) {
    issues.push({
      severity: "critical",
      type: "connection_invalid",
      message: "Connection is marked as invalid. Please reconnect.",
    });
  }

  // 2. Check token expiry
  if (expiresAtMs !== null) {
    if (expiresAtMs < now) {
      issues.push({
        severity: "critical",
        type: "token_expired",
        message: `Token expired ${Math.abs(daysUntilExpiry!)} day${Math.abs(daysUntilExpiry!) === 1 ? "" : "s"} ago.`,
      });
    } else if (daysUntilExpiry! <= EXPIRY_URGENT_DAYS) {
      issues.push({
        severity: "critical",
        type: "token_expiring_soon",
        message: `Token expires in ${daysUntilExpiry!} day${daysUntilExpiry! === 1 ? "" : "s"}.`,
      });
    } else if (daysUntilExpiry! <= EXPIRY_WARNING_DAYS) {
      issues.push({
        severity: "warning",
        type: "token_expiring",
        message: `Token expires in ${daysUntilExpiry!} days.`,
      });
    }
  }

  // 3. Check validation staleness
  if (conn.last_validated_at) {
    const validatedMs = new Date(conn.last_validated_at).getTime();
    const daysSinceValidation = Math.floor(
      (now - validatedMs) / (24 * 60 * 60 * 1000),
    );
    if (daysSinceValidation > STALE_VALIDATION_DAYS) {
      issues.push({
        severity: "warning",
        type: "validation_stale",
        message: `Last validated ${daysSinceValidation} days ago.`,
      });
    }
  }

  // 4. Check scope drift
  const expectedScopes = getExpectedScopes(conn.provider);
  const currentScopes = conn.scopes ?? [];
  let scopeDrift = false;
  if (expectedScopes !== null) {
    const missing = expectedScopes.filter(
      (s) => !currentScopes.includes(s),
    );
    if (missing.length > 0) {
      scopeDrift = true;
      issues.push({
        severity: "warning",
        type: "scope_drift",
        message: `Missing expected scopes: ${missing.join(", ")}.`,
      });
    }
  }

  // 5. Check rotation schedule
  const createdAt = conn.created_at ?? new Date().toISOString();
  const rotationDueAt = computeRotationDueDate(createdAt, conn.provider);
  const daysUntilRotation = Math.ceil(
    (new Date(rotationDueAt).getTime() - now) / (24 * 60 * 60 * 1000),
  );

  if (daysUntilRotation < 0) {
    issues.push({
      severity: "critical",
      type: "rotation_overdue",
      message: `Rotation overdue by ${Math.abs(daysUntilRotation)} day${Math.abs(daysUntilRotation) === 1 ? "" : "s"}.`,
    });
  } else if (daysUntilRotation <= 14) {
    issues.push({
      severity: "warning",
      type: "rotation_due_soon",
      message: `Rotation due in ${daysUntilRotation} day${daysUntilRotation === 1 ? "" : "s"}.`,
    });
  }

  // Determine overall status
  let status: HealthStatus = "healthy";
  if (issues.some((i) => i.severity === "critical")) {
    status = "critical";
  } else if (issues.some((i) => i.severity === "warning")) {
    status = "warning";
  }

  const statusIcon =
    status === "healthy" ? "🟢" : status === "warning" ? "🟡" : "🔴";

  return {
    connectionId: conn.id,
    name: conn.name,
    provider: conn.provider,
    authType: conn.auth_type,
    status,
    statusIcon,
    expiresAt,
    lastValidatedAt: conn.last_validated_at,
    createdAt,
    isValid: conn.is_valid ?? true,
    rotationDueAt,
    daysUntilRotation,
    currentScopes,
    expectedScopes,
    scopeDrift,
    issues,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

type ConnectionRow = {
  id: string;
  name: string;
  provider: string;
  auth_type: string;
  is_valid: boolean | null;
  last_validated_at: string | null;
  created_at: string | null;
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Evaluate health for all connections in a workspace.
 * Returns a full health report with per-connection status and a summary.
 */
export async function getSecretsHealthReport(
  supabase: Client,
  workspaceId: string,
): Promise<SecretsHealthReport> {
  const { data, error } = await supabase
    .from("connections")
    .select(
      "id, name, provider, auth_type, is_valid, last_validated_at, created_at, scopes, metadata",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Failed to fetch connections for health check:", error);
    return {
      connections: [],
      summary: {
        total: 0,
        healthy: 0,
        warning: 0,
        critical: 0,
        needsAttention: [],
      },
    };
  }

  const rows = data as unknown as ConnectionRow[];
  const connections = rows.map(evaluateConnectionHealth);

  const healthy = connections.filter((c) => c.status === "healthy").length;
  const warning = connections.filter((c) => c.status === "warning").length;
  const critical = connections.filter((c) => c.status === "critical").length;
  const needsAttention = connections
    .filter((c) => c.status === "warning" || c.status === "critical")
    .map((c) => c.name);

  return {
    connections,
    summary: {
      total: connections.length,
      healthy,
      warning,
      critical,
      needsAttention,
    },
  };
}
