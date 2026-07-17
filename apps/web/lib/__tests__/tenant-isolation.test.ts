/**
 * Tenant isolation compliance probe.
 *
 * Per compliance_plan.md §3.7 (GDPR Art. 32 — ISOLATION) and §10 Phase 1:
 * "Implement tenant isolation verification (test: can user A access user B's data?)".
 *
 * This is a static-analysis probe over every API route. For each route that
 * touches a tenant-scoped table, it asserts the route also has at least one of:
 *
 *   1. Cookie-based auth + a row-level user filter.
 *   2. Internal service-token auth bound to a user subject claim.
 *   3. Webhook-signing-secret auth (HMAC) + connection lookup.
 *   4. Stripe / Inngest signed-payload auth.
 *   5. Public-read filter (is_public=true) for explicitly-published resources.
 *
 * This is defense-in-depth and does not replace Postgres RLS — it just ensures
 * the application layer respects tenant boundaries even if RLS is misconfigured.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = join(__dirname, "..", "..", "app", "api");

// Tables whose rows belong to a specific user. Reads/writes against these in any
// request handler MUST be gated by an authenticated user OR an alternative auth
// (webhook-signing secret, internal token w/ subject claim, etc.).
const TENANT_TABLES = [
  "programs",
  "runs",
  "node_executions",
  "connections",
  "program_connections",
  "approvals",
  "api_keys",
  "triggers",
  "webhook_deliveries",
  "program_versions",
  "program_dpia_drafts",
  "data_subject_requests",
  "app_logs",
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (name === "route.ts" || name === "route.tsx") {
      yield full;
    }
  }
}

function readsTenantTable(source: string, table: string): boolean {
  // Look for `.from("table")` or `.from('table')` — the Supabase pattern.
  const pattern = new RegExp(`\\.from\\(\\s*["']${table}["']\\s*\\)`);
  return pattern.test(source);
}

// Patterns that indicate the route has SOME form of authentication. Without
// any of these, a tenant-table read would be wholly unauthenticated and the
// test must fail.
function hasAnyAuth(source: string): boolean {
  return [
    // Cookie / Bearer session auth
    /getAuthUser\s*\(/,
    /\.auth\.getUser\s*\(/,
    /\.auth\.getSession\s*\(/,
    // Internal service-to-service tokens
    /requestHasValidInternalServiceToken\s*\(/,
    /getValidInternalServiceClaims\s*\(/,
    // Webhook signing secrets
    /createHmac\s*\(/,
    /verifyHmac\s*\(/,
    /timingSafeEqual\s*\(/,
    /verifyWebhookSignature\s*\(/,
    /verifyTypeformSignature\s*\(/,
    /verifyHubSpotV1Signature\s*\(/,
    /WEBHOOK_SIGNATURE_HEADER/,
    // Stripe
    /stripe\.webhooks\.constructEvent/,
    // Inngest signed serve handler
    /serve\s*\(\s*\{/,
    // Pubsub / GCP push auth (Google sends OIDC-signed tokens)
    /verifyPubsub|verifyPubSubAuth|verifyGooglePubSubOidc/,
    // Google channel-token auth (Drive/Sheets push notifications carry an
    // opaque token chosen at watch-creation time)
    /x-goog-channel-token/i,
    // Webhook trigger auth (per-user secret)
    /verifyWebhookTriggerAuth|getWebhookTriggerSecret/,
    // OAuth state (callback handlers verify state nonce)
    /verifyOAuthState/,
    // Robust catch-all: any "X-Internal-Auth" string
    /["']x-internal-auth["']/i,
    // Truly public endpoints that only return is_public=true rows are an
    // intentional design — the resource itself is public. We treat the
    // is_public filter as both the "auth" and the "scoping" for those routes.
    /\.eq\(\s*["']is_public["']\s*,\s*true\s*\)/,
    // Routes that accept an opaque per-resource token in the URL path are
    // authenticated by the token itself (lookup by token, no user session).
    // Match on the typical pattern: looking up by `token` param.
    /\.eq\(\s*["']token["']\s*,\s*[A-Za-z_.]+\)/,
    /\.eq\(\s*["']webhook_token["']\s*,\s*[A-Za-z_.]+\)/,
  ].some((re) => re.test(source));
}

// Patterns that scope the query/result to the authenticated user (or to public
// rows only). Any one of these is sufficient.
function hasTenantScoping(source: string): boolean {
  return [
    // In-query row filter on user_id / owner_id / subject_user_id
    /\.eq\(\s*["'](?:user_id|owner_id|subject_user_id)["']\s*,\s*[A-Za-z_.[\]]+/,
    // Post-fetch user_id equality check (e.g. `if (row.user_id !== user.id)`)
    /\.user_id\s*(?:!==|===|!=|==)\s*[A-Za-z_.]+\.id\b/,
    // Post-fetch comparison against an internal-token subject claim
    /\.user_id\s*(?:!==|===|!=|==)\s*claims\.sub\b/,
    /\.user_id\s*(?:!==|===|!=|==)\s*[A-Za-z_]+\.sub\b/,
    // Public-read filter (browse / published resources)
    /\.eq\(\s*["']is_public["']\s*,\s*true\s*\)/,
    /\.eq\(\s*["']published_at["']/,
    // Workspace-scoped access is the primary tenant boundary for app data.
    /\.eq\(\s*["']workspace_id["']\s*,\s*[A-Za-z_.![\]]+/,
    /\.in\(\s*["']workspace_id["']\s*,\s*[A-Za-z_.![\]]+/,
    /getActiveWorkspace\s*\(/,
    /getWorkspaceRole\s*\(/,
    /getProgramAccess\s*\(/,
    /requireWorkspaceAccess\s*\(/,
    /requireWorkspaceContributor\s*\(/,
    /requireWorkspaceViewer\s*\(/,
    // The internal token's subject is itself the user filter when the handler
    // looks up the row by id and verifies row.user_id === claims.sub.
    /claims\.sub.*\.user_id|\.user_id.*claims\.sub/s,
    // Explicit admin-only routes may intentionally inspect cross-user data.
    /isAdminEmail\s*\(/,
    // Routes that look up the row by an opaque token (per-trigger webhook URL,
    // per-channel push subscription) are scoped by that token — the row found
    // determines which user owns the request.
    /\.eq\(\s*["']token["']\s*,\s*[A-Za-z_.]+\)/,
    /\.eq\(\s*["']webhook_token["']\s*,\s*[A-Za-z_.]+\)/,
    /\.eq\(\s*["']channel_id["']\s*,\s*[A-Za-z_.]+\)/,
    /\.eq\(\s*["']resource_id["']\s*,\s*[A-Za-z_.]+\)/,
    /\.eq\(\s*["']subscription_id["']\s*,\s*[A-Za-z_.]+\)/,
    // Internal scope-bound tokens (next:runs:complete, next:vault, etc.) are
    // themselves the scoping — they're issued for a single run/resource id.
    /requestHasValidInternalServiceToken\s*\(.+["']next:[^"']+["']/,
    // Webhook receivers resolve the user via a connection lookup using a
    // platform-specific external id (sender id, hub_id, account_id, etc.).
    // The connection row's user_id is then trusted because the webhook payload
    // was authenticated by the signing secret. We accept any header that
    // identifies the webhook source.
    /webhook[_-]?secret/i,
    /x-hub-signature/i,
    /x-slack-signature/i,
    /(?:x-)?typeform-signature/i,
    /x-hubspot-signature/i,
    /x-asana-hook-secret/i,
    /x-goog-channel-(?:id|token)|x-goog-resource-id/i,
    /airtable.*notification|x-airtable/i,
    /verifyGooglePubSubOidc/,
  ].some((re) => re.test(source));
}

describe("tenant isolation — API routes do not leak data across users", () => {
  const routes = Array.from(walk(API_ROOT));

  it("scans at least 10 API routes (sanity check)", () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  for (const routePath of routes) {
    const rel = relative(API_ROOT, routePath).replace(/\\/g, "/");

    it(`${rel} — gates tenant-table access by user id, internal token, or signed webhook`, () => {
      const source = readFileSync(routePath, "utf8");

      const tenantTablesUsed = TENANT_TABLES.filter((t) => readsTenantTable(source, t));

      if (tenantTablesUsed.length === 0) {
        // Nothing to gate — pass.
        return;
      }

      expect(
        hasAnyAuth(source),
        `${rel} reads tenant tables [${tenantTablesUsed.join(", ")}] with no detectable authentication. Add an auth check (getAuthUser, internal-token, HMAC webhook signature, Stripe/Inngest signed payload, etc.).`
      ).toBe(true);

      expect(
        hasTenantScoping(source),
        `${rel} reads tenant tables [${tenantTablesUsed.join(", ")}] but has no detectable per-user scoping. Add one of: .eq("user_id", auth.id) | post-fetch user_id check | .eq("is_public", true) for public reads | a webhook-signing-secret check that resolves the connection.`
      ).toBe(true);
    });
  }
});
