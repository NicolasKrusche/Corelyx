# Safety Issues (Observed in Code)

This file tracks **concrete, code-level safety/security issues** found during audit.

---

## 1) ✅ Fixed — OAuth state is signed, browser-bound, and session-verified

**Fix implemented**
- `apps/web/lib/oauth-state.ts` now issues HMAC-signed OAuth state envelopes with a short TTL, per-flow nonce, and stable `flowId`.
- Every OAuth start route now sets an HttpOnly `SameSite=Lax` nonce cookie alongside the signed `state`, including Airtable’s PKCE flow.
- Every OAuth callback now verifies the signed `state`, checks the browser nonce cookie, requires a live authenticated session, and ensures the session user matches the state user before storing tokens.
- OAuth state cookies are cleared on callback completion and on callback error paths to reduce replay risk for multi-user deployments.
- `apps/web/lib/__tests__/oauth-state.test.ts` covers signed round-trips plus tampering, expiry, nonce mismatch, and session/user mismatch rejection.

---

## 2) ✅ Fixed — Runtime no longer uses Python `eval()` on workflow expressions

**Fix implemented**
- `apps/runtime/engine/safe_expressions.py` — new AST-backed evaluator replaces Python `eval()` with an allowlist interpreter for workflow transforms and conditions.
- `apps/runtime/engine/executor.py` — runtime expression paths now call `evaluate_expression()` / `evaluate_condition()` and reject unsupported syntax instead of executing arbitrary Python.
- The evaluator explicitly blocks private attribute access, unsupported function calls, and unsupported syntax, while enforcing expression length and AST complexity limits.
- `apps/runtime/tests/test_safe_expressions.py` — focused tests cover supported workflow syntax plus rejection of unsafe attribute access and oversized expressions.

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

## 5) ✅ Fixed — OAuth refresh failures no longer log raw upstream response bodies

**Fix implemented**
- `apps/web/lib/oauth-token.ts` now uses `summarizeRefreshFailure()` to log only sanitized provider, HTTP status, error code, and request-id metadata.
- Raw OAuth provider response bodies are no longer written to logs or reflected back in thrown errors.
- Non-JSON refresh failures now return a generic error message instead of including body content.
- `apps/web/lib/__tests__/oauth-token.test.ts` verifies the sanitized summary keeps useful diagnostics while excluding secret-looking values from logs and user-facing messages.

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
