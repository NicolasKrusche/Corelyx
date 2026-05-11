# Corelyx Local Setup

## Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+
- Supabase CLI
- Docker Desktop for local Supabase
- Provider accounts for any connectors you want to test

## Install Dependencies

```powershell
pnpm install
```

For the runtime, use the existing virtual environment if present, or create one:

```powershell
cd apps\runtime
python -m venv venv
venv\Scripts\python.exe -m pip install -U pip
venv\Scripts\python.exe -m pip install poetry
venv\Scripts\poetry.exe install
```

If Poetry is already installed globally, this is enough:

```powershell
poetry install
```

## Environment Files

Copy the examples and fill in values locally:

```powershell
Copy-Item apps\web\.env.local.example apps\web\.env.local
Copy-Item apps\runtime\.env.example apps\runtime\.env
```

Do not commit `.env.local`, `.env`, or any real secret values.

Required web values for normal local development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `RUNTIME_URL`
- `RUNTIME_SECRET`
- `INTERNAL_SERVICE_AUTH_SECRET`
- Scoped internal service secrets listed in `apps/web/.env.local.example`
- `ANTHROPIC_API_KEY` or another configured model provider key

Optional values enable specific integrations:

- Stripe billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and price IDs.
- Resend email: `RESEND_API_KEY`, `FROM_EMAIL`.
- Inngest: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.
- Connector OAuth: provider-specific `*_CLIENT_ID` and `*_CLIENT_SECRET` values.
- Provider webhooks: provider-specific signing or token secrets.

The runtime must share the same internal secrets used by the web app for runtime execution, run completion callbacks, OAuth token retrieval, and Vault secret retrieval.

## Local Supabase

Start Supabase from the repository root:

```powershell
supabase start
```

Copy the printed local API URL, anon key, and service role key into `apps/web/.env.local` and `apps/runtime/.env`.

Apply migrations:

```powershell
supabase db push
```

Supabase Studio is usually available at `http://localhost:54323`.

## Start Services

Terminal 1, web app:

```powershell
pnpm --filter @flowos/web dev
```

Open `http://localhost:3000`.

Terminal 2, runtime:

```powershell
cd apps\runtime
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8002 --reload
```

Check runtime health:

```powershell
Invoke-WebRequest http://127.0.0.1:8002/health -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected response:

```json
{"status":"ok"}
```

## Useful Checks

```powershell
pnpm --filter @flowos/schema type-check
pnpm --filter @flowos/db type-check
pnpm --filter @flowos/web type-check -- --incremental false
pnpm --filter @flowos/web lint
pnpm --filter @flowos/web test
pnpm --filter @flowos/web build
```

Runtime tests:

```powershell
cd apps\runtime
venv\Scripts\python.exe -m pytest tests
```

## OAuth Redirects

For local OAuth testing, configure provider redirect URLs as needed. Common examples:

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/api/connections/oauth/google/callback`
- `http://localhost:3000/api/connections/oauth/gmail/callback`
- `http://localhost:3000/api/connections/oauth/github/callback`
- `http://localhost:3000/api/connections/oauth/slack/callback`

## Stripe Webhooks

For local billing webhook testing:

```powershell
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Use the printed signing secret as `STRIPE_WEBHOOK_SECRET`.
