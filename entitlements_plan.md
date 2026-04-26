# Entitlements Technical Plan

> Analysis of plan-related logic across the full stack vs. the current pricing page.  
> Status: **plan only — nothing implemented yet.**

---

## 1. Current State: What's Actually Enforced

Only two checks exist in the codebase today:

| Check | File | Tiers enforced |
|-------|------|----------------|
| `checkProgramLimit` | `apps/web/lib/limits.ts:126` | Free = 2 programs max |
| `checkRunLimit` | `apps/web/lib/limits.ts:148` | All tiers, monthly counter |

Everything else on the pricing page is **UI copy only** — no backend enforcement exists.

---

## 2. Critical Bugs (Ship-Blockers)

### 2a. `"plus"` tier missing from DB constraint

`supabase/migrations/20240007_billing_codes.sql` adds:
```sql
CHECK (tier IN ('free', 'pro', 'builder', 'unlimited'))
```
`"plus"` is absent. When the Stripe webhook fires `tier = "plus"` after a Solo checkout, the DB will **reject the write** — the user pays and never gets upgraded.

Affects:
- `apps/web/app/api/billing/webhook/route.ts` — writes `tier = "plus"`
- `packages/db/src/database.types.ts` — type union still `"free" | "pro" | "builder" | "unlimited"`
- `apps/web/lib/limits.ts:9` — Tier type includes "plus" but DB won't store it
- `apps/web/components/sidebar.tsx:28` — Sidebar tier prop doesn't handle "plus"

**Required:** New migration adding "plus" to the constraint; regenerate DB types.

### 2b. Redemption code system has no "plus" type

`supabase/migrations/20240007_billing_codes.sql` defines code types as:
```
'pro_lifetime' | 'builder_lifetime' | 'unlimited' | 'pro_trial' | 'run_credits'
```
No `plus_lifetime` or `plus_trial`. Solo users can't receive redemption codes.

---

## 3. Full Pricing Page vs. Backend: Gap Analysis

### Free

| Feature | Pricing page says | Enforced? | Notes |
|---------|------------------|-----------|-------|
| 2 programs (hard limit) | ✅ | ✅ | `checkProgramLimit` |
| 50 runs / month | ✅ | ✅ | `checkRunLimit` |
| 7-day run history | ✅ | ❌ | History queries use 7-day window in some places but not gated by tier |
| Visual editor only (no Genesis AI) | ✅ | ❌ | Genesis route only checks `checkProgramLimit`, not tier |
| 1 Genesis AI use / month | ✅ | ❌ | No usage counter exists anywhere |
| Manual & cron triggers only | ✅ | ❌ | All trigger types accepted by DB and runtime |
| No BYOK | ✅ | ❌ | API key storage accepts any tier |
| No HITL | ✅ | ❌ | Approval flow not gated |
| No error prevention | ✅ | ❌ | Conflict policy settable by all |

### Solo (Plus)

| Feature | Pricing page says | Enforced? | Notes |
|---------|------------------|-----------|-------|
| Unlimited programs | ✅ | ✅ (by omission) | No cap set |
| 75 runs / month | ✅ | ✅ | `TIER_LIMITS.plus.runsPerMonth = 75` |
| 30-day run history | ✅ | ❌ | Same as Free in practice |
| Manual, cron & webhook triggers | ✅ | ❌ | No trigger type gating |
| Genesis AI (unlimited) | ✅ | ❌ | No per-tier Genesis gating |
| BYOK | ✅ | ❌ | No enforcement |
| Email support | N/A | N/A | Operational, not code |
| No HITL | ✅ | ❌ | Not gated |
| No error prevention | ✅ | ❌ | Not gated |

### Team (Pro)

| Feature | Pricing page says | Enforced? | Notes |
|---------|------------------|-----------|-------|
| 500 runs / month | ✅ | ✅ | `TIER_LIMITS.pro.runsPerMonth = 500` |
| Unlimited programs | ✅ | ✅ | |
| 90-day run history | ✅ | ❌ | Not gated |
| Human-in-the-loop approvals | ✅ | ❌ | Approval routes not tier-gated |
| Error prevention (conflict detection) | ✅ | ❌ | `conflict_policy` settable by all |
| All trigger types | ✅ | ❌ | No gating |
| BYOK + model credits | ✅ | ❌ | No gating |
| Up to 3 team seats | ✅ | ❌ | No team/org model exists in DB |
| Priority support | N/A | N/A | Operational |

### Scale (Builder)

| Feature | Pricing page says | Enforced? | Notes |
|---------|------------------|-----------|-------|
| 2,000 runs / month | ✅ | ✅ | `TIER_LIMITS.builder.runsPerMonth = 2000` |
| Unlimited team seats | ✅ | ❌ | No team model |
| 1-year run history | ✅ | ❌ | Not gated |
| Priority execution queue | ✅ | ❌ | No queue priority logic |
| Dedicated success manager | N/A | N/A | Operational |
| Custom integrations | N/A | N/A | Operational |
| SLA guarantee | N/A | N/A | Legal/ops |

---

## 4. Complete Entitlement Schema (PlanEntitlements)

This is what the config layer should look like. Does not exist yet.

```typescript
interface PlanEntitlements {
  // Quantitative limits
  maxPrograms: number | null;           // null = unlimited
  runsPerMonth: number | null;          // null = unlimited
  runHistoryDays: number | null;        // null = unlimited
  genesisUsesPerMonth: number | null;   // null = unlimited

  // Trigger access
  triggers: {
    manual: boolean;
    cron: boolean;
    webhook: boolean;
    event: boolean;     // "all trigger types" = event + program
    program: boolean;
  };

  // Feature flags
  byok: boolean;                        // bring your own API key
  hitlApprovals: boolean;               // human-in-the-loop
  conflictDetection: boolean;           // error prevention (auto)
  priorityExecution: boolean;           // priority queue on Scale

  // Collaboration
  maxTeamSeats: number | null;          // null = unlimited (Scale)

  // Model credits (operational, not enforced in code)
  modelCreditsIncluded: boolean;
}

const ENTITLEMENTS: Record<Tier, PlanEntitlements> = {
  free: {
    maxPrograms: 2,
    runsPerMonth: 50,
    runHistoryDays: 7,
    genesisUsesPerMonth: 1,
    triggers: { manual: true, cron: true, webhook: false, event: false, program: false },
    byok: false,
    hitlApprovals: false,
    conflictDetection: false,
    priorityExecution: false,
    maxTeamSeats: 1,
    modelCreditsIncluded: false,
  },
  plus: {
    maxPrograms: null,
    runsPerMonth: 75,
    runHistoryDays: 30,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: false, program: false },
    byok: true,
    hitlApprovals: false,
    conflictDetection: false,
    priorityExecution: false,
    maxTeamSeats: 1,
    modelCreditsIncluded: false,
  },
  pro: {
    maxPrograms: null,
    runsPerMonth: 500,
    runHistoryDays: 90,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: true, program: true },
    byok: true,
    hitlApprovals: true,
    conflictDetection: true,
    priorityExecution: false,
    maxTeamSeats: 3,
    modelCreditsIncluded: true,
  },
  builder: {
    maxPrograms: null,
    runsPerMonth: 2000,
    runHistoryDays: 365,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: true, program: true },
    byok: true,
    hitlApprovals: true,
    conflictDetection: true,
    priorityExecution: true,
    maxTeamSeats: null,
    modelCreditsIncluded: true,
  },
  unlimited: {
    maxPrograms: null,
    runsPerMonth: null,
    runHistoryDays: null,
    genesisUsesPerMonth: null,
    triggers: { manual: true, cron: true, webhook: true, event: true, program: true },
    byok: true,
    hitlApprovals: true,
    conflictDetection: true,
    priorityExecution: true,
    maxTeamSeats: null,
    modelCreditsIncluded: true,
  },
};
```

---

## 5. Proposed Data Model

### 5a. Migration required (DB)

```sql
-- Fix: add "plus" to tier constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_tier_check,
  ADD CONSTRAINT profiles_tier_check
    CHECK (tier IN ('free', 'plus', 'pro', 'builder', 'unlimited'));

-- Add genesis usage tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS genesis_uses_this_month  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS genesis_month_reset_at   TIMESTAMPTZ;

-- Add redemption code type for "plus"
-- (depends on how the type is stored — likely an ALTER for the CHECK or enum)
```

### 5b. New config file

```
apps/web/lib/entitlements.ts   ← single source of truth
```

Replaces the current split between `limits.ts` (quantitative only) and `billing.ts` (Stripe mapping only). Exposes:
- `getEntitlements(tier: Tier): PlanEntitlements`
- `checkFeatureAccess(tier: Tier, feature: keyof PlanEntitlements): boolean`
- All existing `checkRunLimit` / `checkProgramLimit` functions delegate to this

### 5c. Team seats (future, not MVP)

Team seats require a `team_members` table:
```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id),
  member_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (owner_id, member_id)
);
```
No enforcement is possible without this. For now: `maxTeamSeats` is defined in entitlements but unenforced — seat count is UI copy only.

---

## 6. Enforcement Points (Where Each Check Must Be Added)

### Quantitative (already partial, needs consolidation)

| Entitlement | Endpoint to gate | File |
|-------------|-----------------|------|
| `maxPrograms` | POST `/api/genesis` | `apps/web/app/api/genesis/route.ts:135` |
| `maxPrograms` | POST `/api/genesis/stream` | `apps/web/app/api/genesis/stream/route.ts:71` |
| `maxPrograms` | POST `/api/programs/import` | `apps/web/app/api/programs/import/route.ts:63` |
| `runsPerMonth` | POST `/api/runs` | `apps/web/app/api/runs/route.ts:33` |
| `runsPerMonth` | POST `/api/triggers/webhook/[token]` | `apps/web/app/api/triggers/webhook/[token]/route.ts:105` |
| `runsPerMonth` | Inngest cron runner | `apps/web/lib/inngest/cron-runner.ts:59` |
| `runsPerMonth` | Event dispatch | `apps/web/lib/triggers/dispatch-event.ts:111` |
| `genesisUsesPerMonth` | POST `/api/genesis` | same genesis route — add counter check |
| `genesisUsesPerMonth` | POST `/api/genesis/stream` | same |
| `runHistoryDays` | GET `/api/runs` (list) | new — add `started_at >= now() - interval` filter |

### Feature flags (none enforced today)

| Entitlement | Endpoint to gate | Notes |
|-------------|-----------------|-------|
| `triggers.webhook` | POST `/api/triggers/webhook/[token]` | Reject if tier lacks webhook access |
| `triggers.event` | `dispatch-event.ts` | Reject event-type triggers |
| `triggers.program` | Program-trigger dispatch | Reject program-type triggers |
| `byok` | POST `/api/connections` (key storage) | Reject BYOK key save for Free |
| `hitlApprovals` | POST `/api/runs/[id]/approve` | Return 403 for Free/Plus |
| `conflictDetection` | PATCH `/api/programs/[id]` (conflict_policy) | Restrict non-queue policies to Pro+ |
| `priorityExecution` | Runtime dispatch | Pass priority flag to LangGraph runner |

### UI gates (already correct, no backend needed)

- Trigger type selectors in the visual editor (disable non-entitled options)
- HITL node in genesis/editor (disable for Free/Plus)
- Conflict policy selector (lock to "queue" for Free/Plus)
- Run history date range picker (cap to tier window)

---

## 7. Implementation Priority

| Priority | Item | Reason |
|----------|------|--------|
| 🔴 Critical | DB migration: add "plus" to tier constraint | Paying Solo users don't get upgraded today |
| 🔴 Critical | Regenerate `packages/db/src/database.types.ts` | Type safety for all tier checks |
| 🔴 Critical | Add `plus_lifetime` / `plus_trial` redemption types | Beta code support for Solo |
| 🟡 High | Create `apps/web/lib/entitlements.ts` | Single source of truth replaces split logic |
| 🟡 High | Enforce `genesisUsesPerMonth` for Free | Pricing shows "1 use/month" — no tracking exists |
| 🟡 High | Enforce trigger type gating | Free/Plus users can currently run event/program triggers |
| 🟡 High | Enforce `hitlApprovals` at API layer | HITL is the primary Pro differentiator |
| 🟡 High | Enforce `conflictDetection` at API layer | Second Pro differentiator |
| 🟢 Medium | Enforce `runHistoryDays` on list queries | Paid feature currently given to all |
| 🟢 Medium | Enforce `byok` (block Free from saving API keys) | Low risk if skipped short-term |
| 🟢 Low | Team seats model | Requires schema work; B2B phase |
| 🟢 Low | `priorityExecution` queue | Requires runtime changes |
