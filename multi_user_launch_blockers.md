# Multi-User Launch Blockers (Current State)

This document lists issues that currently hold the app back from a safe public multi-user launch, plus recently fixed blockers kept for audit context.

## Summary

Core user-scoped data model and RLS exist. The OAuth callback `state` blocker is fixed, but there are still **high-risk auth/isolation gaps** that should be addressed before broad launch.

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

## 2) High — Gmail webhook endpoint does not verify request authenticity

**Evidence**
- `apps/web/app/api/webhooks/gmail/route.ts:27-50` accepts and decodes payload but does not verify sender signature/JWT.

**Why this blocks launch**
- Public endpoint can be spoofed, causing unauthorized run dispatch attempts and cross-user event noise.

**Suggested fix**
- Verify Pub/Sub push identity (OIDC/JWT + audience checks), add replay protection by message ID.

---

## 3) High — Webhook routing can fan out to **all** valid connections across users

**Evidence**
- Typeform fallback to all:
  - `apps/web/app/api/webhooks/typeform/route.ts:128`
  - `apps/web/app/api/webhooks/typeform/route.ts:135`
- Airtable fallback to all:
  - `apps/web/app/api/webhooks/airtable/route.ts:161`
  - `apps/web/app/api/webhooks/airtable/route.ts:168`
- HubSpot fallback to all:
  - `apps/web/app/api/webhooks/hubspot/route.ts:152`
  - `apps/web/app/api/webhooks/hubspot/route.ts:157`

**Why this blocks launch**
- In multi-user production, weakly-scoped inbound webhooks can trigger runs for unrelated users.

**Suggested fix**
- Require strict source-to-connection binding; reject unmatched webhooks instead of global fallback.

---

## 4) High — Secret-adjacent data is stored in metadata and exposed via connections API

**Evidence**
- Asana hook secret persisted in metadata:
  - `apps/web/app/api/webhooks/asana/route.ts:58`
- Connections API returns full metadata to client:
  - `apps/web/app/api/connections/route.ts:13`

**Why this blocks launch**
- Metadata is client-visible in normal account flows; secret-adjacent fields should not be exposed.

**Suggested fix**
- Store hook secrets in Vault (or dedicated secret column not returned to clients), add metadata response allowlist.

---

## 5) Medium-High — Internal privileged APIs protected by one shared static secret

**Evidence**
- Internal APIs trust `x-runtime-secret`, e.g.:
  - `apps/web/app/api/internal/vault/[ref]/route.ts:15-18`
  - `apps/web/app/api/internal/connections/[id]/token/route.ts:13-17`
  - `apps/web/app/api/internal/runs/[id]/complete/route.ts:23-27`
  - `apps/web/app/api/triggers/event/route.ts:18-22`
- Runtime also validates same secret:
  - `apps/runtime/main.py:121-124`

**Why this blocks launch**
- Single secret = large blast radius if leaked; attacker gets broad internal power.

**Suggested fix**
- Use short-lived signed service tokens with audience/scope; split secrets per capability.

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
