# API Reference

The Corelyx HTTP API is served by the Next.js app under `apps/web/app/api`. All
routes return JSON. This reference covers the core resources used to build and
run programs: **Programs**, **Genesis**, **Runs**, **Connections**, and inbound
**Webhooks**.

- Base URL (local): `http://localhost:3000`
- All authenticated routes are scoped to the caller's **active workspace**.
- Request bodies are validated (Zod) before processing; invalid bodies return `400`.

---

## Authentication

Corelyx authenticates with **Supabase Auth**. The browser client holds a
Supabase session; server routes read the user from the session cookie
(`supabase.auth.getUser()`), and some routes also accept a device token
(`getAuthUser`) for the mobile client.

For programmatic access, send the Supabase access token as a Bearer token:

```http
GET /api/programs HTTP/1.1
Host: localhost:3000
Authorization: Bearer <supabase-access-token>
```

Obtain a token via the Supabase JS client against your project:

```ts
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data } = await supabase.auth.signInWithPassword({ email, password });
const accessToken = data.session?.access_token;
```

Authorization is layered on top of authentication:

- **Workspace roles** — `owner` / `admin` / `member` / `viewer`. Viewers cannot
  create, modify, or run; members may be further restricted per workspace.
- **Program roles** — `editor` / `viewer` memberships gate refine, edit, and run.

Unauthenticated requests receive `401 Unauthorized`.

---

## Programs

A program is a stored `ProgramSchema` (see [Architecture](./architecture.md)).

### `GET /api/programs`

List programs in the active workspace (summary fields, newest first).

**Response `200`**

```json
[
  {
    "id": "…",
    "name": "Invoice labeler",
    "description": "…",
    "execution_mode": "autonomous",
    "is_active": false,
    "schema_version": 3,
    "last_run_at": "2026-07-24T06:00:00Z",
    "visibility": "private",
    "workspace_id": "…",
    "user_id": "…",
    "created_at": "…",
    "updated_at": "…"
  }
]
```

### `POST /api/programs`

Create a **blank** program in the active workspace. (AI-generated programs are
created through [Genesis](#genesis) instead.)

**Body**

```json
{ "mode": "blank", "name": "My program", "description": "optional", "workspace_id": "optional-uuid" }
```

**Response `201`**

```json
{ "program": { "id": "…", "name": "…", "…": "…" }, "validation": { "errors": [], "warnings": [] } }
```

Errors: `401` unauthorized, `400` no active workspace / invalid body, `403`
viewer or `PROGRAM_LIMIT_REACHED`.

### `GET /api/programs/:id`

Return the full program row, including the complete `schema`, plus the caller's
`access` level.

### `PATCH /api/programs/:id`

Save an updated schema (program **editors** only). The body is the updated
schema (or draft); it is normalized and validated before persisting, a version
snapshot is written, and triggers are reconciled.

> Note: program updates use `PATCH`, not `PUT`.

### `DELETE /api/programs/:id`

Delete a program (editor/owner). Returns `204 No Content`.

Related sub-routes: `POST /api/programs/import`, `GET /api/programs/:id/preflight`,
`GET /api/programs/:id/errors`, `POST /api/programs/:id/share`.

---

## Genesis

Genesis turns natural language into a validated `ProgramSchema`. Both
**generation** (new program) and **refinement** (edit an existing one) go through
a **single endpoint** — the presence of `existing_program_id` + `refinement`
selects refinement.

### `POST /api/genesis`

**Body** (validated by `GenesisRequestSchema`)

| Field | Type | Notes |
| --- | --- | --- |
| `description` | string (≤2000) | Required for generation (≥10 chars) |
| `connection_ids` | uuid[] (≤250) | Connections to expose to the model |
| `api_key_id` | uuid | BYOK key to use (required unless `use_platform_key`) |
| `use_platform_key` | boolean | Use the managed platform key (spends credits) |
| `model` | string | Optional model override (validated against your tier) |
| `program_type` | `"workflow"` \| `"agent"` | Default `workflow` |
| `layout_direction` | `"horizontal"` \| `"vertical"` | Auto-layout hint |
| `existing_program_id` | uuid | **Refinement**: program to edit |
| `refinement` | string (≤2000) | **Refinement**: the change request |
| `existing_schema` | object | **Refinement**: current schema to patch |
| `genesis_v2` | boolean | Dev-gated: live introspection, patch edits, clarifying questions |

**Generation — `POST /api/genesis`**

```json
{
  "description": "Every morning at 8am, read unread emails and label invoices.",
  "connection_ids": ["<gmail-connection-uuid>"],
  "use_platform_key": true,
  "program_type": "workflow"
}
```

**Response `201`**

```json
{
  "program": { "id": "…", "name": "Invoice labeler", "execution_mode": "autonomous" },
  "schema": { "version": "1.0", "nodes": [], "edges": [], "triggers": [] },
  "validation": { "errors": [], "warnings": [] }
}
```

**Refinement — `POST /api/genesis`**

```json
{
  "existing_program_id": "<uuid>",
  "existing_schema": { "…": "current schema" },
  "refinement": "Also forward invoices over €1000 to accounting@example.com.",
  "connection_ids": ["<gmail-connection-uuid>"],
  "use_platform_key": true
}
```

**Response `200`**

```json
{ "program": { "…": "…" }, "schema": { "…": "…" }, "validation": { "…": "…" }, "patch": null }
```

**Genesis-specific errors**

| Status | Error | Meaning |
| --- | --- | --- |
| `403` | `EU_COMPLIANCE_BLOCKED` | Pre-filter blocked the request; see `message` |
| `403` | `GENESIS_LIMIT_REACHED` | Monthly Genesis quota reached |
| `403` | `PROGRAM_LIMIT_REACHED` | Program count limit reached |
| `402` | `INSUFFICIENT_CREDITS` | Not enough credits for the platform key |
| `429` | `RATE_LIMITED` | >10 Genesis calls/min/user |
| `422` | `AI_EDIT_INVALID_GRAPH` | Generated schema failed draft validation |
| `422` | (model error object) | The model reported it couldn't build the program |
| `502` | — | Model call failed / returned invalid JSON after repair |

Related: `POST /api/genesis/stream` (streaming generation), `GET
/api/genesis/models` (available models), `POST /api/genesis/sessions` (V2
clarifying-question sessions).

---

## Runs

A run is one execution of a program's schema by the runtime.

### `POST /api/runs`

Create a run and dispatch it to the runtime.

**Body**

```json
{ "program_id": "<uuid>", "trigger_payload": { "optional": "json object" } }
```

The route validates the schema (`ProgramSchemaZ`), runs pre-flight and compliance
checks, creates a `runs` row, and `POST`s the schema to the runtime `/execute`
endpoint over the internal auth channel. Some webhook/manual workflows require a
`trigger_payload`.

**Response `200`**

```json
{ "run_id": "<uuid>", "status": "running" }
```

**Run-specific errors**

| Status | Error | Meaning |
| --- | --- | --- |
| `403` | — | No permission to run this program |
| `403` | `RUN_LIMIT_REACHED` | Monthly run quota reached |
| `423` | `SECURITY_LOCKED` | Program/user under a security lock |
| `422` | `WORKFLOW_NOT_RUNNABLE` | Schema is a draft / not runnable |
| `422` | `TRIGGER_PAYLOAD_REQUIRED` | Workflow starts from external data |
| `422` | `Pre-flight checks failed` | See `checks[]` |
| `422` | `Compliance checks failed` | See `compliance_checks[]` |
| `502` | — | Runtime rejected the run |
| `503` | — | Runtime unreachable |

### `GET /api/runs?program_id=<uuid>`

List recent runs for a program (usage/cost fields included). Omit `program_id`
for a cross-workspace recent-runs feed.

### `GET /api/runs/:id`

Return the run plus its per-node executions.

**Response `200`**

```json
{
  "run": {
    "id": "…", "program_id": "…", "status": "success",
    "started_at": "…", "completed_at": "…", "error_message": null,
    "total_tokens": 1234, "billed_cost_usd": 0.02, "connector_api_calls": 5
  },
  "program": { "id": "…", "name": "…", "schema": { "…": "…" } },
  "node_executions": [
    { "node_id": "n1", "status": "success", "output_payload": { "…": "…" }, "…": "…" }
  ]
}
```

`RunStatus` is one of `success | failed | partial | running | waiting_approval`.

Related: `POST /api/runs/:id/cancel`, `POST /api/runs/:id/replay`,
`POST /api/runs/:id/replay-from-node`, `POST /api/runs/:id/analyze` (AI failure
analysis).

---

## Connections

A connection is a stored, workspace-scoped credential for a provider. Secrets
live in Vault and are **never** returned to the client.

### `GET /api/connections`

List connections in the active workspace. Provider tokens are omitted; only
sanitized metadata (e.g. account email) is returned.

```json
[
  {
    "id": "…", "name": "gmail:primary", "provider": "gmail",
    "auth_type": "oauth", "scopes": ["…"], "metadata": { "email": "me@example.com" },
    "is_valid": true, "last_validated_at": "…", "created_at": "…"
  }
]
```

### Creating an OAuth connection

OAuth connections are created through the provider OAuth flow, not a JSON `POST`.
Start it at:

```
GET /api/connections/oauth/<provider>          # e.g. /api/connections/oauth/gmail
```

The provider redirects back to
`/api/connections/oauth/<provider>/callback`, which exchanges the code, stores
the token in Vault, and creates the connection row. 70+ providers have dedicated
OAuth routes (gmail, slack, github, notion, hubspot, salesforce, …).

### `POST /api/connections/store-api-key`

Create an **API-key** connection for providers that don't support OAuth2.

```json
{ "provider": "openai", "label": "my key", "api_key": "sk-…" }
```

**Response `200`**: `{ "ok": true, "provider": "openai", "label": "openai:primary" }`

### `POST /api/connections/:id`

Live-ping the connection to re-validate its token. Returns `{ "is_valid": true }`.

### `PATCH /api/connections/:id`

Connection settings actions, e.g. `{ "action": "set_primary" }`.

### `DELETE /api/connections/:id`

Delete a connection. The Vault secret is removed first; if that fails the row is
kept to avoid orphaned secret state. Returns `204 No Content`.

---

## Webhooks

Public inbound webhook routes let external providers trigger programs. Each route
**verifies the provider's signature** (or a configured webhook token) before
dispatching event triggers, and enforces a public rate limit.

### `POST /api/webhooks/:provider`

Supported providers include `slack`, `github`, `gmail`, `stripe`, `hubspot`,
`asana`, `airtable`, `sheets`, `typeform`, and a generic `inbound` route.

**Signature verification (Slack example).** The route computes an HMAC-SHA256 over
`v0:<timestamp>:<raw-body>` with `SLACK_SIGNING_SECRET`, rejects timestamps older
than 5 minutes, and compares signatures in constant time:

```
X-Slack-Request-Timestamp: <unix-seconds>
X-Slack-Signature: v0=<hmac-sha256-hex>
```

| Status | Meaning |
| --- | --- |
| `200` | Accepted (or acknowledged & ignored) |
| `401` | Missing / stale / invalid signature |
| `400` | Invalid JSON body |
| `503` | Webhook not configured (missing signing secret) |
| `429` | Public rate limit exceeded |

Set the per-provider signing secret in the environment (e.g.
`SLACK_SIGNING_SECRET`, `STRIPE_WEBHOOK_SECRET`). See
[Connector Development](./connector-development.md) for the webhook contract.

---

## Error codes and responses

Errors use a consistent JSON shape. Simple errors from `apiError()`:

```json
{ "error": "Human-readable message" }
```

Machine-actionable errors add a stable `error` code and a `message`:

```json
{ "error": "RUN_LIMIT_REACHED", "message": "You've used all runs on your plan this month." }
```

Validation failures include the flattened Zod issues under `details`.

### Common status codes

| Status | Meaning |
| --- | --- |
| `200` / `201` | Success / created |
| `204` | Success, no content (deletes) |
| `400` | Invalid request body or missing parameter |
| `401` | Not authenticated |
| `402` | Payment required (insufficient credits / no valid API key) |
| `403` | Forbidden (role, plan limit, compliance block) |
| `404` | Not found (or hidden by access control) |
| `422` | Well-formed but unprocessable (draft schema, failed pre-flight/compliance) |
| `423` | Locked (security containment) |
| `429` | Rate limited |
| `502` | Upstream failure (model or runtime rejected) |
| `503` | Dependency unavailable (runtime unreachable, webhook not configured) |

### Stable error codes (selection)

`GENESIS_LIMIT_REACHED`, `PROGRAM_LIMIT_REACHED`, `RUN_LIMIT_REACHED`,
`INSUFFICIENT_CREDITS`, `RATE_LIMITED`, `EU_COMPLIANCE_BLOCKED`,
`WORKFLOW_NOT_RUNNABLE`, `TRIGGER_PAYLOAD_REQUIRED`, `SECURITY_LOCKED`,
`AI_EDIT_INVALID_GRAPH`.
