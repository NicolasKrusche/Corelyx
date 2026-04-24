# Safety Issues (Observed in Code)

This file tracks **concrete, code-level safety/security issues** found during audit.

---

## 1) Critical — OAuth `state` is not authenticated (account-connection injection risk)

**Evidence**
- `apps/web/lib/oauth-state.ts:3-15` (`encodeOAuthState`/`decodeOAuthState`) only base64-encodes JSON; no signature, no server-side nonce validation.
- Multiple callbacks trust `userId` from decoded `state` directly:
  - `apps/web/app/api/connections/oauth/gmail/callback/route.ts:23-25`
  - `apps/web/app/api/connections/oauth/google/callback/route.ts:38-41`
  - `apps/web/app/api/connections/oauth/slack/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/notion/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/outlook/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/hubspot/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/typeform/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/asana/callback/route.ts:17-19`
  - `apps/web/app/api/connections/oauth/airtable/callback/route.ts:19-33,45-50`
  - `apps/web/app/api/connections/oauth/github/callback/route.ts:29-35` (uses helper, but helper is also unsigned)

**Cause / explanation**
- The callback trust boundary is wrong: identity (`userId`) is accepted from user-controlled query data (`state`) without integrity/authenticity guarantees.
- An attacker can mint/modify `state` payloads and cause OAuth tokens to be stored against another user ID.

**Suggested resolution**
- Use tamper-proof state (HMAC/JWT signed with server secret, short TTL).
- Bind state to server-side nonce/session and verify one-time use.
- Verify callback against authenticated user session (where possible), not just opaque state payload.
- Keep PKCE for providers that support it (not just Airtable flow).

---

## 2) High — Runtime uses Python `eval()` on expressions from workflow data

**Evidence**
- `apps/runtime/engine/executor.py:1595` (`eval(expression, namespace)`)
- `apps/runtime/engine/executor.py:1619` (`eval(condition, namespace)`)

**Cause / explanation**
- Even with restricted builtins, Python object graph/introspection can still allow unexpected execution paths or sandbox escape patterns.
- Any user-controlled expression that reaches these paths can become code execution inside runtime process.

**Suggested resolution**
- Replace `eval` with a safe expression interpreter/AST validator (allowlist of nodes/operators).
- Strictly reject attribute/magic access and function calls outside explicit allowlist.
- Add explicit expression complexity limits (depth, length, execution timeout).

---

## 3) ✅ Fixed — Gmail webhook endpoint accepts unauthenticated payloads

**Fix implemented**
- `apps/web/lib/pubsub-auth.ts` — new `verifyGooglePubSubOidc()` utility. Extracts the `Authorization: Bearer` OIDC JWT Google Pub/Sub injects, fetches Google's JWKS (cached 5 min), verifies RSA-SHA256 signature, and validates `iss` / `aud` / `exp` claims.
- `apps/web/app/api/webhooks/gmail/route.ts` — gate at the top of `POST`: rejects 401 if OIDC token is absent/invalid. Rejects 413 if `Content-Length` exceeds 64 KB. Adds in-memory `messageId` idempotency (24 h TTL, auto-pruned at 2000 entries) to drop Pub/Sub redeliveries without re-dispatching.
- **Required env var:** `PUBSUB_GMAIL_WEBHOOK_AUDIENCE` must be set to the full webhook URL (e.g. `https://your-app.com/api/webhooks/gmail`). Missing var → 500 / fail-closed.

---

## 4) ✅ Fixed — Sensitive cookie values are logged in middleware

**Fix implemented**
- `apps/web/middleware.ts` — all `console.log` calls that printed user email and cookie value prefixes were removed. The file now contains zero logging statements; only redirect/passthrough logic remains.

---

## 5) High — Potential token leakage via OAuth refresh error logging

**Evidence**
- `apps/web/lib/oauth-token.ts:273-279` logs provider refresh response body (`respText.slice(0, 500)`).

**Cause / explanation**
- OAuth provider error payloads may include sensitive fields, account metadata, or token fragments.
- Logging raw upstream body can leak secret-adjacent data to log infrastructure.

**Suggested resolution**
- Log only status code/provider/error code; never raw response bodies from token endpoints.
- Add provider-specific redaction before logging any external auth payload.

---

## 6) ✅ Fixed — Best-effort Vault deletion can silently orphan secrets

**Fix implemented**
- `apps/web/app/api/keys/[id]/route.ts` now fails closed: if `vaultDelete` fails, API returns `502` and does **not** delete the DB row.
- `apps/web/app/api/connections/[id]/route.ts` now fails closed with the same behavior.
- Both routes now emit explicit server-side error logs for vault deletion failure cases.

**Cause / explanation**
- Previously, secret lifecycle could become inconsistent: vault secret remained while pointer row was deleted.
- Updated behavior preserves lifecycle integrity by blocking DB deletion on vault purge failure.

**Suggested resolution**
- Fail closed on Vault delete failure, or queue reliable compensating cleanup with auditable retries.
- Emit explicit structured incident logs/alerts when secret purge fails.
