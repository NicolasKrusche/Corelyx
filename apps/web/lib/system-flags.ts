// Global system flags (maintenance mode + feature kill switches), backed by the
// `system_settings` DB table so they can be flipped at runtime WITHOUT a Vercel
// redeploy. This module is Edge-safe — it only uses `fetch` against the Supabase
// REST API and reads `process.env`, so it can be imported from middleware.
//
// Reads are cached in module memory for a few seconds to keep per-request
// overhead near zero. Because each serverless/Edge isolate has its own cache, a
// toggle made from the admin page propagates within `CACHE_TTL_MS` (not
// instantly) — an acceptable trade for not hammering the DB on every request.

export interface SystemFlags {
  /** Full-app maintenance: everyone except admins is blocked. */
  maintenanceMode: boolean;
  /** Optional message shown on the maintenance page / in 503 responses. */
  maintenanceMessage: string | null;
  /** Legacy soft block: Genesis generation (now also expressible via disabledAreas). */
  disableGenesis: boolean;
  /** Legacy soft block: workflow execution (now also expressible via disabledAreas). */
  disableExecution: boolean;
  /** Scoped maintenance: keys of individually-disabled app areas (see maintenance-areas.ts). */
  disabledAreas: string[];
  /**
   * SHA-256 hash of the tester preview-bypass token (never the raw token).
   * When set, a tester holding the matching token can browse the live app
   * during full maintenance via /?preview=<token>. Null/absent = disabled.
   * Rotated/revoked from the Emergency Controls page, no redeploy needed.
   */
  previewBypassHash: string | null;
}

export const DEFAULT_SYSTEM_FLAGS: SystemFlags = {
  maintenanceMode: false,
  maintenanceMessage: null,
  disableGenesis: false,
  disableExecution: false,
  disabledAreas: [],
  previewBypassHash: null,
};

export const DEFAULT_MAINTENANCE_MESSAGE =
  "Corelyx is temporarily down for maintenance. We'll be back shortly — please try again in a few minutes.";

const CACHE_TTL_MS = 10_000;
let cache: { value: SystemFlags; expires: number } | null = null;

/** Drop the in-memory cache so the next read hits the DB. */
export function invalidateSystemFlagsCache(): void {
  cache = null;
}

/**
 * Read the global system flags. Cached for CACHE_TTL_MS. Env vars act as a
 * break-glass override that force a flag ON even if the DB is unreachable
 * (these still require a redeploy to change — they're a last resort).
 */
export async function readSystemFlags(force = false): Promise<SystemFlags> {
  const now = Date.now();
  if (!force && cache && cache.expires > now) return cache.value;

  let flags: SystemFlags = { ...DEFAULT_SYSTEM_FLAGS };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/system_settings?key=eq.flags&select=value&limit=1`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{ value: Partial<SystemFlags> | null }>;
        const value = rows[0]?.value;
        if (value && typeof value === "object") {
          flags = { ...flags, ...value };
        }
      }
    } catch {
      // Network/DB hiccup — fall back to defaults + env overrides below.
    }
  }

  // Env overrides (break-glass): force a flag on even if the DB read failed.
  if (process.env.EMERGENCY_MAINTENANCE_MODE === "true") flags.maintenanceMode = true;
  if (process.env.DISABLE_GENESIS_GENERATION === "true") flags.disableGenesis = true;
  if (process.env.DISABLE_WORKFLOW_EXECUTION === "true") flags.disableExecution = true;

  cache = { value: flags, expires: now + CACHE_TTL_MS };
  return flags;
}

// ─── Admin bypass (Edge-safe) ────────────────────────────────────────────────

function isAdminEmailEdge(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}

/**
 * Whether this user may bypass maintenance mode (to verify fixes while everyone
 * else is blocked). Mirrors `hasTechnicalAccess`: the ADMIN_EMAILS allow-list,
 * or a profiles.is_admin / team_role of founder|dev. The DB lookup only runs
 * while maintenance is active, so the cost is negligible.
 */
export async function isMaintenanceBypassAdmin(
  userId: string | null,
  email: string | null | undefined
): Promise<boolean> {
  if (isAdminEmailEdge(email)) return true;
  if (!userId) return false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return false;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=is_admin,team_role&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ is_admin: boolean | null; team_role: string | null }>;
    const row = rows[0];
    if (!row) return false;
    return row.is_admin === true || row.team_role === "founder" || row.team_role === "dev";
  } catch {
    return false;
  }
}
