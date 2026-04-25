# Multi-User Launch Blockers (Current State)

This document lists issues that currently hold the app back from a safe public multi-user launch, plus recently fixed blockers kept for audit context.

## Summary

Core user-scoped data model and RLS exist. The OAuth callback `state`, Gmail webhook authenticity, broad webhook routing, metadata secret exposure, internal API shared-secret, runtime CORS, cookie logging, and Inngest signing-key blockers are fixed. No current launch blockers are listed below.

---

## 1) Fixed - OAuth callback `state` is tamper-proof

**Status**
- Fixed on 2026-04-24. OAuth `state` is now HMAC-signed, short-lived, bound to the active Supabase session and browser nonce cookie, and backed by a one-time server-side nonce record in `public.oauth_state_nonces`.
- No longer a launch blocker.

**Previous evidence**
- `apps/web/lib/oauth-state.ts:3-15` only base64-encodes/decodes JSON (no signature, no one-time nonce verification).
- Multiple OAuth callbacks trust `userId` parsed from that state, e.g.:
  - `apps/web/app/api/connections/oauth/gmail/callback/route.ts:23-25`
  - `apps/web/app/api/connections/oauth/google/callback/route.ts:38-41`
  - `apps/web/app/api/connections/oauth/slack/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/notion/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/outlook/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/hubspot/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/typeform/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/asana/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/airtable/callback/route.ts:21-30`

**Previous risk**
- In a public multi-user app, this can enable cross-account connection/token attachment via forged state.

**Implemented fix**
- Signed state (HMAC), 10-minute TTL, one-time server nonce store, browser cookie nonce binding, and callback/session binding.

---

## 2) Fixed - Gmail webhook endpoint verifies request authenticity

**Status**
- Fixed on 2026-04-24. Gmail Pub/Sub pushes now require a Google-signed OIDC JWT for the configured audience and expected service account email.
- Pub/Sub `messageId` values are persisted in `public.webhook_deliveries` and accepted only once.
- No longer a launch blocker.

**Previous evidence**
- `apps/web/app/api/webhooks/gmail/route.ts:27-50` accepts and decodes payload but does not verify sender signature/JWT.

**Previous risk**
- Public endpoint can be spoofed, causing unauthorized run dispatch attempts and cross-user event noise.

**Implemented fix**
- Pub/Sub OIDC/JWT verification with issuer, `RS256` signature, audience, service account email, and verified email checks, plus persistent replay protection by message ID.

---

## 3) Fixed - Webhook routing no longer fans out to all valid connections

**Status**
- Fixed on 2026-04-24. Typeform, Airtable, and HubSpot webhooks now resolve only explicit connection IDs or payload identifiers already recorded in connection metadata.
- Unmatched or under-scoped payloads return `matched_connections: 0` instead of falling back to every valid connection for that provider.
- No longer a launch blocker.

**Previous evidence**
- Typeform fallback to all:
  - `apps/web/app/api/webhooks/typeform/route.ts:128`
  - `apps/web/app/api/webhooks/typeform/route.ts:135`
- Airtable fallback to all:
  - `apps/web/app/api/webhooks/airtable/route.ts:161`
  - `apps/web/app/api/webhooks/airtable/route.ts:168`
- HubSpot fallback to all:
  - `apps/web/app/api/webhooks/hubspot/route.ts:152`
  - `apps/web/app/api/webhooks/hubspot/route.ts:157`

**Previous risk**
- In multi-user production, weakly-scoped inbound webhooks can trigger runs for unrelated users.

**Implemented fix**
- Strict source-to-connection binding; unmatched webhooks are rejected from dispatch by returning zero matched connections.

---

## 4) Fixed - Secret-adjacent data is not stored in client-visible metadata

**Status**
- Fixed on 2026-04-24. Asana hook secrets are now stored in Supabase Vault with server-only references in `public.connection_webhook_secrets`.
- Legacy `asana_hook_secret` metadata is migrated into Vault and removed from connection metadata when the next signed Asana delivery is verified.
- `/api/connections` now returns provider-specific allowlisted metadata fields only, instead of full connection metadata or a denylist-stripped copy.
- No longer a launch blocker.

**Previous evidence**
- Asana hook secret persisted in metadata:
  - `apps/web/app/api/webhooks/asana/route.ts:58`
- Connections API returns full metadata to client:
  - `apps/web/app/api/connections/route.ts:13`

**Previous risk**
- Metadata is client-visible in normal account flows; secret-adjacent fields should not be exposed.

**Implemented fix**
- Vault-backed hook secret storage with a server-only reference table, plus a provider metadata response allowlist.

---

## 5) Fixed - Internal privileged APIs use scoped short-lived service tokens

**Status**
- Fixed on 2026-04-24. Internal APIs and runtime calls use short-lived HMAC service tokens with audience-specific verification.
- Production now requires per-audience secrets such as `INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE`, `INTERNAL_SERVICE_AUTH_SECRET_NEXT_VAULT`, `INTERNAL_SERVICE_AUTH_SECRET_NEXT_CONNECTIONS_TOKEN`, `INTERNAL_SERVICE_AUTH_SECRET_NEXT_RUNS_COMPLETE`, and `INTERNAL_SERVICE_AUTH_SECRET_NEXT_EVENT_DISPATCH`.
- The old shared `INTERNAL_SERVICE_AUTH_SECRET` / `RUNTIME_SECRET` fallback is limited to non-production environments.
- No longer a launch blocker.

**Previous evidence**
- Internal APIs trust `x-runtime-secret`, e.g.:
  - `apps/web/app/api/internal/vault/[ref]/route.ts:15-18`
  - `apps/web/app/api/internal/connections/[id]/token/route.ts:13-17`
  - `apps/web/app/api/internal/runs/[id]/complete/route.ts:23-27`
  - `apps/web/app/api/triggers/event/route.ts:18-22`
- Runtime also validates same secret:
  - `apps/runtime/main.py:121-124`

**Previous risk**
- Single secret = large blast radius if leaked; attacker gets broad internal power.

**Implemented fix**
- Short-lived signed service tokens with audience/scope and split production secrets per capability.

---

## 6) Fixed - Runtime CORS is restricted

**Status**
- Fixed on 2026-04-25. Runtime CORS now uses `RUNTIME_CORS_ALLOWED_ORIGINS`, inferred web origins, and local-only dev defaults instead of `*`.
- Production rejects wildcard origins and fails if no allowed origin can be configured.
- Methods and headers are limited to the runtime API surface: `GET`, `POST`, `content-type`, and `x-internal-service-token`.
- No longer a launch blocker.

**Implemented fix**
- Added `apps/runtime/cors_config.py` and wired `apps/runtime/main.py` to its restricted CORS policy.
- Added focused coverage in `apps/runtime/tests/test_cors_config.py`.

---

## 7) Fixed - Sensitive cookie values are not logged

**Status**
- Fixed on 2026-04-25. `apps/web/middleware.ts` no longer logs cookie names or values.
- Verified no cookie value logging patterns remain in `apps/web` or `apps/runtime`.
- No longer a launch blocker.

**Implemented fix**
- Removed sensitive diagnostics from middleware in the current tree; auth middleware now performs session checks without logging cookie material.

---

## 8) Fixed - Inngest signing key is enforced in production

**Status**
- Fixed on 2026-04-25. The shared Inngest client now fails in production when `INNGEST_SIGNING_KEY` is missing or blank.
- `INNGEST_SIGNING_KEY` and optional fallback key values are passed into the Inngest client explicitly.
- No longer a launch blocker.

**Implemented fix**
- Added production signing-key enforcement in `apps/web/lib/inngest.ts`.
- Updated the Inngest route comment and env examples so the production requirement is visible.

---

## Notes

- Issue previously tracked in `safety_issues.md` as “Best-effort Vault deletion can silently orphan secrets” was already fixed in API delete flows and is **not** listed as a current blocker here.
