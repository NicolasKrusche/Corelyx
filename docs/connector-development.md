# Connector Development Guide

A **connector** is a native integration that exposes one provider's operations
(e.g. `gmail.send_email`, `slack.post_message`) to the runtime. Corelyx ships
210+ connectors in [`apps/runtime/connectors`](../apps/runtime/connectors). This
guide walks through adding a new one.

A connector touches three places:

1. **Runtime implementation** — `apps/runtime/connectors/<provider>.py` (the code that calls the API).
2. **Genesis prompt** — `apps/web/lib/genesis/prompt.ts` (so the AI can generate nodes for it).
3. **Auth wiring** — an OAuth route or the API-key path (so users can connect an account).

---

## 1. Connector structure

Every connector is a single Python module implementing the `IConnector` contract
from [`connectors/base.py`](../apps/runtime/connectors/base.py):

```python
class IConnector(ABC):
    @property
    @abstractmethod
    def provider(self) -> str: ...            # slug, e.g. "gmail"

    @property
    @abstractmethod
    def supported_operations(self) -> list[str]: ...

    @abstractmethod
    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]: ...                   # merged into run state
```

Key contract rules:

- `provider` is a unique slug. Duplicate providers raise at registry build time.
- `execute` receives a **valid access token** (the caller refreshes OAuth tokens
  and retrieves API keys from Vault — connectors never touch credential storage).
- The dict returned by `execute` is merged into run state, so downstream nodes
  read your fields via `{{node_id.field}}` expressions.
- On failure, raise `ConnectorError(code, message)` — never leak provider tokens
  in the message or logs.

### Registration is automatic

There is no manual registry list. On first access,
[`connectors/__init__.py`](../apps/runtime/connectors/__init__.py) discovers every
`*.py` in the directory, imports it, and registers any `IConnector` subclass by
its `provider` slug (skipping `__init__`, `base`, `rate_limit`). **Just drop your
file in `connectors/` and it's live** via `get_connector(provider)`.

### Example — a minimal connector

Model your file on an existing one like
[`connectors/calendly.py`](../apps/runtime/connectors/calendly.py):

```python
"""Acme connector."""
from __future__ import annotations

from typing import Any
import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.acme.com/v1"


class AcmeConnector(IConnector):
    """Acme connector for: list_widgets, create_widget."""

    provider = "acme"
    supported_operations = ["list_widgets", "create_widget"]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_widgets":
                    return await self._list_widgets(client, headers, params)
                case "create_widget":
                    return await self._create_widget(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Acme does not support '{operation}'",
                    )

    async def _list_widgets(self, client, headers, params) -> dict:
        # ALWAYS bound list operations — unbounded scans blow the run time limit.
        limit = int(params.get("limit", 50))
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/widgets",
            headers=headers, params={"limit": limit},
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        data = r.json()
        return {"items": data.get("data", []), "total": data.get("total", 0)}

    async def _create_widget(self, client, headers, params) -> dict:
        if "name" not in params:
            raise ConnectorError("MISSING_PARAM", "name is required")
        r = await request_with_rate_limit(
            client, "POST", f"{_BASE}/widgets",
            headers=headers, json=params,
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        return r.json()
```

### Use the shared rate-limit wrapper

Always route provider HTTP calls through
[`request_with_rate_limit`](../apps/runtime/connectors/rate_limit.py) rather than
calling `client.request` directly. It gives you bounded retries with jittered
exponential backoff on `429` and transient `5xx`, and honors `Retry-After` /
`X-RateLimit-Reset` headers:

```python
r = await request_with_rate_limit(
    client, "GET", url,
    headers=headers, params=query,
    max_attempts=5,          # optional overrides
    base_delay_seconds=1.0,
)
```

### Design conventions

- **Bound every list operation.** Accept and default a `limit`; never scan an
  unbounded collection — the run has a wall-clock budget.
- **Return stubs for large items.** For list endpoints that return heavy objects
  (e.g. full email bodies), return lightweight `{id, ...}` stubs and provide a
  separate `read_*`/`get_*` operation. Document this in the Genesis prompt so the
  model generates a `list → loop → read` pattern instead of assuming full fields.
- **Idempotency & 409s.** If "create" can 409 on an existing resource, prefer an
  upsert-style operation or document the constraint; a hard 409 halts the run.
- **Deterministic output shape.** Keep the returned dict keys stable — downstream
  nodes and Genesis both depend on them.

---

## 2. Zod schema for operations

The runtime connector defines operations in Python, but Genesis needs a
machine-usable description of each operation's **name, input params, and output
fields**. That contract lives in the Genesis prompt (see §3). There is no
separate per-connector Zod file — the canonical *program* schema
([`packages/schema`](../packages/schema)) validates the `ConnectionNode` that
wraps any connector call:

```ts
interface OAuthConnectionConfig {
  connector_type?: "oauth";
  provider?: string;                 // "acme"
  operation?: string;                // "create_widget"
  operation_params?: Record<string, unknown>;
  scope_access: "read" | "write" | "read_write";
  scope_required: string[];
}
```

So your operation names and params must be expressible as
`{ operation, operation_params }` on a connection node. Keep param names
lowercase-snake and match exactly what `execute` reads from `params`.

---

## 3. Auth flow

Connectors receive an `access_token`; how that token is obtained depends on the
provider's auth model.

### OAuth 2.0

For OAuth providers, add a route pair under
`apps/web/app/api/connections/oauth/<provider>/`:

- `GET /api/connections/oauth/<provider>` — start the flow (redirect to the
  provider with client id, scopes, and the callback URL).
- `GET /api/connections/oauth/<provider>/callback` — exchange the code, store the
  token in **Vault**, and insert the `connections` row.

Configure the provider app credentials in the environment:

```
<PROVIDER>_CLIENT_ID=…
<PROVIDER>_CLIENT_SECRET=…
```

and register the redirect URL
`http://localhost:3000/api/connections/oauth/<provider>/callback`.

At run time, the web app resolves and refreshes the token server-side
(`getValidOAuthToken`) and passes it to the runtime — the runtime looks it up
from Vault via the internal auth channel. **Credentials never reach the browser
or the connector's logs.**

### API key

For providers without OAuth2, users store a key via
`POST /api/connections/store-api-key`:

```json
{ "provider": "acme", "label": "my key", "api_key": "sk-…" }
```

The key is written to Vault and surfaces to your connector as `access_token`.

### Webhooks (provider → Corelyx)

If your provider can push events, add a route at
`apps/web/app/api/webhooks/<provider>/route.ts`. It **must**:

1. Enforce the public rate limit.
2. Verify the provider signature (HMAC) or a configured webhook token — reject
   `401` on missing/invalid/stale signatures.
3. Parse the (bounded) body and dispatch event triggers.

See the Slack route for the canonical HMAC-SHA256 + timestamp-window +
constant-time-compare pattern, documented in
[API Reference → Webhooks](./api-reference.md#webhooks).

---

## 4. Genesis sync

**This step is required.** Per the repo rules (`AGENTS.md` / `CLAUDE.md`), when
you add or change connector operations you must update
[`apps/web/lib/genesis/prompt.ts`](../apps/web/lib/genesis/prompt.ts) so Genesis
generates correct operation names, input fields, and output fields.

Add (or extend) an entry in `CONNECTOR_DEFINITIONS`. Each connector has a
**tier** that controls how much detail is included in the prompt:

- **Tier 1** — always included, full detail. High-frequency integrations.
- **Tier 2** — medium detail, included when the connector is selected.
- **Tier 3** — one-line stub only. Rarely used.

```ts
export const CONNECTOR_DEFINITIONS: Record<string, ConnectorDef> = {
  // …
  acme: {
    tier: 3,
    stub: `ACME: list_widgets, create_widget`,
    // For tier 1/2 also provide `full`/`medium` with param + output shapes:
    // full: `ACME:
    //   list_widgets: params={limit:number} → output:{items:[{id,name}],total:int}
    //   create_widget: params={name:string(REQUIRED)} → output:{id,name}`,
  },
};
```

Guidance:

- Document each operation's **required** params (mark them `(REQUIRED)`) and the
  **output fields** downstream nodes can reference.
- Encode gotchas as `⚠` notes (bounded lists, stub-then-read patterns, 409
  hazards) — the model reads and obeys them.
- If an operation is **internal-only** and should not be generated by Genesis,
  leave a short comment in the Python implementation explaining why it is
  intentionally omitted from the prompt.

---

## 5. Testing

Connector tests live in [`apps/runtime/tests`](../apps/runtime/tests) (e.g.
`test_connector_registry_light.py`, `test_connector_stubs.py`,
`test_connector_deep.py`). Run them with:

```bash
cd apps/runtime
python -m pytest tests
# focused:
python -m pytest tests/test_connector_stubs.py -q
```

A good connector test covers:

- **Registration** — `get_connector("acme")` returns your class and
  `supported_operations` matches the operations `execute` handles.
- **Happy path** — mock the provider HTTP call (`httpx` transport / `mocks/`) and
  assert the returned dict shape.
- **Error mapping** — a `>=400` response raises `ConnectorError` and does not leak
  the token.
- **Unsupported operation** — raises `ConnectorError("UNSUPPORTED_OPERATION", …)`.

Before you finish, run the schema/type checks too, since the Genesis prompt is
TypeScript:

```bash
pnpm --filter @flowos/web type-check -- --incremental false
pnpm --filter @flowos/web lint
```

---

## Checklist

- [ ] `apps/runtime/connectors/<provider>.py` implements `IConnector` (unique `provider` slug).
- [ ] All provider HTTP calls go through `request_with_rate_limit`.
- [ ] List operations are bounded; heavy items use stub-then-read.
- [ ] Errors raise `ConnectorError`; no tokens in logs or messages.
- [ ] Auth wired: OAuth route pair **or** API-key path (and webhook route if applicable).
- [ ] `CONNECTOR_DEFINITIONS` entry added/updated in `genesis/prompt.ts` (correct tier).
- [ ] Internal-only operations noted as intentionally omitted from Genesis.
- [ ] Tests added; `pytest`, `type-check`, and `lint` pass.
