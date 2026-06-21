# Corelyx — Brand & Product Descriptor

Use this file when generating marketing copy, landing page sections, social posts, email campaigns, ad creative, or any other external-facing content about Corelyx. It defines what the product is, who it's for, how it should sound, and how it should look.

---

## What Corelyx Is

Corelyx is a **visual AI workflow automation platform** built for teams that operate in regulated environments — primarily the EU. Users describe what they want to automate in plain language, and Corelyx's AI (Genesis) designs the workflow graph. The user reviews and edits it visually, then runs it. Every run is traceable.

The one-line pitch: **"Describe what you want to automate. Corelyx designs the agent graph, you tune it visually — then it runs itself."**

It is NOT a general no-code tool like Zapier or Make. The differentiator is the combination of AI-first workflow generation + compliance evidence infrastructure (EU-first controls, EU-only mode for eligible workflows, human-in-the-loop approvals, processing records) — things that Zapier and n8n treat as afterthoughts.

---

## Who It's For

**Primary:** Operations, RevOps, and data teams at EU-based companies (or EU-serving companies) who need to automate processes across SaaS tools without writing code — but who work in environments where data handling is audited or regulated.

**Secondary:** Individual power users and solo founders who want serious workflow automation without paying for an enterprise platform.

**Not for:** Developers who want a pure code-based orchestration engine. Technical depth is available but the product is designed for operators, not engineers.

**Buyer concerns they arrive with:**
- "Will this store our customer data outside the EU?"
- "Can we prove what happened if a workflow fires incorrectly?"
- "Can a human approve an action before it goes to a customer?"
- "Does procurement need to sign off on your data processing terms?"

Corelyx is designed to answer all of these with yes.

---

## Positioning

| Axis | Corelyx | Zapier | n8n | Make |
|---|---|---|---|---|
| AI workflow generation | Native (Genesis) | None | None | None |
| GDPR compliance posture | Architectural | Bolt-on | Self-hosted only | Bolt-on |
| Human approval gates | Built-in | Not available | Limited | Not available |
| Data residency | EU infrastructure | US-first | DIY | US-first |
| Visual editor | Yes | Basic | Yes | Yes |
| Pricing | From €0 | From $0 | From $0 (self-hosted) | From $0 |

**Single sharpest differentiator:** You can build a workflow using AI, inspect it visually, require human approval at sensitive steps, and produce GDPR Art. 30 processing records — all without leaving the product.

---

## Core Value Propositions

### 1. AI builds the first draft
Genesis takes a plain-language description and generates a validated workflow graph — triggers, branches, connector calls, approval gates. You don't start from a blank canvas. You start from something that mostly works, and edit from there.

### 2. You see exactly what will run
The workflow lives as a visual node graph that is directly tied to the executable schema. What you see is what runs. There's no hidden logic, no YAML behind the scenes that contradicts the diagram.

### 3. Humans stay in the loop where it matters
Approval gates are a first-class feature, not a premium add-on. Before customer data changes, messages are sent, or external systems are updated, a human can be required to review and confirm.

### 4. Compliance is structural, not a checkbox
- EU infrastructure (Austrian + Frankfurt)
- OAuth tokens and API keys never reach the browser — resolved server-side
- Processing records generated per run (GDPR Art. 30)
- DPA, DPIA template, subprocessor registry available without a sales call
- EU AI Act human oversight model baked into the approval gate system

### 5. Full audit trail
Every run records node status, outputs, failures, approvals, and connector outcomes. You can answer "what happened in run #482 and why" without digging through logs.

---

## Tone of Voice

**Direct, precise, never corporate.** Corelyx copy reads like it was written by a senior engineer who also understands operations. It respects the reader's intelligence and doesn't waste words.

**Do:**
- Lead with the outcome, not the feature ("your customer data won't leave the EU" not "EU data residency compliance")
- Use concrete specifics ("500 runs / month", "GDPR Art. 30 records", "Austrian and Frankfurt infrastructure")
- Short sentences. Paragraph breaks are free.
- Acknowledge tradeoffs honestly ("Free while you're testing. You'll hit the limits fast.")
- Use em dashes and precise punctuation — they signal confidence.

**Don't:**
- "Powerful", "seamless", "robust", "game-changing", "unlock", "leverage"
- Passive voice
- Hype without substance ("the future of work")
- Saying "AI-powered" without explaining what the AI actually does
- Long feature lists without connecting them to a user outcome
- Calling it a "platform" in the first sentence — lead with what it does, not what category it is

---

## Visual Identity

### Aesthetic
Dark, premium, operational. Inspired by liquid marble — deep blacks with organic colored light beneath glass surfaces. Subtle motion. The product feels alive in a calm way, not an anxious way.

### Colors
- **Background:** Near-black coal (`#171717` / `hsl(0 0% 9%)`)
- **Primary accent (app):** Blue (`hsl(210 90% 55%)`)
- **Primary accent (landing/auth):** Orange (`hsl(22 95% 52%)`)
- **Ambient glow:** Orange top-right, blue bottom-left, violet center — these drift slowly behind glass surfaces
- **Text:** Near-white (`hsl(0 0% 95%)`) on dark, dark slate on light

### Glassmorphism
All card and panel surfaces use `backdrop-filter: blur()` with semi-transparent white backgrounds. The animated orbs behind them create color depth that bleeds through the glass. This is the defining UI signature.

### Marble texture
A subtle SVG turbulence filter overlay at ~9% opacity, most visible in the hero area of each page and fading toward the bottom. Inspired by dark liquid marble.

### Typography
Inter. No custom type. The weight hierarchy does the work — bold heavy headings, medium body, tiny muted labels.

### Logo
Square with rounded corners, solid primary color fill. Simple. The name "Corelyx" does most of the brand work.

### Landing vs App
- **Landing/auth:** Light background, orange accent, clean editorial layout
- **App:** Dark glass, blue accent, operational density

---

## Key Features (Marketing Language)

**Genesis AI**
Describe your workflow in plain language. Genesis turns it into a validated graph with the right trigger, connectors, branches, and approval points. Edit it visually, then run it. Takes seconds, not hours.

**Visual node editor**
Every workflow is a graph you can inspect, rearrange, and understand before it runs. The visual layout is tied to the executable schema — not a diagram that diverges from what actually happens.

**Human-in-the-loop approvals**
Add approval gates anywhere in a workflow. Before a customer record is changed, a message is sent, or an external system is updated — a human can review and approve or reject the action.

**200+ connectors**
Gmail, Slack, Notion, GitHub, Google Sheets, Airtable, HubSpot, Asana, Outlook, Typeform, Google Docs, Google Drive, and more. OAuth and API key credentials are managed server-side and never exposed to the browser.

**Run history and audit trail**
Every execution records node-level status, outputs, connector calls, approvals, and failures. Searchable, filterable, and structured enough to use as compliance evidence. 

**GDPR compliance infrastructure**
Processing records per run, Data Processing Agreement (DPA) available on the product, DPIA template, subprocessor registry, data export schema — all accessible without a sales cycle.  
 
**Triggers**
Manual runs, cron schedules, webhook events, and external API calls. Workflows can respond to events from any connected system.

**BYOK (Bring Your Own Key)**
On paid plans, use your own OpenAI, Anthropic, or other API keys so LLM costs go to your account. Or use platform AI credits for a no-setup option.

---

## Pricing Summary

| Plan | Price | Who it's for |
|---|---|---|
| Free | €0 | Testing and evaluation. Hard limits: 2 programs, 50 runs/month |
| Solo | €9.90/mo (€6.90 billed annually) | Individuals. 5 programs, 75 runs/month, BYOK |
| Team | €19.90/mo (€15.90 billed annually) | Production teams. Unlimited programs, 3 seats, approvals, 500 runs/month |
| Scale | €49.90/mo (€39.90 billed annually) | Scaling teams. Higher limits, more seats, extended history |

All plans include all connectors. Pricing is in EUR, invoiced by an EU entity.

---

## URL and Brand Assets

- **Product:** [corelyx.app](https://corelyx.app)
- **Tagline (short):** Visual AI Automation
- **Tagline (long):** Describe what you want to automate. Corelyx designs the agent graph, you tune it visually — then it runs itself.
- **Social handle:** @corelyx
- **OG image:** `/pictures/og-image.png` (1200×630)
- **Logo (no background):** `/pictures/logo-no-bg.png`

---

## What to Emphasise by Audience

**For EU operations/compliance teams:**
EU-first automation infrastructure, EU-only mode for eligible workflows, human approval gates, processing records, DPA and subprocessor transparency. The message is: Corelyx gives teams evidence and controls, while final compliance still depends on the use case, configuration, providers, and customer role.

**For RevOps / growth teams:**
Speed of setup (Genesis generates the first workflow in seconds), breadth of connectors (HubSpot, Sheets, Gmail, Slack), approval gates for sensitive customer actions.

**For solo users and founders:**
Genesis AI removes the blank canvas problem. Free plan to start. Cheap paid plans that pay for themselves after one saved hour per month.

**For procurement / IT:**
DPA available without a sales call. Subprocessor registry public. EU-first infrastructure with EU-only controls for eligible workflows. Server-side credential handling. Run-level audit trail.
