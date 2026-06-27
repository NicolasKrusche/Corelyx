# Inbox acceptance test plan (Thunderbird connector)

End-to-end acceptance test for the agent platform against a **real firm's inbox**,
connected via the **Thunderbird** generic IMAP/SMTP connector. Covers: triage
agents, the critical-email safety net, web tools + EU gating, multi-agent
relations, knowledge/RAG, guardrails, and notifications.

> Tick each box as you go. Anything that fails → file an issue with the phase
> number, expected vs actual, and where you looked (UI / DB row / runtime log /
> received email).

---

## ⚠️ Guardrails for testing on a real inbox

- [ ] Use a **dedicated test mailbox or a single test folder**, not the firm's
      live production inbox, for any *write/destructive* phase. Agents can send,
      label, archive, and trash real mail.
- [ ] Obtain **written scope** from the firm (what the agent may read/send/delete).
- [ ] Start every agent **read-only** (Permissions → Read-only); widen deliberately.
- [ ] Treat the destructive-op approval gate and the safety net as nets, not a
      substitute for a test mailbox.

---

## Phase 0 — Prerequisites (blockers)

- [ ] **0.1** Apply migrations `20260621120000_agent_relations`,
      `20260621140000_agent_flags`; confirm `agent_knowledge` v1/v2 are applied.
      *(Without these: Flow edges, the Flagged inbox, and RAG degrade to empty.)*
- [ ] **0.2** Restart the runtime (loads `executor.py`, `compliance.py`,
      `agent_tools.py`, `critical_signals.py`).
- [ ] **0.3** Env set: `RESEND_API_KEY` (alert email), `TAVILY_API_KEY` or
      `BRAVE_API_KEY` (web_search), `OPENAI_API_KEY` (embeddings), and
      `INTERNAL_SERVICE_AUTH_SECRET_NEXT_AGENT_TOOLS` matched on runtime + web.
- [ ] **0.4** Test user `security_alerts` notification pref ON; maintenance lifted
      (or admin/bypass) so `/agents` is reachable.
- [ ] **0.5** Thunderbird connector scope/param metadata present
      (`pnpm --filter @flowos/web test catalog` green). ✅ *fixed*
- [ ] **0.6** Firm inbox connected via Thunderbird (IMAP/SMTP credential blob);
      `list_connections` shows it `is_valid`.

---

## Phase 1 — Connector smoke

- [ ] **1.1** `call_connector` read (list/get messages) in **dry-run** → returns
      real data (reads run in dry-run).
- [ ] **1.2** `call_connector` `send_email` in **dry-run** → `simulated: true`,
      nothing sent. Then **live** → email arrives.
- [ ] **1.3** Confirm: reads run in dry-run; writes simulated in dry-run, executed live.

## Phase 2 — Triage agent (core path)

- [ ] **2.1** New agent "Inbox triage", **read-only**: *"Read the latest 20
      messages, label and prioritise, summarise what needs a same-day reply."*
- [ ] **2.2** Dry-run → a report, **no writes**.
- [ ] **2.3** Switch to **Can make changes**, run live → labels applied; report produced.
- [ ] **2.4** Confirm every run produced a user report (runtime-enforced).

## Phase 3 — Critical-email safety net (test hard)

Seed the test mailbox with:
- **(a)** Clear critical: *"Before I quit I poisoned some of the food cans in the warehouse."*
- **(b)** Benign look-alike: *"URGENT: invoice overdue, please action."*
- **(c)** Subtle threat with no trigger words.

Run a triage agent that would normally archive/spam, then verify:

- [ ] **3.1** (a) appears in **Flagged for review** (origin `Auto-screen`),
      correct category (e.g. `contamination`).
- [ ] **3.2** (a) triggers a **security-alert email** to the test user.
- [ ] **3.3** Agent's attempt to trash/archive/spam (a) is **refused**.
- [ ] **3.4** (b) is **not** flagged (false-positive check).
- [ ] **3.5** (c) is likely **missed** — documents the known recall gap.
- [ ] **3.6** Explicit escalation: prompt an agent to flag → inbox row
      (origin `Agent`) + email.
- [ ] **3.7** Resolve: **Keep & review** / **Dismiss** removes the item;
      `agent_flags.status` updates.
- [ ] **3.8** DB `agent_flags` rows have correct origin / categories / snippet / source_ref.

## Phase 4 — Web tools + EU gating

- [ ] **4.1** `web_search` (key set): *"Find our top 3 competitors and their
      pricing pages"* → urls → `web_fetch` reads them → report.
- [ ] **4.2** No key → clear "web search isn't configured" message.
- [ ] **4.3** Set test workspace `compliance_mode = eu_only` → `web_search` **and**
      `web_fetch` refused with the EU message.
- [ ] **4.4** Set back to `standard` → both work.

## Phase 5 — Multi-agent relations

- [ ] **5.1** `spawn_agent`: child created as a **draft in Needs-you** with a
      "Spawned" chip; does **not** auto-run; `spawns` edge in **Flow**.
- [ ] **5.2** Set `allow_spawning` off / `max_spawns 1` (Permissions) → further
      spawns refused.
- [ ] **5.3** `reference_agent` → cross-check edge + peer report excerpt.
- [ ] **5.4** `read_agent_report` works only for spawned/parent/lineage agents;
      draws a `feeds` edge.
- [ ] **5.5** Flow view: real clusters render all four edge types; hover = blast
      radius; a failed node greys its downstream.

## Phase 6 — Knowledge / RAG

- [ ] **6.1** Add firm docs (brand voice, policies); link them on the canvas.
- [ ] **6.2** An agent's `search_knowledge` uses them and pulls one-hop linked docs.
- [ ] **6.3** `reads_source` edges to those docs appear in Flow.

## Phase 7 — Guardrails & permissions

- [ ] **7.1** Read-only agent: write / connector-write refused.
- [ ] **7.2** Spend cap (`max_cost_usd`) stops a run at the cap.
- [ ] **7.3** Tool-call budget (100/run) enforced.
- [ ] **7.4** Destructive op (trash/delete) → approval gate.
- [ ] **7.5** Audit export (`/api/agents/[id]/audit`) downloads tool calls with
      **no args stored**.

## Phase 8 — Notifications

- [ ] **8.1** Agent-question email, report email, and security-alert (flag) email
      all send and respect the per-type preferences.

## Phase 9 — Board / Flow UI

- [ ] **9.1** Board columns (Needs you / Failed / Running / Completed + Drafts).
- [ ] **9.2** Flagged banner + header badges; Board⇄Flow toggle persists.

---

## Cleanup / rollback

- [ ] Un-label and restore any archived/trashed test messages.
- [ ] Delete test agents; resolve leftover flags.
- [ ] Set the test workspace `compliance_mode` back to `standard`.

---

## Known limitations to note while testing

- The auto-screen runs on **every connector read** and is **keyword-based**:
  high recall, but expect occasional false positives (by design) and possible
  misses on cleverly-worded threats with no trigger words. The planned upgrade is
  an LLM screen on borderline reads.
- `web_search` costs **1 Tavily credit per call** (free tier ≈ 1,000/month,
  shared across the deployment). There is no per-run search cap yet.
- Spawned children are **drafts requiring approval** — they never auto-run.
