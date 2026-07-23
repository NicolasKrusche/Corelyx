# Configuration Reference

All environment variables for self-hosted Corelyx deployment.

## Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL password | `your-strong-password` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJhbGci...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase or self-hosted PostgREST URL | `https://your-domain.com` |

## LLM API Keys (At Least One Required)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | OpenAI API key for GPT models |
| `OPENAI_EU_RESIDENCY` | Set to `true` for EU-resident OpenAI accounts |
| `LITELLM_PROXY_URL` | LiteLLM proxy URL (for centralized LLM access) |
| `LITELLM_PROXY_KEY` | LiteLLM proxy API key |

## Application URLs

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public URL of the web app |
| `NEXT_PUBLIC_RUNTIME_URL` | `http://localhost:8002` | Public URL of the runtime |
| `RUNTIME_URL` | `http://runtime:8002` | Internal URL for web→runtime calls |
| `RUNTIME_INTERNAL_URL` | `http://runtime:8002` | Internal URL for runtime callbacks |

## Internal Service Authentication

| Variable | Description |
|----------|-------------|
| `INTERNAL_SERVICE_AUTH_SECRET_WEB_TO_RUNTIME` | Shared secret for web→runtime auth |
| `INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_TO_WEB` | Shared secret for runtime→web auth |

Generate with: `openssl rand -hex 32`

## Background Jobs (Inngest)

| Variable | Description |
|----------|-------------|
| `INNGEST_EVENT_KEY` | Inngest event key for event sending |
| `INNGEST_SIGNING_KEY` | Inngest signing key for function verification |
| `INNGEST_SIGNING_KEY_FALLBACK` | Fallback signing key for key rotation |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `POSTGRES_DB` | `corelyx` | Database name |
| `POSTGRES_USER` | `corelyx` | Database user |
| `POSTGRES_PASSWORD` | — | Database password |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |

## Monitoring (Optional)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for error tracking |
| `NEXT_PUBLIC_SENTRY_TRACE_SAMPLE_RATE` | Trace sample rate (default: `0.1`) |

## Bot Protection (Optional)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |

## Anthropic OAuth (Optional)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_CLIENT_ID` | Anthropic OAuth client ID |
| `ANTHROPIC_CLIENT_SECRET` | Anthropic OAuth client secret |

## Runtime Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `RUNTIME_ENV` | `production` | Runtime environment marker |
| `NODE_ENV` | `production` | Node.js environment |
| `PORT` | `8002` (runtime) / `3000` (web) | Service port |

## Docker Compose Specific

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `3000` | Host port for web service |
| `INNGEST_PORT` | `8288` | Host port for Inngest dashboard |
