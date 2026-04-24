# Multi-User Launch Blockers (Current State)

This document lists issues that currently hold the app back from a safe public multi-user launch, plus recently fixed blockers kept for audit context.

## Summary

Core user-scoped data model and RLS exist. The OAuth callback `state`, Gmail webhook authenticity, broad webhook routing, metadata secret exposure, and internal API shared-secret blockers are fixed, but there are still launch hardening items that should be addressed before broad launch.

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

## 6) Medium — Runtime CORS is fully open

**Evidence**
- `apps/runtime/main.py:115-117` uses `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`.

**Why this blocks launch**
- Not immediately exploitable by itself, but materially increases risk if any internal endpoint/auth check regresses.

**Suggested fix**
- Restrict origins/headers/methods per environment.

---

## 7) Medium — Sensitive cookie values are logged

**Evidence**
- `apps/web/middleware.ts:71` logs cookie names and first 40 chars of values.

**Why this blocks launch**
- Session/token leakage risk in centralized logs is unacceptable at multi-user scale.

**Suggested fix**
- Remove cookie value logging; keep only non-sensitive diagnostics.

---

## 8) Medium — Inngest request verification appears optional by configuration

**Evidence**
- `apps/web/app/api/inngest/route.ts:10` explicitly says signing key should be set in production.

**Why this blocks launch**
- If deployment misses this env, event authenticity guarantees may be weakened.

**Suggested fix**
- Enforce startup/runtime failure in production when signing key is missing.

---

## Notes

- Issue previously tracked in `safety_issues.md` as “Best-effort Vault deletion can silently orphan secrets” was already fixed in API delete flows and is **not** listed as a current blocker here.
