# Safety Concerns (Architecture / Hardening)

This file tracks **broader safety concerns** (design/operational risks) that may not always be immediate exploitable bugs but increase risk posture.

---

## 1) Webhook trigger auth is URL-token based only

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

## 2) Shared static runtime secret used across internal service boundaries

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

## 3) Runtime allows all CORS origins/methods/headers

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

## 4) Inngest endpoint security depends on env correctness

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

## 5) Some webhook handlers have limited replay protections

**Evidence**
- Slack enforces timestamp freshness: `apps/web/app/api/webhooks/slack/route.ts:25-28`
- Other handlers validate signature but generally do not enforce timestamp/idempotency replay windows (e.g. GitHub/Typeform/HubSpot/Airtable routes).

**Concern**
- Captured signed requests may be replayed within practical windows if provider replay protections are not explicitly checked server-side.

**Why this matters**
- Replays can trigger duplicate automation runs and side effects.

**Hardening ideas**
- Track recent delivery IDs/message IDs and reject duplicates.
- Enforce provider timestamp windows where available.

---

## 6) Sensitive operational data may leak through verbose debug logging paths

**Evidence**
- `apps/runtime/engine/executor.py:818` logs model response body slice.
- `apps/web/app/api/genesis/route.ts:437,490` logs raw model output preview.

**Concern**
- Model outputs can include user data, prompts, or sensitive context that should not be in logs.

**Why this matters**
- Log aggregation systems often have wider access than primary data stores.

**Hardening ideas**
- Replace raw payload logging with hashed IDs/structured error metadata.
- Add centralized redaction policy for model and connector payloads.

---

## 7) Connection metadata currently used for data that can be secret-adjacent

**Evidence**
- Asana hook secret persisted in connection metadata: `apps/web/app/api/webhooks/asana/route.ts:58`
- Connections API returns full metadata to frontend: `apps/web/app/api/connections/route.ts:13`

**Concern**
- Metadata becomes mixed-trust storage; secret-adjacent values can flow to client-facing APIs.

**Why this matters**
- Increases exposure surface and makes data-classification boundaries blurry.

**Hardening ideas**
- Keep webhook secrets and similar values only in Vault/secret store.
- Introduce metadata allowlist for client responses (explicitly strip sensitive keys).
