# One-Click Relay.app Import — Plan

*Drafted 2026-07-17. Research: Relay's official wind-down docs + Corelyx codebase survey.*

---

## ✅ BUILT 2026-07-17 (Phase 1 + 2, no-coop version)

The importer is implemented end-to-end and lands on `main` after review. It assumes **zero Relay cooperation** — it works entirely off the self-serve export zip.

**New code:**
- `apps/web/lib/migrate/relay/mapping.ts` — Relay→Corelyx app/trigger/step table (client-safe). 203 connector slugs, explicit aliases (Kit→convertkit, Quo→openphone, Google Sheets→sheets…), AI providers→agent, known gaps with suggestions. Seed of the future deterministic parser.
- `apps/web/lib/migrate/relay/extract.ts` — defensive, never-throws walker of an unknown Relay workflow JSON → name, step count, detected apps + coverage, trigger types, connector providers. Runs in the browser for the preview.
- `apps/web/lib/migrate/relay/prompt.ts` — Genesis-system-prompt addendum (the concept map + migration rules) + conversion user message + one-shot repair message. Prunes bulky JSON (`capJsonForPrompt`) so it never blows context — this is what dodges the 2,000-char Genesis `description` cap.
- `apps/web/lib/migrate/relay/finalize.ts` — model text → validated `ProgramSchema` (extractJson → normalizeSchema → normalizeProgramDraft → prune → validate). **Always forces `is_active:false`** + tags `relay-migration`. Model-independent, so unit-tested against canned outputs.
- `apps/web/app/api/migrate/relay/route.ts` — one workflow per call. Auth + workspace + program-limit + rate-limit, PII pseudonymize/rehydrate, platform-key LLM call via `createRepairModelCaller` (OpenRouter, `RELAY_MIGRATE_MODEL` env override), one self-repair round, insert program/membership/connections/versions + trigger sync. **Does NOT consume `genesis_uses`** (loss-leader). Records LLM usage for cost tracking. Returns validation + `missing_connection_names` + coverage + manual-note count.
- `apps/web/app/(app)/migrate/relay/page.tsx` — the wizard. Client-side unzip (jszip, dynamic import); **only workflow definitions + build prompts are read — run history / run JSONs / Tables CSVs never leave the browser** (run-file heuristics skip them). Intake (zip drop OR paste one workflow) → multi-select preview with covered/gap chips → batch import (concurrency 2, plan-limit-aware) → report with an **aggregated reconnect checklist** (dedup across all workflows) + gap/manual-note summary + per-workflow Open links.
- Entry points: `/programs/new` ("From Relay.app" button), `/programs/import` (banner), and the compare page (`lib/seo/content.ts` — FAQ/table/steps flipped from "no one-click import" to the real importer + internal link).
- Tests: `lib/migrate/relay/__tests__/{mapping,extract,prompt,finalize}.test.ts` (49 tests). Type-check + lint + web suite green.

**Two-path conversion:** prompt-first with the JSON as grounding — the model does the interpreting, exactly as Relay tells its own users to. The mapping table both feeds the prompt AND powers the preview; as real samples arrive, extend it toward the deterministic parser (Step 2 of the no-coop playbook below).

**Deliberately deferred (business decisions, not code):**
- **Metering** — conversions don't cost the user a Genesis use. If abused, add a soft per-workspace cap.
- **Plan caps** — a free user still hits the 2-program wall; the wizard marks the overflow "skipped — plan limit" with an upgrade nudge rather than failing the batch. The "30-day Team trial for migrants" idea (decision #2 below) is NOT built — it needs a billing change.
- **Sample calibration** — still need 2–3 real export zips to tune the zip folder/run-file heuristics and conversion quality. Until then the parser is defensive and the preview shows exactly what it detected so the user can deselect wrong guesses.

**Config:** `RELAY_MIGRATE_MODEL` (default `openai/gpt-oss-120b`) swaps the conversion model once samples tell us which tier converts reliably.

---

## No-cooperation playbook (if Relay never helps)

The export is self-serve, so cooperation only buys a cleaner feed — never access. And because Relay is **frozen/dying, its JSON format will never change again** (reverse-engineering a fixed target, not a moving one). Steps:

1. **Get real samples — the actual bottleneck.** We can't mint a Relay account (signups closed). Source zips from users: post in Relay's Slack/Discord/subreddit + to anyone who inquired — "we'll migrate you free + [RELAY code], send your export." One zip unlocks parser work; 3–5 across app mixes gets reliable. Never ask for Relay logins.
2. **Reverse-engineer JSON → deterministic parser.** From samples, learn the app/action identifier scheme; grow `mapping.ts` into a static Relay-id → provider+operation table. Structure (triggers, order, branching, cron) parses deterministically; this is the "without prompts" win — recovered ourselves, no Relay needed.
3. **Hybrid converter.** Deterministic where mapped; LLM only for the residue (unmapped apps, custom JS, freeform expressions). As the table grows the LLM share shrinks. Unmapped → labelled note nodes, never silent drops. *(Today's build is the LLM half; the deterministic half grows in as samples arrive.)*
4. **Build on existing rails.** ✅ done — `/api/migrate/relay` + normalize + name-based connection matching.
5. **OAuth reconnection is the one irreducible manual step** (Relay deletes tokens regardless). ✅ the report's dedup'd reconnect checklist makes it one pass.
6. **Concierge lane for whales, today, zero new code.** "Email us your zip, we'll rebuild it live on a call." Works this week, doubles as sample collection + highest-trust sales motion.

## The opportunity

Relay's shutdown offboarding hands **every user a machine-readable copy of their entire workspace**. From
[their export docs](https://docs.relay.app/workspace-and-account/export-your-relay.app-data.md), a user clicks
*Export workspace data* once and gets a .zip containing, **per workflow**:

- `prompt.md` — a build prompt Relay generates specifically so the workflow can be rebuilt in another tool
- a JSON file with the exact structure of the workflow
- run history (CSV + one JSON per run), Tables as CSV

Individual workflows can also be exported one at a time (overflow menu → *Export workflow* / *Copy build prompt*).

Relay's own advice to users: *paste the prompt into Zapier, n8n, or Make* — i.e. rebuild manually, one workflow at
a time. **Nobody has shipped a native Relay importer** (checked 2026-07-17; the migration-tool ecosystem —
migromat, convert2n8n, etc. — is entirely Zapier/Make→n8n). The claimable position:

> **The only tool where the zip Relay gave you just works.** Drop it in, get your workspace back.

Urgency is real and on our side: free accounts + data are **permanently deleted Aug 15**, paid Sep 14. "Import
now, decide later" is honest advice.

## Why it's cheap for us: the backend mostly exists

| Piece | Status |
|---|---|
| JSON → draft program (`/api/programs/import`) | **Shipped.** Normalize → validate → insert, `program_versions` v0, name-based connection matching, returns `missing_connection_names`. UI at `/programs/import`. |
| Foreign-name normalization (`lib/workflow/normalize.ts`) | **Shipped.** Alias maps: `action/api/connector→connection`, `llm/model→agent`, `scheduled/timer→cron`, etc. |
| AI generation from a text description (Genesis) | **Shipped.** `/api/genesis/stream`; refinement mode already accepts an existing schema + edit instruction (reusable as a self-repair pass). |
| Draft-tolerant persistence | **Shipped.** `ProgramDraftSchemaZ` saves incomplete configs; `is_active:false`; ERR_007 marks unconnected nodes without blocking save. |
| Post-generation validation | **Shipped.** `validatePostGenesis` (ERR_001–013, WARN_001–005 incl. the new output_schema warning). |
| Connector surface | **Shipped.** 203 runtime connectors — covers ~75–80% of the apps Relay documents (Gmail, Slack, Notion, Sheets, HubSpot, Salesforce, Airtable, Coda, Discord, Telegram, Outlook, OneDrive, QuickBooks, OpenPhone, Kit/ConvertKit, WordPress, X, Zoom…). |
| Free-uses mechanics | **Shipped.** `genesis_uses` counter + RELAY bonus-code type (migration 20260717120000) + sidebar redeem UI. |
| **Relay format → Corelyx schema conversion** | **Missing — the core new work.** |
| **Migration wizard UI (zip intake, progress, report)** | **Missing.** |

## Architecture

### Conversion strategy: prompt-first, JSON-grounded

We have never seen a real `workflow.json` (signups are closed; we can't mint a test account), and Relay itself
says the JSON "won't work through native importers" without AI interpretation. So **don't build a deterministic
JSON→schema translator**. Instead, per workflow, feed Genesis-style generation:

- **System preamble**: Relay→Corelyx concept map (below) + the connector-operation catalog Genesis already uses.
- **User content**: the `prompt.md` build prompt (primary, it's written for exactly this) + the raw workflow JSON
  (pruned/size-capped) as structural grounding — step order, exact field references, cron expressions.
- **Output**: a `ProgramSchema` draft → `normalizeProgramDraft` → `validatePostGenesis` → **one self-repair round**
  via the existing refinement machinery if blocking errors remain (ignoring ERR_007, which is expected
  pre-connection) → save as inactive draft through the same internals as `/api/programs/import`.

Either input alone also works (prompt-only or JSON-only), so single-workflow "Copy build prompt → paste" is a
degenerate case of the same pipeline.

### New route: `POST /api/migrate/relay`

Do **not** funnel through the public `/api/genesis/stream` — its `description` is capped at 2,000 chars (real
build prompts + JSON will blow past it) and SSE-per-workflow doesn't fit batch. A dedicated route accepts
`{ workflows: [{ name, prompt_md?, workflow_json? }] }` (validated, size-capped ~200KB/workflow, ≤50/batch),
meters uses, queues conversions at small concurrency, and reports per-workflow status (poll or SSE).

### Zip handling: client-side, privacy-first

Unzip **in the browser** (JSZip). Extract only the build prompt + workflow JSON per folder; **run history, run
JSONs, and Tables CSVs never leave the user's machine** (they contain their customers' PII — this is a
marketable privacy stance, and it dodges upload limits since run data dominates zip size). Folder discovery is
heuristic (the .md file + the .json that looks like a workflow definition, not a run record) — calibrate against
real exports, fail soft by listing unrecognized folders.

### The wizard: `/migrate/relay`

1. **Landing** (public): three steps illustrated — *Export in Relay → Drop the zip here → Reconnect your apps.*
   Explains what happens to their data (definitions only, run data stays local). CTA → sign in.
2. **Drop + preview**: parse zip, show a card per workflow (name, step count, detected apps with
   covered/uncovered badges). User selects which to import (respects plan caps). "Import N workflows" ← *the* click.
3. **Progress**: per-workflow convert → validate → created-as-draft states.
4. **Report**: N imported clean / M with warnings / K steps flagged; **aggregated "Connect your apps"
   checklist** (dedup of `missing_connection_names` across all workflows — one Gmail OAuth fixes 8 workflows at
   once); per-workflow deep links into the editor; plan-gate notes (see decisions).

### Relay → Corelyx concept map (system preamble content)

| Relay | Corelyx | Notes |
|---|---|---|
| Scheduled trigger | `cron` trigger | expression + timezone (tz display already fixed) |
| Webhook trigger | `webhook` trigger | Solo+ |
| Manual trigger | `manual` trigger | |
| Mailhook / app event triggers | `event` trigger | **Team+** — see decision #2 |
| RSS trigger | cron + HTTP fetch pattern | flag in report |
| App action steps | `connection` node (`provider` + `operation` + `operation_params`) | 203 connectors |
| AI steps / agentic tool use | `agent` node | output_schema/input_schema now enforced |
| Paths | `step` logic_type `branch` | |
| Iterators | `step` logic_type `loop` | |
| Wait steps | `step` logic_type `delay` | |
| Transform / data ops | `step` transform/format/parse/filter/sort/deduplicate | |
| Human-in-the-loop | `execution_mode: approval_required` / HITL approvals | |
| Custom HTTP | `connection` node, `connector_type: http` | full parity |
| Custom JS | **gap** — nearest: transform step or HTTP | flag honestly in report |
| Tables | **gap** — suggest Sheets/Airtable/Notion equivalent | flag |
| Sequences | `program_output` trigger chains | Team+ |
| MCP servers | **skip v1** | note in report |

Unmapped/uncertain steps become clearly-labeled `note` nodes ("Relay step X — needs manual attention") rather
than silently dropping or failing the whole workflow.

### Cost & metering

Conversion runs on the platform key via OpenRouter. At gpt-oss-120b pricing, a workflow (~10–30k tokens in,
3–8k out) costs **~$0.01; even a 30-workflow workspace is ~$0.30.** Quality matters more than cost here —
evaluate mid-tier (gpt-4o-mini / haiku) on real exports and pin whichever converts reliably; it's platform-paid
either way.

## Phases

**Phase 0 — unblock today's story (hours).** The compare page already tells Relay users to paste their build
prompt into Genesis — but the 2,000-char `description` cap likely rejects real build prompts. Raise/route around
it for migration input. Update the compare-page FAQ that currently answers "There's no one-click Relay import
today."

**Phase 1 — single-workflow import (~2–3 days).** `/migrate/relay` wizard accepting paste-a-prompt and/or
upload-one-JSON. New conversion route with the Relay preamble, self-repair pass, existing import internals.
Report card with connect-checklist. This alone beats every competitor's story.

**Phase 2 — the zip, i.e. the actual one click (~3–5 days).** Client-side unzip, multi-select preview, batch
queue + progress, workspace-level report, RELAY-code/allowance integration, compare-page + landing CTA update
("Drop your Relay export. Get your workspace back."). Optional email capture before processing for follow-up.

**Phase 3 — polish (opportunistic).** Template-link import (Relay template pages are public); use an exported
**run JSON as a test payload** to dry-run the imported workflow against real data (killer validation feature);
Sequences → program-trigger chains; Tables migration assist; concierge lane for Team-size workspaces ("email us
the zip, we'll do it live on a call").

## Founder decisions needed

1. **Metering:** conversions cost us ~$0.01 each. Recommend **not** charging genesis_uses for zip imports at all
   (loss-leader; the RELAY code then just covers post-migration Genesis edits) — alternative is auto-granting the
   RELAY bonus when a zip lands. Charging normal uses (free=3) walls a 20-workflow migrant at workflow 3.
2. **Plan caps vs. migration reality:** free tier = 2 programs, manual+cron only; Solo = 5. A typical Relay
   workspace blows through both, and mailhook/event workflows need Team. Recommend a **"migrant offer": 30-day
   Team trial on zip import** (mirrors Relay's own goodwill gesture of bonus credits during wind-down). Without
   this, the wizard must down-scope imports and the wow moment dies at a paywall.
3. **Sample exports:** we can't create a Relay account (signups closed). We need 2–3 real export zips to
   calibrate folder parsing and conversion quality — source from migrating users (offer the RELAY code as
   thanks), or your own network. Until then, defensive parsing + prompt-first design de-risks the unknown format.

## Risks

- **Unknown JSON format** → mitigated by prompt-first design; JSON is grounding, not a parsed contract.
- **Conversion quality on complex workflows** → always land as inactive drafts, never auto-activate; self-repair
  round; validation warnings surfaced per node; telemetry on % clean imports.
- **Prompt injection via uploaded files** → conversion output is schema-validated and inert until the user
  reviews/activates; size caps; no tool execution during conversion.
- **Claim drift** — "the only native Relay importer" is true today; re-verify at launch and phrase as "import
  your whole workspace in one click" if a competitor ships one.
