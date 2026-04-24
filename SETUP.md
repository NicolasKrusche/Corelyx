# FlowOS — Local Setup

## Prerequisites

- Node.js 20+
- pnpm 9+ (`npm i -g pnpm`)
- Supabase CLI (`npm i -g supabase`)
- Docker Desktop (for local Supabase)
- An Anthropic API key (for Genesis)
- Google Cloud project with OAuth credentials (for Gmail connections)

---

## 1. Install dependencies

```bash
pnpm install
```

---

## 2. Configure environment variables

```bash
cp .env.example apps/web/.env.local
```

Fill in `apps/web/.env.local`:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page, "anon public" key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, "service_role" key (keep secret) |
| `INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_EXECUTE` | Strong random secret shared by web and runtime for `/execute` calls |
| `INTERNAL_SERVICE_AUTH_SECRET_NEXT_RUNS_COMPLETE` | Strong random secret shared by runtime and web for run completion callbacks |
| `INTERNAL_SERVICE_AUTH_SECRET_NEXT_CONNECTIONS_TOKEN` | Strong random secret shared by runtime and web for OAuth token retrieval |
| `INTERNAL_SERVICE_AUTH_SECRET_NEXT_VAULT` | Strong random secret shared by runtime and web for Vault secret retrieval |
| `INTERNAL_SERVICE_AUTH_SECRET_NEXT_EVENT_DISPATCH` | Strong random secret for internal event dispatch calls |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GOOGLE_CLIENT_ID` | console.cloud.google.com → OAuth 2.0 Client IDs |
| `GOOGLE_CLIENT_SECRET` | Same page |
| `PUBSUB_GMAIL_WEBHOOK_AUDIENCE` | The exact Gmail Pub/Sub push endpoint URL configured as the OIDC audience |
| `PUBSUB_GMAIL_WEBHOOK_SERVICE_ACCOUNT_EMAIL` | The service account email configured on the Gmail Pub/Sub push subscription |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for local dev |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe CLI `listen` output or Dashboard webhook endpoint secret |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe Price ID for Pro monthly subscription |
| `STRIPE_PRICE_PRO_YEARLY` | Stripe Price ID for Pro yearly subscription |
| `STRIPE_PRICE_BUILDER_MONTHLY` | Stripe Price ID for Builder monthly subscription |
| `STRIPE_PRICE_BUILDER_YEARLY` | Stripe Price ID for Builder yearly subscription |

For Google OAuth, add these **Authorized redirect URIs**:
- `http://localhost:3000/api/connections/oauth/gmail/callback`

For Stripe local webhook forwarding, run this in a separate terminal:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Use the printed signing secret value as `STRIPE_WEBHOOK_SECRET`.

---

## 3. Start local Supabase

```bash
supabase start
```

This starts Postgres, Auth, Storage, and the dashboard at `http://localhost:54323`.

The credentials it prints override your `.env.local` for local dev — update:
- `NEXT_PUBLIC_SUPABASE_URL` → `http://127.0.0.1:54321`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → from `supabase start` output
- `SUPABASE_SERVICE_ROLE_KEY` → from `supabase start` output

---

## 4. Apply migrations

```bash
supabase db push
```

This runs all migrations in `supabase/migrations/` including:
- `20240001_init.sql` — all tables + RLS
- `20240002_vault_helpers.sql` — Vault RPC functions

Verify at `http://localhost:54323` (Supabase Studio).

---

## 5. Start the dev server

```bash
pnpm dev
```

Open `http://localhost:3000`.

---

## Test flow

1. **Sign up** at `/signup` → confirm email (check Inbucket at `http://localhost:54324`)
2. **Add an API key** at `/api-keys` → paste an Anthropic key
3. **Connect Gmail** at `/connections` → OAuth through Google
4. **Create a program** at `/programs/new`:
   - Describe your automation
   - Select your Gmail connection
   - Click "Generate program"
5. **View the program** — see the node list and raw schema

---

## Notes

- Supabase Vault is enabled by default in hosted Supabase. For local dev, Vault is available in Supabase CLI v1.148+. If Vault RPCs fail locally, the app will show an error — you can test without real Vault by using the hosted project instead.
- The visual editor (Phase 2) is not yet built — the program detail page shows a node list and raw JSON only.
- The runtime engine (Phase 3) is not yet built — programs cannot be executed yet.
