# Corelyx Claude Code Instructions

Corelyx lets users build AI workflows visually. The canonical workflow schema is the product contract: React Flow is the editor representation, and the runtime translates validated schemas into executable graph steps.

## Monorepo Structure

- `apps/web`: Next.js 15 App Router, API routes, Tailwind UI, connector OAuth, billing, triggers, and admin pages.
- `apps/runtime`: Python FastAPI runtime for workflow execution.
- `packages/schema`: Shared TypeScript schema types and Zod validators.
- `packages/db`: Supabase client exports and generated database types.
- `supabase/migrations`: Postgres schema, RLS, policies, and RPC functions.

The workspace package scope is still `@flowos/*`. Treat that as a technical package name, not the product name.

## Common Commands

```powershell
pnpm --filter @flowos/schema type-check
pnpm --filter @flowos/db type-check
pnpm --filter @flowos/web exec tsc --noEmit --incremental false
pnpm --filter @flowos/web lint
pnpm --filter @flowos/web test
pnpm --filter @flowos/web build
```

Runtime tests:

```powershell
cd apps\runtime
venv\Scripts\python.exe -m pytest tests
```

## Engineering Rules

- Keep credentials server-side. Never return OAuth tokens, Vault secret IDs, or service-role data to frontend responses.
- Do not log secrets or raw provider tokens.
- Route all credential access through the established token/Vault helpers.
- Validate request bodies and external webhook payloads before processing.
- Keep schema translations tested when changing node, edge, trigger, or connector behavior.
- Prefer focused fixes over broad rewrites.
- Do not rename `@flowos/*` packages without a deliberate monorepo migration.

## Genesis Prompt Sync

When adding or changing connector operations under `apps/runtime/connectors`, check `apps/web/lib/genesis/prompt.ts` so Genesis can generate the correct operation names, input fields, and output fields.

If an operation is internal-only, leave a short note in the implementation explaining why it is intentionally omitted from Genesis.

## Security Expectations

- Internal web-to-runtime calls must use the internal auth helpers and shared secrets.
- Runtime callbacks to the web app must use scoped internal secrets.
- Public webhook routes must verify provider signatures or configured webhook tokens.
- Supabase service-role clients must stay in server-only code paths.
- Local `.env` files are ignored and must not be committed.
