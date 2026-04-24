# Safety Concerns (Architecture / Hardening)

This file tracks **broader safety concerns** (design/operational risks) that may not always be immediate exploitable bugs but increase risk posture.

---

## 1) ✅Webhook trigger auth is URL-token based only

**Evidence**
- `apps/web/app/api/triggers/webhook/[token]/route.ts:8-37`
- Token is UUID-backed (`supabase/migrations/20240003_phase4.sql:6`)

**Concern**
- URL token as sole authenticator can leak via logs, browser history, reverse-proxy logs, and accidental sharing.

**Why this matters**
- Token disclosure gives direct trigger execution capability until token is rotated.

**Hardening ideas**
- Add optional request signing (HMAC header) in addition to URL token.
- Add token rotation/revocation UX and automatic rotation on suspicion.
- Add per-trigger rate limits and anomaly detection.

---

## 2) ✅Shared static runtime secret used across internal service boundaries

**Evidence**
- Internal routes trust `x-runtime-secret`:
  - `apps/web/app/api/internal/vault/[ref]/route.ts:15-18`
  - `apps/web/app/api/internal/connections/[id]/token/route.ts:13-17`
  - `apps/web/app/api/internal/runs/[id]/complete/route.ts:23-27`
  - `apps/web/app/api/triggers/event/route.ts:18-22`
- Runtime verifies same header: `apps/runtime/main.py:121-125`

**Concern**
- One shared bearer secret creates broad blast radius if leaked.

**Why this matters**
- Compromise of a single secret grants access to multiple privileged internal capabilities (token retrieval, vault-backed lookups, trigger dispatch).

**Hardening ideas**
- Move to short-lived signed service tokens (audience/scope constrained).
- Use separate secrets per internal endpoint domain (vault, tokens, run-complete, event dispatch).
- Add secret rotation policy and dual-key rollout support.

---

## 3) ✅Runtime allows all CORS origins/methods/headers

**Evidence**
- `apps/runtime/main.py:113-118` (`allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`)

**Concern**
- Broad browser-origin access expands attack surface for accidental exposure/misconfiguration.

**Why this matters**
- If any endpoint auth is weakened later, permissive CORS amplifies exploitability from browser contexts.

**Hardening ideas**
- Restrict CORS to known frontend/internal origins per environment.
- Narrow allowed headers/methods to required set.

---

## 4) ✅Inngest endpoint security depends on env correctness

**Evidence**
- `apps/web/app/api/inngest/route.ts:10` comment: signing key should be set in production.

**Concern**
- If signing key is absent/misconfigured, event authenticity guarantees may degrade.

**Why this matters**
- Event endpoints are orchestration-critical; auth misconfiguration can allow unauthorized job delivery.

**Hardening ideas**
- Enforce startup/runtime guardrail: fail hard in production when signing key is missing.
- Add health check that reports insecure configuration explicitly.

---

## 5) ✅ Fixed — Some webhook handlers had limited replay protections

**Fix implemented**
- New shared `apps/web/lib/webhook-replay-guard.ts` — in-memory `checkAndMark()` keyed by provider-specific delivery ID, 24-hour TTL, auto-prunes at 10 000 entries.
- **GitHub** (`webhooks/github/route.ts`) — deduplicates by `x-github-delivery` header.
- **Typeform** (`webhooks/typeform/route.ts`) — deduplicates by `form_response.token`.
- **HubSpot** (`webhooks/hubspot/route.ts`) — deduplicates by first event's `eventId`.
- **Airtable** (`webhooks/airtable/route.ts`) — deduplicates by `webhookId + timestamp` pair.
- All four return `{ ok: true, duplicate: true }` on replay (HTTP 200 so the provider stops retrying).
- Slack already had a 5-minute timestamp window and was not changed.

---

## 6) ✅ Fixed — Sensitive operational data leaked through verbose debug logging

**Fix implemented**
- `apps/runtime/engine/executor.py:823` — removed `body=resp.text[:800]` from the LLM response log; now logs only status code and model name.
- `apps/web/app/api/genesis/route.ts:437` — replaced raw-output preview with `Output length: N` (byte count only).
- `apps/web/app/api/genesis/route.ts:490` — removed the second `console.error` line that echoed raw model output on schema validation failure; the structured Zod error that follows it is sufficient.

---

## 7) ✅ Fixed — Connection metadata leaked secret-adjacent values to frontend

**Fix implemented**
- `apps/web/app/api/connections/route.ts` — `stripSensitiveMetadata()` removes a deny-listed set of keys (`asana_hook_secret`, `webhook_secret`, `hook_secret`, `signing_secret`) before the JSON response is sent to the client. New keys can be added to `METADATA_STRIP_KEYS` without touching call sites.
- The Asana webhook handler (`webhooks/asana/route.ts`) continues to read the hook secret via the service client (bypasses the frontend API) so verification is unaffected.
