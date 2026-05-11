# Corelyx

Corelyx is a visual automation builder for graph-based AI workflows. Users describe an automation in plain language, an AI model (Genesis) generates a validated workflow schema, the schema is edited visually, and the runtime executes it with server-side credentials.

## Repository Layout

pnpm + Turborepo monorepo.

| Path | Description |
|---|---|
| `apps/web` | Next.js 15 App Router — UI, API routes, OAuth, billing, admin |
| `apps/runtime` | Python FastAPI runtime — executes validated workflow schemas via LangGraph |
| `packages/schema` | Shared TypeScript types and Zod validators |
| `packages/db` | Supabase client exports and generated database types |
| `supabase/migrations` | Postgres migrations, RLS policies, Vault helpers, RPC functions |

> The workspace package scope is `@flowos/*`. This is a technical namespace — do not rename without a full monorepo migration.

## Architecture

Corelyx is schema-first.

- The canonical JSON workflow schema is the source of truth.
- The web editor translates between visual state (React Flow) and the canonical schema.
- The runtime translates the canonical schema into executable LangGraph steps.
- Credentials stay server-side at all times, referenced by opaque IDs.
- Validation gates run before save and before execution — invalid schemas never reach the runtime.

Genesis (the AI generation layer) uses a two-step flow: a fast EU regulatory compliance pre-filter runs first to identify applicable obligations (GDPR, AI Act, NIS2, etc.), then the main generation prompt incorporates those constraints so the output schema is compliance-aware from the start.

## Tech Stack

| Layer | Choice |
|---|---|
| Web | Next.js 15, React 18, Tailwind CSS, React Flow |
| Runtime | Python 3.11+, FastAPI, LangGraph |
| Auth / DB | Supabase (Postgres, Auth, RLS, Realtime, Vault) |
| Billing | Stripe |
| Email | Resend |
| Triggers | Inngest + provider webhooks |
| Tooling | pnpm 9, Turborepo, Vitest, ESLint, TypeScript strict |

## Local Development

**Requirements:** Node.js 20+, pnpm 9+, Python 3.11+, Supabase CLI, Docker Desktop.

```powershell
# Install JS dependencies
pnpm install

# Copy and fill in environment files
Copy-Item apps\web\.env.local.example apps\web\.env.local
Copy-Item apps\runtime\.env.example apps\runtime\.env

# Start the web app
pnpm --filter @flowos/web dev

# Start the runtime (separate terminal)
cd apps\runtime
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8002 --reload
```

See [SETUP.md](SETUP.md) for the full setup guide and [STARTUP_STEPS.md](STARTUP_STEPS.md) for the Windows quick-start checklist.

## Quality Checks

Run from the repository root:

```powershell
pnpm --filter @flowos/schema type-check
pnpm --filter @flowos/db type-check
pnpm --filter @flowos/web type-check
pnpm --filter @flowos/web lint
pnpm --filter @flowos/web test
pnpm --filter @flowos/web build
pnpm audit --audit-level high
```

Runtime tests:

```powershell
cd apps\runtime
venv\Scripts\python.exe -m pytest tests
```

## Environment and Secrets

Local `.env` files are gitignored. Do not commit real keys, OAuth secrets, Stripe secrets, webhook secrets, or service tokens. Sample files contain only safe local defaults (localhost URLs, blank secrets).

See `apps/web/.env.local.example` and `apps/runtime/.env.example` for all required variables.

## Compliance

Corelyx is designed for EU operation. Relevant compliance documents:

- [AI_SYSTEM_INVENTORY.md](AI_SYSTEM_INVENTORY.md) — EU AI Act system inventory
- [DPIA_TEMPLATE.md](DPIA_TEMPLATE.md) — GDPR Data Protection Impact Assessment
- [ROPA_CONTROLLER.md](ROPA_CONTROLLER.md) — Record of Processing Activities (Controller)
- [ROPA_PROCESSOR.md](ROPA_PROCESSOR.md) — Record of Processing Activities (Processor)
- [SUBPROCESSORS.md](SUBPROCESSORS.md) — Sub-processor list
- [SECURITY.md](SECURITY.md) — Security policy and disclosure process
- [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) — Incident response runbook

## Documentation

- [SETUP.md](SETUP.md) — Full local setup
- [STARTUP_STEPS.md](STARTUP_STEPS.md) — Windows quick-start checklist
- [AGENTS.md](AGENTS.md) — Codex-facing engineering rules
- [CLAUDE.md](CLAUDE.md) — Claude-facing engineering rules
- [common_issues.md](common_issues.md) — Known issues and resolutions

## License

See [LICENSE](LICENSE).
