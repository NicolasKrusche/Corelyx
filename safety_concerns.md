# Security Concerns

Review date: 2026-04-25 (updated with active code review pass)

Scope: static review of the repository code and tracked files, plus `pnpm audit --prod` for production Node dependencies. This does not include a live infrastructure, IAM, or production configuration audit. Python dependency CVE auditing was not run because `pip-audit` and `poetry` are not installed in this environment.

## Executive Summary

The most urgent issues are credential exposure in tracked local tooling files/logs, critical production dependency advisories, and **OAuth access-token leakage from the runtime executor into persisted program output (S11)**. Rotate any exposed credentials, remove those files from git history if this repo has been pushed/shared, upgrade vulnerable dependencies, and patch the executor before any further multi-user activity.

The next highest risks are runtime-side **SSRF in the HTTP connector (S12)**, **unbounded loop iteration DoS (S13)**, the **internal-trust amplification in `/api/internal/*` endpoints (S14)**, public webhook denial-of-service/replay gaps, disabled build-time safety checks, and weak redemption-code controls. Several medium-severity hardening items are also worth fixing before a multi-user launch.

## 2026-04-29 Current Pass Notes

This pass focused on the website shell, workspace switcher, and recently-changed workspace routes.

New/updated observations:
- The sidebar workspace switcher used the browser-native `<select>`, which visually escaped the app theme and exposed unreadable OS dropdown styling in the collapsed/expanded sidebar. This is a UX consistency issue rather than a direct security issue; it has been replaced with a themed in-app menu.
- The previous `next/headers` client-bundle issue was caused by client components importing server-backed workspace helpers. Shared role labels/types now live in `apps/web/lib/workspace-types.ts`; browser components should import from that file, not `apps/web/lib/workspaces.ts`.
- S8 was still open: `apps/web/next.config.mjs` had no security headers. A baseline set is now configured: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and a conservative CSP for `base-uri`, `object-src`, `frame-ancestors`, and `form-action`.
- S6 was partially open: admin redemption codes were generated with `Math.random()` and only 8 characters. New generated codes now use `crypto.randomInt` and 16 non-confusable characters.
- S6 remains partially open: redemption is still not fully atomic at the database level, but `/api/settings/redeem` now has per-user/per-IP throttling and generic failure responses to reduce enumeration value.
- S2 is fixed for the Node production dependency graph: `next` is upgraded to `15.5.15`, `postcss` resolves to `>=8.5.12`, `protobufjs` is pinned to `7.5.5`, and `pnpm audit --prod` reports no known vulnerabilities.
- S3 and S4 are fixed for the reviewed webhook routes: public webhook/custom-trigger ingestion uses a shared 64 KB streaming body cap, and provider delivery ids are recorded in `public.webhook_deliveries` for persistent dedupe.
- S5 is fixed: production builds no longer ignore TypeScript or ESLint failures. The Next 15 route context migration was completed and `pnpm --filter @flowos/web build` succeeds.

Previously listed items that now appear partially fixed in code:
- S12: `apps/runtime/engine/executor.py` now contains explicit private/internal network rejection for HTTP connector URLs.
- S13: `apps/runtime/engine/executor.py` now contains `MAX_LOOP_ITEMS = 100` and truncates oversized loop inputs.
- S14: `apps/web/lib/internal-auth.ts`, `apps/runtime/internal_auth.py`, `apps/web/app/api/internal/vault/[ref]/route.ts`, and `apps/web/app/api/internal/connections/[id]/token/route.ts` now support/enforce subject-bound internal tokens for secret retrieval.

## Critical

### S1. Tracked local logs/settings contain credential material

Evidence:
- `.claude/settings.local.json:104` contains a command with service-role authorization material.
- `.codex/logs/web-dev.out.log:18` and tracked `.codex/run-logs/*.log` files contain auth-cookie material from local requests.
- `git check-ignore` ignores `.env.local`, `apps/web/.env.local`, and `apps/runtime/.env`, but did not ignore `.codex/` or `.claude/settings.local.json`.

Impact: anyone with repository access or history access may be able to impersonate users or use privileged backend credentials.

Recommended fix:
- Rotate the exposed Supabase/service-role/auth credentials and any affected local passwords.
- Remove tracked `.codex/` logs and `.claude/settings.local.json` from the repository and, if this repo has been pushed/shared, purge them from git history.
- Add `.codex/`, `.claude/settings.local.json`, and other local tooling logs/settings to `.gitignore`.
- Keep ignored env files out of git and avoid pasting their contents into issue trackers, logs, or PRs.

### S2. Production dependencies contain critical and high advisories

Status: fixed in current pass.

Evidence:
- `pnpm audit --prod` reported 19 production vulnerabilities: 2 critical, 6 high, 9 moderate, and 2 low.
- `apps/web/package.json:34` pins `next` to `14.2.3`; the audit reports multiple Next.js advisories, including middleware authorization bypass, authorization bypass, cache poisoning, SSRF/redirect handling, request smuggling, image optimization, and Server Components denial-of-service issues.
- `pnpm-lock.yaml:3259` and `pnpm-lock.yaml:7289` lock `protobufjs@7.5.4`; the audit reports arbitrary code execution fixed in `protobufjs>=7.5.5`.
- `pnpm-lock.yaml:3221` and `pnpm-lock.yaml:7251` lock `postcss@8.4.31`; the audit reports an XSS issue fixed in `postcss>=8.5.10`.

Impact: known public vulnerabilities exist in production dependency paths, including authorization bypass, denial of service, SSRF/request smuggling, XSS, and arbitrary code execution classes.

Recommended fix:
- Upgrade Next.js to a non-vulnerable version that satisfies all reported advisories, likely the latest compatible 15.x release or newer after testing.
- Upgrade or override transitive `protobufjs` to `>=7.5.5`.
- Ensure `postcss` resolves to `>=8.5.10`.
- Re-run `pnpm audit --prod` and record the clean result or any accepted residual risk.

Current remediation:
- `apps/web/package.json` now uses `next@15.5.15` and `eslint-config-next@15.5.15`.
- `postcss` is upgraded to `^8.5.12`; root `pnpm.overrides` also enforces `postcss@^8.5.12`.
- Root `pnpm.overrides` enforces `protobufjs@7.5.5`.
- `pnpm audit --prod` reports no known vulnerabilities.

### S11. OAuth access tokens leak into persisted node output

Evidence:
- `apps/runtime/engine/executor.py:1105` returns the raw `access_token` from a connection node when the schema sets no operation: `return {**input_data, "access_token": access_token, "connection_id": connection_id}`.
- That output is later persisted into `node_executions.output_payload` via `update_node_execution(...)` (e.g., `apps/runtime/engine/executor.py:625`), making the plaintext token retrievable from the database for the lifetime of the row.
- Token also flows downstream into any subsequent node's `input_data`, which is itself persisted on completion and surfaced through the live-runs UI.

Impact: a database read (intentional support access, future backup leak, RLS misconfig, or compromised analytics export) hands attackers durable OAuth bearer tokens for every connection used in this branch of any program. Tokens grant full scope of the user's connected provider (Gmail, Drive, GitHub, etc.).

Recommended fix:
- Stop returning `access_token` in node output. If a downstream node needs token access, fetch it through the existing `_fetch_oauth_token` path keyed by `connection_id`.
- Audit `node_executions.output_payload` for previously-stored tokens and purge them.
- Add a redaction pass before any payload is written to the DB that drops keys named `access_token`, `refresh_token`, `api_key`, `secret`, or matching common token regexes.

## High

### S3. Public webhook routes read request bodies without a shared size limit

Status: fixed in current pass.

Evidence:
- `apps/web/app/api/triggers/webhook/[token]/route.ts:23` reads `await request.text()`.
- `apps/web/app/api/webhooks/typeform/route.ts:32`, `slack/route.ts:18`, `github/route.ts:19`, `hubspot/route.ts:48`, `airtable/route.ts:39`, and `asana/route.ts:52` read the raw body directly.
- `apps/web/app/api/webhooks/gmail/route.ts:29` has a content-length limit, but still uses `await request.json()` at `apps/web/app/api/webhooks/gmail/route.ts:55`, so requests without an accurate `content-length` can still be parsed.

Impact: unauthenticated public endpoints can be used for memory/CPU denial of service by sending very large bodies.

Recommended fix:
- Add a shared helper for bounded body reads, for example 64 KB or provider-specific limits.
- Reject missing, invalid, or excessive `content-length` before reading.
- Enforce a streaming/read cap rather than relying only on the header.
- Apply the helper to all webhook and custom trigger routes.

Current remediation:
- Added `apps/web/lib/request-body.ts` with bounded text/JSON body readers.
- Applied the shared 64 KB cap to GitHub, Slack, Typeform, HubSpot, Airtable, Asana, Gmail, custom webhook triggers, and internal event trigger ingestion.

### S4. Webhook replay protection is incomplete and process-local

Status: fixed in current pass.

Evidence:
- `apps/web/lib/webhook-replay-guard.ts:1` uses an in-memory `Map`, so replay state is lost on restart and is not shared across instances.
- Typeform, HubSpot, Airtable, and GitHub use this process-local guard at `apps/web/app/api/webhooks/typeform/route.ts:59`, `hubspot/route.ts:77`, `airtable/route.ts:74`, and `github/route.ts:44`.
- Slack validates timestamp freshness at `apps/web/app/api/webhooks/slack/route.ts:25`, but does not persistently deduplicate `event_id` before dispatching at `apps/web/app/api/webhooks/slack/route.ts:75`.
- Asana verifies signatures at `apps/web/app/api/webhooks/asana/route.ts:162`, but does not persistently deduplicate deliveries before dispatching at `apps/web/app/api/webhooks/asana/route.ts:174`.
- Gmail already uses persistent delivery dedupe through `apps/web/lib/webhook-deliveries.ts:5` and `apps/web/app/api/webhooks/gmail/route.ts:82`.

Impact: replayed or duplicated webhook deliveries can trigger duplicate workflow runs, especially after deploys, restarts, or in multi-instance deployments.

Recommended fix:
- Reuse the persistent `webhook_deliveries` pattern for every provider and custom trigger.
- Store provider name, delivery/event id, digest, first-seen time, and processing status.
- Treat duplicate delivery ids as idempotent success after signature verification.

Current remediation:
- Replaced process-local replay checks with persistent `markWebhookDelivery` calls for GitHub delivery ids, Slack event ids, Typeform response tokens, HubSpot event ids, Airtable webhook/timestamp ids, Asana derived event ids, Gmail Pub/Sub message ids, and custom webhook signature/timestamp hashes.
- Duplicate deliveries return idempotent success after authentication/signature verification.

### S5. Production builds ignore TypeScript and ESLint failures

Status: fixed in current pass.

Evidence:
- `apps/web/next.config.mjs:4` sets `typescript.ignoreBuildErrors: true`.
- `apps/web/next.config.mjs:10` sets `eslint.ignoreDuringBuilds: true`.
- `apps/web/app/api/webhooks/github/route.ts:44` and `apps/web/app/api/webhooks/github/route.ts:58` declare `deliveryId` twice in the same route, which is a type/build failure in a security-sensitive public webhook.

Impact: compile-time mistakes in authentication, webhook verification, and authorization paths can ship instead of blocking deployment.

Recommended fix:
- Re-enable TypeScript and ESLint enforcement for production builds.
- Fix existing type/lint failures before enabling the gates.
- Keep route-level security code in the checked build path.

Current remediation:
- Removed `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` from `apps/web/next.config.mjs`.
- Fixed blocking type/lint failures and completed the Next 15 route context updates.
- `pnpm --filter @flowos/web lint`, `pnpm --filter @flowos/web type-check`, and `pnpm --filter @flowos/web build` now complete successfully.

### S6. Redemption codes are weakly generated, not rate-limited, and redeemed non-atomically

Evidence:
- `apps/web/app/api/admin/codes/route.ts:19` generates 8-character codes with `Math.random()`.
- `apps/web/app/api/settings/redeem/route.ts:10` accepts redemption attempts from authenticated users without an endpoint rate limit.
- `apps/web/app/api/settings/redeem/route.ts:30` through `apps/web/app/api/settings/redeem/route.ts:55` return distinguishable failure states, which makes the endpoint a useful oracle.
- `apps/web/app/api/settings/redeem/route.ts:113` through `apps/web/app/api/settings/redeem/route.ts:131` update the profile, insert redemption, and increment usage in separate calls.
- `supabase/migrations/20240007_billing_codes.sql:50` adds a unique `(code_id, user_id)` constraint, but max-use enforcement can still race across different users.

Impact: attackers with valid accounts can guess or enumerate codes, and concurrent redemptions can exceed intended usage limits or leave partial state.

Recommended fix:
- Generate longer codes with a CSPRNG, for example `crypto.randomBytes` or `crypto.randomUUID` with enough entropy.
- Add per-user and per-IP rate limits around redemption.
- Return a generic failure for invalid, expired, locked, already-used, and exhausted codes.
- Move redemption into a single database RPC/transaction that locks the code row, checks limits, inserts redemption, increments usage, and updates the profile atomically.

### S12. HTTP connector has no SSRF protection on user-controlled URL

Evidence:
- `apps/runtime/engine/executor.py:1108-1189` (`_execute_http_connection`) takes `cfg.url` directly from the program schema and passes it to `httpx.AsyncClient.request(...)` after only checking that it is non-empty (line 1114).
- No allowlist or denylist for hostname, protocol, or IP range. No check against private/loopback/link-local ranges or the cloud metadata IP `169.254.169.254`.
- A program author (Genesis or hand-edited) can set `url` to e.g. `http://169.254.169.254/latest/meta-data/iam/security-credentials/` or `http://localhost:8000/...` and exfiltrate the response via `response.json()` returned to subsequent nodes.

Impact: any user can reach internal services from inside the runtime container — cloud metadata endpoints (IAM credentials), internal Supabase admin URLs, the runtime's own loopback endpoints, or other services on the private network.

Recommended fix:
- Resolve the hostname before the request, reject if any A/AAAA record is in private (RFC1918), loopback, link-local, or unique-local ranges.
- Block non-`http`/`https` schemes.
- Disable HTTP redirects, or follow only to allowed hosts.
- Optionally route the connector through an outbound proxy that enforces the same allowlist.

### S13. Loop nodes execute an unbounded number of iterations

Evidence:
- `apps/runtime/engine/executor.py:578` iterates `for idx, item in enumerate(items):` with no cap on `len(items)`.
- `items` is resolved from a `{{expression}}` whose value can come from any upstream source — for example an LLM response, an HTTP-connector body, or a sheets/airtable list returned by another connector.
- Each iteration runs the loop body, which can include LLM nodes, HTTP calls, and further connector calls. There is no per-run iteration cap separate from `RUN_TIMEOUT_SECONDS = 600` (`apps/runtime/main.py:171`).

Impact: a malicious or careless schema that resolves `items` from external input can trigger thousands of nested LLM/HTTP calls before the 10-minute kill switch, exhausting model spend, connector quota, and runtime memory; a deliberate attacker can drive billing/abuse against the operator's accounts.

Recommended fix:
- Cap iterations per loop node (suggested initial limit: 100) and reject schemas that exceed it at validation time.
- Cap total node-executions per run (e.g., `MAX_LOOP_ITEMS * MAX_NODES`).
- Surface a clear `LOOP_LIMIT_EXCEEDED` error so users can split their workflow.

### S14. Internal trust boundary lets any runtime caller resolve any user's secrets

Evidence:
- `apps/web/app/api/internal/vault/[ref]/route.ts:11` accepts a request with audience `next:vault` and returns the plaintext API-key value for any `api_keys.id` (UUID), without checking which user owns the row.
- `apps/web/app/api/internal/connections/[id]/token/route.ts:10` accepts audience `next:connections:token` and returns a refreshed OAuth access token for any `connections.id`, again without owner check.
- The internal-service token format (`apps/web/lib/internal-auth.ts:96-108` and `apps/runtime/internal_auth.py:69-81`) carries only `aud`, `iat`, `exp` — no user binding or per-call payload.

Impact: any compromise of the runtime process, a misuse by a future runtime route, or a leak of `INTERNAL_SERVICE_AUTH_SECRET` lets an attacker enumerate `api_keys.id` / `connections.id` and pull every user's API keys and OAuth bearer tokens. The blast radius is "all users" instead of "the requesting run."

Recommended fix:
- Include a `user_id` (and ideally a `run_id`) claim in the internal token, signed by Next.js when it dispatches `/execute`, and verify it on the runtime → Next.js return path.
- In `vault/[ref]` and `connections/[id]/token` routes, require the claimed `user_id` to match `api_keys.user_id` / `connections.user_id` before responding.
- Bind the token's `iat`/`exp` window to the run dispatch so a stolen token cannot be replayed long after the run finished.

## Medium

### S15. Runtime `/execute` trusts caller-supplied schema, run_id, and user_id

Evidence:
- `apps/runtime/main.py:155-168` accepts `body.schema`, `body.run_id`, `body.program_id`, and `body.user_id` as-supplied after only verifying the internal service token.
- It does not load the schema from the DB by `program_id`, nor verify that `runs.id == body.run_id` belongs to `body.user_id` and `body.program_id`.
- All downstream credential lookups (`_fetch_oauth_token`, `_fetch_api_key`) use `self.user_id` from the body, so anyone with a valid `runtime:execute` token can execute an arbitrary attacker-crafted schema in any user's credential context.

Impact: a leak of the runtime audience secret promotes from "DoS the runtime" to "execute arbitrary connector calls and LLM spend in any user's account." Combined with S14 this fully owns every connection.

Recommended fix:
- Load `programs.schema` and `runs.user_id` from the DB inside the runtime, ignoring caller-supplied values; treat the request body as identifiers only.
- Verify `runs.program_id == programs.id` and `runs.user_id == programs.user_id` before execution.
- Reject if the run is already in a terminal state.

### S16. Step-approval context stores upstream `input_data` verbatim

Evidence:
- `apps/runtime/engine/executor.py:1232-1244` calls `create_approval(..., {"input": input_data, ...})`, storing the full input dict on the approvals row.
- `input_data` is the merged output of all upstream nodes, which can include the access_token leaked by S11, model API responses with embedded secrets, or any field a Genesis-written schema decided to forward.
- The approvals table is read by both the user UI and the Inngest approval-notifier; the data is also persisted indefinitely.

Impact: every approval-gated workflow durably stores upstream secrets and PII in a row that a wider audience (notifier emails, future support tooling) can read.

Recommended fix:
- Define an explicit allowlist of fields to surface in the approval context (e.g., `summary`, `to`, `subject`).
- Or run the same `access_token`/`api_key` redaction described in S11 before insert.
- Add a TTL/cleanup job on `approvals.context` for completed approvals.

### S17. HTTP connector error messages embed the external response body

Evidence:
- `apps/runtime/engine/executor.py:1184-1188` raises `ExecutionError("HTTP_REQUEST_FAILED", f"... returned {status}: {body_preview}")` where `body_preview = response.text[:500]`.
- That message is stored on `node_executions.error_message` (line 610) and surfaced to the user log feed.

Impact: third-party APIs commonly return debug info, internal stack traces, or customer-identifying data in their error bodies. Persisting them to FlowOS logs creates a secondary data store the operator now has compliance responsibility for.

Recommended fix:
- Strip the body preview from the user-facing error; keep status code and method/url only.
- If the body is needed for debugging, write it to a separate operator-only log with redaction and retention.

### S18. Internal token has no per-request payload, enabling replay window abuse

Evidence:
- `apps/web/lib/internal-auth.ts:84-108` issues tokens whose payload is `{aud, iat, exp}` only.
- `MAX_TOKEN_LIFETIME_SECONDS = 300` (line 7) plus `CLOCK_SKEW_SECONDS = 30` (line 5) gives a 5–6 minute replay window.
- A token captured in transit (TLS termination edge, log scrub miss) is valid for any call against the same audience until expiry.

Impact: combined with S14/S15, a brief MITM or log-leak window grants 5+ minutes of arbitrary internal-service calls.

Recommended fix:
- Bind the token to the request: include a sha256 of the request body / canonicalized URL in the payload, verify on the receiver.
- Drop default lifetime to ~30 s; raise it only for known long-running calls.
- Where mutual TLS is feasible (Railway ↔ Vercel internal), prefer it over signed-bearer tokens.

### S19. Schema-supplied numeric config fields are cast without bounds checks

Evidence:
- `apps/runtime/schema.py:113-198` parses node configs by directly casting input values: `int(data.get("max_attempts", 1))`, `float(data.get("retry_delay_seconds", 0))`, etc.
- No upper or lower bound is enforced. A schema with `max_attempts = 1_000_000` or `retry_delay_seconds = 86_400` will be accepted; the executor will then loop or sleep accordingly.

Impact: another DoS vector and a way to silently park runs against `RUN_TIMEOUT_SECONDS`.

Recommended fix:
- Validate sensible ranges in `schema.py` (e.g., `1 ≤ max_attempts ≤ 10`, `0 ≤ retry_delay_seconds ≤ 60`) and reject programs that exceed them.

### S20. Approval flow polls the database every 5 s instead of using Realtime

Evidence:
- `apps/runtime/engine/executor.py:1257-1270` sleeps 5 s and re-queries the `approvals` table in a `while time.time() < deadline` loop.
- `CLAUDE.md` rule: "Supabase Realtime for all live updates — no polling anywhere in the codebase."

Impact: not directly exploitable, but every long-running approval (default 24 h) burns ~17,000 DB queries per node and prevents reasoning about lock contention. Also amplifies cost-of-DoS for S13/S15 when many runs sit in approval state.

Recommended fix:
- Switch the wait loop to a Supabase Realtime subscription on `approvals` keyed by `node_execution_id`, with a `RUN_TIMEOUT_SECONDS`-bounded fallback timer.

### S7. Public signing contexts fall back to broad internal secrets

Evidence:
- `apps/web/lib/oauth-state.ts:62` allows OAuth state signing to fall back to `INTERNAL_SERVICE_AUTH_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`.
- `apps/web/lib/webhook-trigger-auth.ts:13` allows webhook trigger signing to fall back to `INTERNAL_SERVICE_AUTH_SECRET` or `RUNTIME_SECRET`.

Risk: a single leaked broad-purpose secret can become valid HMAC material for unrelated public flows, increasing blast radius and making rotation harder.

Recommended fix:
- Require dedicated `OAUTH_STATE_SECRET` and `WEBHOOK_SIGNING_SECRET` in production.
- Keep the fallback behavior only for local development, if needed.
- Document rotation steps for each secret independently.

### S8. Missing application security headers and CSP

Evidence:
- `apps/web/next.config.mjs:2` has no `headers()` configuration for security headers.
- Search did not find a central CSP, `frame-ancestors`, `X-Content-Type-Options`, or `Referrer-Policy` policy.
- `apps/web/app/layout.tsx:61` uses an inline script, which means a future CSP will need a nonce or hash.

Risk: XSS, clickjacking, MIME sniffing, and referrer leakage protections depend mostly on browser defaults today.

Recommended fix:
- Add security headers through Next.js `headers()`.
- Start with `Content-Security-Policy`, `frame-ancestors`, `X-Content-Type-Options`, and `Referrer-Policy`.
- Use a nonce or hash for the inline theme script.

### S9. Rate limiting is process-local and sparse

Evidence:
- `apps/web/lib/rate-limit.ts:1` documents the current limiter as a simple per-process `Map`.
- `apps/web/app/api/genesis/route.ts:119` uses that limiter for one expensive endpoint.
- Sensitive endpoints such as `apps/web/app/api/settings/redeem/route.ts:10` and public webhook routes do not use a distributed limiter.

Risk: limits can be bypassed across instances/restarts, and several brute-force or resource-heavy paths have no shared throttling.

Recommended fix:
- Replace the in-memory limiter with Redis/Upstash or another shared store in production.
- Add limits to redemption, custom webhook triggers, provider webhooks where appropriate, and other expensive authenticated routes.
- Use separate buckets for user id, IP, and endpoint.

### S10. Client responses and app logs can expose backend/provider detail

Evidence:
- `apps/web/lib/api.ts:7` serializes arbitrary error messages into JSON responses.
- Several routes return database or provider messages directly, including `apps/web/app/api/keys/route.ts:51`, `apps/web/app/api/admin/codes/route.ts:70`, `apps/web/app/api/runs/route.ts:109`, and `apps/web/app/api/connections/[id]/resources/[type]/route.ts:76`.
- `apps/web/lib/app-logs.ts:28` stores error names, messages, and stack traces.
- `apps/web/app/api/genesis/route.ts:77` logs user description/refinement text.

Risk: backend schema details, provider responses, stack traces, or user-entered secrets can leak to clients or persist in operational logs.

Recommended fix:
- Return generic client-facing errors with stable error codes.
- Log detailed errors server-side with redaction of tokens, cookies, authorization headers, and likely secrets.
- Add retention and access controls for app logs.

## Existing Controls Worth Preserving

- Supabase RLS is enabled broadly in `supabase/migrations/20240001_init.sql:181`.
- Program connection ownership is hardened in `supabase/migrations/20240012_program_connection_ownership.sql:11`.
- Gmail webhook delivery dedupe is persistent in `apps/web/lib/webhook-deliveries.ts:5`.
- Internal service tokens are short-lived and production fallback is blocked in `apps/web/lib/internal-auth.ts:26` and `apps/runtime/internal_auth.py:23`.
- Runtime CORS is explicitly configured in `apps/runtime/main.py:123` and `apps/runtime/cors_config.py:1`.

## Suggested Fix Order

1. Rotate and remove exposed credentials/logs/settings from git (S1).
2. **Stop returning `access_token` from connection nodes; redact secrets before any payload is persisted (S11, S16).**
3. Upgrade vulnerable production dependencies and re-run `pnpm audit --prod` (S2).
4. **SSRF allowlist for the HTTP connector (S12) and a hard cap on loop iterations (S13).**
5. **Bind internal service tokens to a `user_id` claim and enforce ownership in `/api/internal/vault/*` and `/api/internal/connections/*/token` (S14, S18); load schema/user/run from the DB inside the runtime (S15).**
6. Re-enable build checks and fix current type/lint failures (S5).
7. Add bounded body reads and persistent dedupe to all webhook routes (S3, S4).
8. Harden redemption-code generation, rate limiting, and atomic redemption (S6).
9. Require dedicated public-flow signing secrets in production (S7).
10. Add security headers/CSP, sanitize external/client-facing errors, drop HTTP-connector body previews (S8, S10, S17).
11. Validate numeric schema bounds (S19); migrate the approval wait off polling (S20).

## Review Methodology Notes

This pass was an active line-level read of:
- All routes in `apps/web/app/api/**` (auth, IDOR, secret leakage, internal-trust boundary).
- `apps/runtime/main.py`, `apps/runtime/internal_auth.py`, `apps/runtime/cors_config.py`, `apps/runtime/engine/executor.py`, `apps/runtime/engine/safe_expressions.py`, `apps/runtime/schema.py`.
- `apps/web/lib/internal-auth.ts`, `webhook-trigger-auth.ts`, `oauth-state.ts`, `pubsub-auth.ts`, `app-logs.ts`, `client-logs.ts`, `admin.ts`, `vault.ts`.
- All Supabase migrations for RLS posture.

Sandbox controls confirmed sound during this pass:
- `safe_expressions.py` AST evaluator (no `eval`/`getattr`/`__class__` escapes; node, depth, length caps in place).
- `pubsub-auth.ts` Google OIDC verification (RS256, issuer, audience, kid, email_verified, signature).
- Stripe checkout binds `client_reference_id` to the authenticated `user.id`, so the webhook's metadata-trust path (`apps/web/app/api/billing/webhook/route.ts:67-73`) is not directly exploitable today — but is brittle and worth hardening.
- Connection ownership checks in `apps/web/app/api/connections/[id]/route.ts` use the user-bound Supabase client correctly.

Findings rejected after verification:
- "Genesis stream endpoint missing auth" — `apps/web/app/api/genesis/stream/route.ts:51-54` does enforce auth identically to the non-stream version.
- "POST /api/connections/[id] uses service client without ownership check" — actually uses the user-bound client (`apps/web/app/api/connections/[id]/route.ts:62-67`).
