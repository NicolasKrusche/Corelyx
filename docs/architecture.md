# Architecture

Corelyx is **schema-first**. The canonical workflow schema — a single, versioned
JSON document validated by Zod — is the product contract. Everything else is a
translation layer *around* that schema:

- **React Flow** is the editor's translation of the schema (canvas ⇆ schema).
- **LangGraph** is the runtime's translation of the schema (schema → executable graph).
- **Genesis** is a natural-language *producer* of the schema.

If a behavior isn't expressible in the schema, it doesn't exist. This is the
central design decision that keeps the visual editor, the AI generator, and the
Python runtime in agreement.

---

## The canonical schema is the source of truth

The schema lives in [`packages/schema`](../packages/schema):

- `src/types.ts` — TypeScript types (`ProgramSchema`, `Node`, `Edge`, `Trigger`, …).
- `src/validators.ts` — Zod validators (`ProgramSchemaZ` and friends).
- `src/index.ts` — public exports (`@flowos/schema`).

A `ProgramSchema` is a self-contained description of a program:

```ts
interface ProgramSchema {
  version: "1.0";
  program_id: string;
  program_name: string;
  program_type?: "workflow" | "agent";
  execution_mode: "autonomous" | "approval_required" | "supervised";
  nodes: Node[];
  edges: Edge[];
  triggers: Trigger[];
  version_history: VersionSnapshot[];
  metadata: ProgramMetadata;
}
```

### Programs: workflows vs. agents

Both run on the same graph engine, but the `program_type` discriminates two
product surfaces:

- **`workflow`** — a classic repeating automation. Has triggers, runs many times.
- **`agent`** — a one-time, plan-then-run task. No triggers, runs once. Only
  agent programs may contain `agent_task` nodes (bounded autonomous tool-loops),
  so a workflow can never smuggle in unbounded autonomous behavior.

### Node types

| Node | Purpose |
| --- | --- |
| `trigger` | Entry point: cron, event, webhook, manual, program-output, file-watch |
| `connection` | Executes a connector operation (OAuth / HTTP / file) |
| `agent` | An LLM call with a system prompt, tools, and optional approval |
| `agent_task` | Bounded autonomous tool-loop (agent programs only, `max_iterations` 1–25) |
| `step` | Deterministic logic: transform, filter, branch, delay, loop, format, parse, deduplicate, sort |
| `note` | Visual annotation, never executed |
| `group` | Frame/container, never executed |

Edges carry `data_flow`, `control_flow`, or `event_subscription` semantics, plus
optional `data_mapping` (field renaming) and a `condition`.

### Why this matters

Because the schema fully specifies the program, the same document round-trips
through every subsystem without lossy re-interpretation. Node explainability
metadata (`genesis_reasoning`) and AI-Act compliance fields (`ai_act_risk_level`,
`human_oversight_required`, …) travel *with* the schema, so governance is not a
side channel.

---

## React Flow = editor translation layer

The visual editor (in `apps/web`) renders a `ProgramSchema` as a React Flow
graph and translates user gestures back into schema mutations:

```
ProgramSchema.nodes  ⇆  React Flow nodes   (position, label, config)
ProgramSchema.edges  ⇆  React Flow edges   (source/target, data_mapping)
```

The editor never invents state the schema can't hold. Node positions, group
frames, and note dimensions are all persisted schema fields (`position`,
`GroupConfig`, `NoteConfig.width/height`), so reopening a program restores the
exact canvas.

Every edit is validated against `ProgramSchemaZ` (strict) or a looser
"draft" validator before it can be saved or run. Invalid drafts are allowed to
exist (so you can save work-in-progress) but are blocked at run time.

---

## LangGraph = runtime translation layer

The Python runtime ([`apps/runtime`](../apps/runtime)) is a FastAPI service. Its
`engine/executor.py` translates a validated `ProgramSchema` into a LangGraph
`StateGraph` and executes it:

```
ProgramSchema  →  StateGraph  →  per-node execution  →  run state
```

Each node type maps to an execution handler:

- `connection` → resolves credentials server-side, calls `connectors.get_connector(provider).execute(operation, params, access_token)`, merges the returned dict into run state.
- `agent` / `agent_task` → builds provider tools (`engine/agent_tools.py`), runs the LLM loop with approval gates.
- `step` → deterministic transforms evaluated with a **safe expression** sandbox (`engine/safe_expressions.py`) — no arbitrary code execution.

The runtime layers in production concerns the schema doesn't need to know about:
retries (`engine/retry.py`), circuit breakers, dead-letter queues, checkpointing,
run limits, PII redaction, and OpenTelemetry tracing. Downstream nodes read the
merged output of upstream nodes via `{{node_id.field}}` expressions.

Credentials are always resolved inside the runtime from Vault/token helpers using
the internal service secret — the web app sends **connection references**, never
raw tokens.

---

## The roundtrip invariant

> **A schema that leaves the editor, executes in the runtime, and is loaded back
> into the editor must describe the same program at every hop.**

This is the invariant that holds the system together:

```
Editor ──serialize──▶ ProgramSchema ──validate──▶ Runtime
  ▲                                                    │
  └────────────── same ProgramSchema ◀─────────────────┘
```

Consequences of the invariant:

1. **No hidden state.** The editor cannot rely on data that isn't in the schema;
   the runtime cannot depend on behavior that isn't expressible in the schema.
2. **Genesis output is just a schema.** AI generation and human editing produce
   the *same* artifact, so a Genesis program and a hand-built program are
   indistinguishable to the runtime.
3. **Schema changes are contract changes.** Adding a node type, config field,
   trigger, or connector operation means updating, in lockstep: the types
   (`packages/schema`), the Zod validators, the editor rendering, the runtime
   handler, and — for connector operations — the Genesis prompt
   (`apps/web/lib/genesis/prompt.ts`). Keep schema translations tested.

---

## Monorepo structure

Managed with **pnpm workspaces + Turborepo** (`turbo.json`, `pnpm-workspace.yaml`).

```
corelyx/
├── apps/
│   ├── web/                 # Next.js 15 App Router
│   │   ├── app/api/         # API routes (programs, genesis, runs, connections, webhooks, …)
│   │   └── lib/genesis/     # Genesis: prompt building, parsing, repair, introspection
│   └── runtime/             # Python FastAPI + LangGraph
│       ├── engine/          # executor, retry, tracing, safe_expressions, …
│       └── connectors/      # 210+ native connectors + registry
├── packages/
│   ├── schema/              # @flowos/schema — canonical types + Zod validators
│   └── db/                  # @flowos/db — Supabase client + generated DB types
├── supabase/migrations/     # Postgres schema, RLS, policies, RPC
└── docs/                    # you are here
```

| Package | Scope | Role |
| --- | --- | --- |
| `apps/web` | `@flowos/web` | UI, API routes, OAuth, billing, triggers, admin |
| `apps/runtime` | — | Workflow execution (Python) |
| `packages/schema` | `@flowos/schema` | The contract: types + validators |
| `packages/db` | `@flowos/db` | Supabase clients + generated types |

---

## Data flow: user → Genesis → schema → editor → validation → runtime

```
 ┌────────┐   NL prompt    ┌──────────┐   ProgramSchema   ┌──────────────┐
 │  User  │ ─────────────▶ │ Genesis  │ ────────────────▶ │  Validation  │
 └────────┘                │ (LLM)    │                   │ (Zod, draft) │
     ▲                     └──────────┘                   └──────┬───────┘
     │                                                           │ valid
     │  canvas edits / AI Edit                                   ▼
     │                                                    ┌──────────────┐
     └──────────────────────────────────────────────────▶│ React Flow   │
                                                          │   Editor     │
                                                          └──────┬───────┘
                                            POST /api/runs  │ (re-validate,
                                                            ▼  pre-flight, compliance)
                                                    ┌──────────────┐
                                                    │   Runtime    │  → StateGraph
                                                    │  /execute    │  → node execution
                                                    └──────┬───────┘  → callbacks to web
                                                           ▼
                                                    runs + node_executions
```

Step by step:

1. **User → Genesis.** A natural-language description (plus selected connections)
   hits `POST /api/genesis`. An EU-compliance pre-filter runs first; PII is
   pseudonymized so only placeholders reach the model.
2. **Genesis → schema.** The model returns a `ProgramSchema`. A three-layer
   parser (extract → `jsonrepair` → repair-prompt) and deterministic/semantic
   repair passes heal common model deviations.
3. **Schema → editor.** The schema is normalized, validated, saved (with a
   version snapshot), and rendered on the React Flow canvas.
4. **Editor → validation.** Every human or AI edit is re-validated against
   `ProgramSchemaZ`. Drafts can be saved; only runnable schemas dispatch.
5. **Validation → runtime.** `POST /api/runs` re-validates, runs pre-flight and
   compliance checks, creates a `runs` row, and dispatches the schema to the
   runtime `/execute` endpoint using the internal service secret.
6. **Runtime.** The executor builds a LangGraph `StateGraph`, resolves
   credentials server-side, executes nodes, and writes `runs` /
   `node_executions` progress back to the database.

See the [API Reference](./api-reference.md) for the exact request/response
contracts at each hop.
