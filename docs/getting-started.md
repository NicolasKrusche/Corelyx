# Getting Started

Corelyx is a **Visual Agentic Operating System** — a schema-first builder for AI
workflows and agents. You describe what you want in natural language (Genesis
generates a workflow), refine it on a visual canvas, and the runtime executes the
validated schema against 210+ connectors.

This guide gets a full local stack running and walks you through your first
workflow.

> **Package scope note:** the workspace packages are named `@flowos/*` for
> historical reasons. That is a technical package name only — the product is
> Corelyx. Do not rename these packages.

---

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20+ | Web app + tooling |
| pnpm | 9+ | Monorepo package manager (`corepack enable`) |
| Python | 3.11+ | Runtime service |
| Docker | latest | Local Postgres/Redis, or the full dev stack |
| Supabase CLI | latest | Local Supabase (auth, Postgres, Studio) |

You also need at least one LLM provider key (Anthropic or OpenAI) so Genesis and
agent nodes can run.

---

## Option A — Quick Start (native, recommended for app development)

### 1. Install dependencies

```bash
pnpm install
```

Runtime (Python):

```bash
cd apps/runtime
python -m venv venv
# Linux/macOS:
source venv/bin/activate
# Windows PowerShell:
#   venv\Scripts\Activate.ps1
pip install -U pip poetry
poetry install
cd ../..
```

### 2. Configure environment

Copy the root example and fill in the values (see the
[Environment Variables Reference](#environment-variables-reference) below):

```bash
cp .env.example .env
```

For native development the web app reads `apps/web/.env.local` and the runtime
reads `apps/runtime/.env`. Copy the per-app examples if present, or mirror the
relevant keys from your root `.env`.

At minimum set:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)
- `RUNTIME_URL` / `NEXT_PUBLIC_RUNTIME_URL` (e.g. `http://localhost:8002`)
- `INTERNAL_SERVICE_AUTH_SECRET_WEB_TO_RUNTIME` and `INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_TO_WEB` (must be **identical** in the web app and the runtime)
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

### 3. Start Supabase and apply migrations

```bash
supabase start
supabase db push
```

Copy the printed API URL, anon key, and service-role key into your env files.
Supabase Studio is usually at `http://localhost:54323`.

### 4. Start the services

Terminal 1 — web app:

```bash
pnpm --filter @flowos/web dev
# → http://localhost:3000
```

Terminal 2 — runtime:

```bash
cd apps/runtime
python -m uvicorn main:app --host 127.0.0.1 --port 8002 --reload
```

Check runtime health:

```bash
curl http://127.0.0.1:8002/health
# {"status":"ok"}
```

---

## Option B — Docker Setup (full stack, one command)

`docker-compose.dev.yml` brings up Postgres, Redis, the runtime, the web app,
Inngest (background jobs/triggers), and an optional LiteLLM proxy — all with
hot-reload.

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY / OPENAI_API_KEY and the internal secrets
docker compose -f docker-compose.dev.yml up
```

Services and ports:

| Service | URL / Port | Purpose |
| --- | --- | --- |
| web | http://localhost:3000 | Next.js app (Node inspector on `9229`) |
| runtime | http://localhost:8002 | FastAPI + LangGraph (debugpy on `5678`) |
| postgres | `localhost:5432` | Database (migrations auto-applied on init) |
| redis | `localhost:6379` | Rate limiting, locks, queues |
| inngest | http://localhost:8288 | Trigger/cron dev dashboard |
| litellm | http://localhost:4000 | Optional BYOK proxy (`--profile litellm`) |

Optional profiles:

```bash
# Seed demo data:
docker compose -f docker-compose.dev.yml --profile seed up seed
# Run the LiteLLM proxy alongside the stack:
docker compose -f docker-compose.dev.yml --profile litellm up
```

The dev compose file mounts `apps/web` and `apps/runtime` as volumes, so code
changes hot-reload without a rebuild. Postgres loads `supabase/migrations` on
first boot.

---

## Your First Workflow

The end-to-end path is: **Sign up → Connect Gmail → Generate a program with
Genesis → Run it.**

### 1. Sign up

Open `http://localhost:3000`, create an account. On first login a default
**workspace** is provisioned — every program, connection, and run is scoped to a
workspace.

### 2. Connect Gmail

Go to **Connections → New**, choose **Gmail**, and complete the OAuth flow. For
this to work locally you must have configured the Google OAuth client and
registered the redirect URL:

```
http://localhost:3000/api/connections/oauth/gmail/callback
```

Tokens are stored server-side (Vault) and are **never** exposed to the browser.

### 3. Generate a program with Genesis

Open the **Genesis** panel (New Program → describe it) and enter something like:

> "Every morning at 8am, read my unread emails from the last day, and for any
> that look like an invoice, label them 'Invoice'."

Select your Gmail connection so Genesis knows which operations are available.
Genesis:

1. Runs an EU-compliance pre-filter.
2. Generates a canonical **ProgramSchema** (nodes, edges, triggers).
3. Validates and auto-repairs common issues.
4. Saves the program and syncs any triggers.

Under the hood this is a `POST /api/genesis` call — see the
[API Reference](./api-reference.md#genesis) for the exact contract.

### 4. Refine on the canvas

The generated schema renders as a React Flow graph. Drag nodes, edit configs,
or use **AI Edit** (a Genesis *refinement*) to change it in place:

> "Also forward invoices over €1000 to accounting@example.com."

Every edit is validated against the Zod schema before it can be saved or run.

### 5. Run it

Click **Run** (or **Run with payload** for trigger-driven workflows). This calls
`POST /api/runs`, which:

1. Validates the schema (`ProgramSchemaZ`) and runs pre-flight + compliance checks.
2. Creates a `runs` row.
3. Dispatches to the runtime `/execute` endpoint over the internal auth channel.

Watch live progress on the run page (backed by `GET /api/runs/:id`, which returns
the run plus per-node `node_executions`).

---

## Environment Variables Reference

The canonical list lives in [`.env.example`](../.env.example). Key groups:

### Application

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public URL of the web app (CORS, links, callbacks) |
| `APP_ENV` | `development` \| `production` |

### Supabase / PostgreSQL

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key for the browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — **server-only**, never ship to the browser |

### Runtime service

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_RUNTIME_URL` | Runtime URL used by the browser |
| `RUNTIME_URL` / `RUNTIME_INTERNAL_URL` | Runtime URL used server-to-server |

### Internal service auth

| Variable | Description |
| --- | --- |
| `INTERNAL_SERVICE_AUTH_SECRET_WEB_TO_RUNTIME` | Shared secret: web → runtime `/execute` calls |
| `INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_TO_WEB` | Shared secret: runtime → web callbacks |

> These two secrets must match on **both** sides or runs fail to dispatch.

### LLM keys (BYOK)

| Variable | Description |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic key for Genesis/agent nodes |
| `OPENAI_API_KEY` | OpenAI key |
| `OPENAI_EU_RESIDENCY` | `true` only for a verified EU-resident OpenAI account |
| `PLATFORM_OPENROUTER_API_KEY` | Platform key for credit-based Genesis (managed hosting) |
| `LITELLM_PROXY_URL` / `LITELLM_PROXY_KEY` | Optional LiteLLM proxy for BYOK routing |

### Infrastructure & integrations

| Variable | Description |
| --- | --- |
| `REDIS_URL` | Redis for rate limiting, locks, queues |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Background jobs & triggers |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error tracking (optional) |
| `LOG_LEVEL` | `trace\|debug\|info\|warn\|error` |
| `*_CLIENT_ID` / `*_CLIENT_SECRET` | Per-provider connector OAuth apps |
| `<PROVIDER>_SIGNING_SECRET` | Per-provider webhook signature verification (e.g. `SLACK_SIGNING_SECRET`) |

---

## Where to next

- [Architecture](./architecture.md) — how schema, editor, and runtime fit together.
- [API Reference](./api-reference.md) — the HTTP contract.
- [Connector Development](./connector-development.md) — add a new integration.
- [Self-Hosting](./self-hosting.md) — deploy to your own infrastructure.
