# FlowOS — Claude Code Instructions

> Visual Agentic Operating System: user describes automation → AI designs the graph → user tunes it visually → it runs itself.

---

## Project Overview

FlowOS lets users build AI agent pipelines visually. The canonical JSON schema is the heart of the product — React Flow and LangGraph are both just translation layers on top of it.

**Monorepo structure:**
- `apps/web` — Next.js 14 App Router + Tailwind (→ Vercel)
- `apps/runtime` — Python FastAPI + LangGraph (→ Railway)
- `packages/schema` — Canonical types + Zod validators (shared TS)
- `packages/db` — Supabase client + generated types

**Run dev:** `pnpm dev` (Turborepo runs all packages)

For recurring troubleshooting and resolved bugs, see `common_issues.md` at the repo root.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 App Router, Tailwind, shadcn/ui |
| Visual editor | React Flow |
| Runtime | LangGraph (Python, Railway) |
| Auth + DB | Supabase (RLS, Vault, Realtime) |
| Model routing | LiteLLM (self-hosted Railway) |
| Triggers | Inngest |
| Monorepo | pnpm + Turborepo |

---

## Security Rules (Non-Negotiable)

- Tokens are **never** returned to the frontend
- Tokens are **never** logged — log scrubber middleware must redact OAuth token patterns
- All credential access goes through `getValidToken()` only
- `credential_ref` / `vault_secret_id` are **never** in any frontend-facing API response
- All model calls go through the LiteLLM proxy — never directly from frontend
- Connection deletion must purge from Vault, not just the DB row

---


## Genesis Prompt Sync Rule

Whenever you add or modify a connector operation (in `apps/runtime/connectors/`), always check `apps/web/lib/genesis/prompt.ts` and update it if needed so Genesis knows about the new operation. This applies to:

- New operations added to `supported_operations`
- Changed parameter names or semantics
- New output fields that downstream nodes might reference

If the operation is user-facing (Genesis could plausibly generate it), document it in the prompt. If it's purely internal, note why it was omitted.

---

## Coding Standards

- TypeScript strict mode everywhere — **no `any`**
- All DB access through typed Supabase client with RLS enforced
- No secrets in frontend env vars — backend only
- All API routes validate and sanitize input before processing
- All external API calls (models, connectors) go through server-side routes only
- Every function that touches credentials must have a unit test
- Translation functions (`toReactFlow`, `fromReactFlow`, `toLangGraph`) must have exhaustive tests covering every node type, edge type, and sentinel value
- Supabase Realtime for all live updates — **no polling anywhere in the codebase**
- React Flow editor dispatches actions only — never mutates schema directly

---

## What NOT to Build (MVP Scope Guard)

Do not implement any of the following — they are explicitly out of scope:

- Native mobile app (PWA only)
- White-label / embedding

