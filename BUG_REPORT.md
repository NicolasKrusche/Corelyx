# Corelyx QA Bug Report
**Date:** 2026-06-11  
**Tester:** Claude (automated Playwright + Claude in Chrome)  
**Scope:** Full-site navigation, Genesis limits, Edit with AI limits, editor limits, legal/compliance pages

---

## BUG #1 — Genesis building page missing app shell

**Severity:** High  
**Route:** `/programs/new/building`  
**File:** `apps/web/app/(editor)/programs/new/building/page.tsx`

The building page lives under the `(editor)` route group (`app/(editor)/layout.tsx`), which intentionally renders no sidebar. As a result, the entire building canvas is missing the persistent nav sidebar shown on every other authenticated page.

- Line 144 has `left-16` in the overlay div, written as if a 64px sidebar is present — but there is none.
- Line 187 also shows a raw error string (see BUG #11).

**Reproduction:** Start Genesis generation → building animation begins → no sidebar is visible. Every other app page has the sidebar.

---

## BUG #2 — `/residency` returns 404

**Severity:** Medium  
**Route:** `/residency`  
**File:** No redirect configured

The legal nav (`components/legal-page-header.tsx:63`) correctly links to `/data-residency`, but if a user navigates directly to `/residency` (e.g. from a bookmark, old email, or external link) they get a 404. No Next.js redirect or middleware redirect exists from `/residency` → `/data-residency`.

**Reproduction:** Navigate to `https://www.corelyx.app/residency` → 404 page.

---

## BUG #3 — Duplicate "Corelyx" in browser tab titles

**Severity:** Low  
**Files:** Multiple pages under `apps/web/app/(app)/`

Root layout (`apps/web/app/layout.tsx:30`) sets `template: "%s | Corelyx"`. Several pages set their own `metadata.title` with `"— Corelyx"` already embedded, producing titles like **"Credits & Usage — Corelyx | Corelyx"** in the browser tab.

Affected files and current (broken) title values:
| File | Current title |
|------|--------------|
| `app/(app)/credits/page.tsx:22` | `"Credits & Usage — Corelyx"` |
| `app/(app)/plan/page.tsx:8` | `"Pricing — Corelyx"` |
| `app/(app)/updates/page.tsx:16` | `"Updates – Corelyx"` |
| `app/(app)/updates/[slug]/page.tsx:25` | `"${post.title} – Corelyx"` |
| `app/(app)/workspaces/page.tsx:6` | `"Workspaces - Corelyx"` |
| `app/(app)/account/compliance/page.tsx` | `"EU Compliance Center - Corelyx"` |
| `app/(app)/admin/codes/page.tsx` | `"Code Manager — Corelyx Admin"` |
| `app/(app)/admin/dsr/page.tsx` | `"DSR Queue - Corelyx Admin"` |
| `app/(app)/admin/support/page.tsx` | `"Support Tickets — Corelyx Admin"` |
| `app/(app)/admin/team/page.tsx` | `"Team - Corelyx Admin"` |
| `app/consent/page.tsx` | `"Terms & Privacy — Corelyx"` |
| `app/u/[username]/page.tsx` | `"@${username} — Corelyx"` |

**Reproduction:** Visit any of the above routes and check the browser tab/title bar.

---

## BUG #4 — Notification bell accessible name computed as "Notifications2"

**Severity:** Low (accessibility)  
**File:** `apps/web/components/notification-center.tsx:240`

The notification button has `title="Notifications"` but no `aria-label`. The count badge span inside the button (lines 264–271) renders raw text like `2` without `aria-hidden="true"`. Screen readers compute the button's accessible name as the concatenation of all child text, resulting in names like **"Notifications2"** or **"Notifications14"** depending on unread count.

**Reproduction:** Use a screen reader or run an accessibility audit on any authenticated page → button announced incorrectly.

---

## BUG #5 — Edit with AI: submit not blocked when prompt exceeds 2000 chars

**Severity:** Medium  
**File:** `apps/web/components/editor/AiEditPanel.tsx:181`

The textarea has `maxLength={2000}` (line 155) and a visual counter turns amber at 1800+ chars (lines 163–168). However the submit button's `disabled` condition is:

```ts
disabled={loading || !prompt.trim() || !canSubmit}
```

It is missing `|| prompt.length > 2000`. Because `maxLength` on a textarea is advisory in some environments and can be bypassed by paste or programmatic input, it is possible to submit a prompt longer than 2000 characters, which will likely produce a server-side error rather than a clean client-side validation message.

**Reproduction:** Programmatically set the textarea value to >2000 chars → submit button remains enabled.

---

## BUG #6 — Edit with AI: node label/description not updated after edit

**Severity:** Medium  
**File:** `apps/web/components/editor/AiEditPanel.tsx` (exact line not yet isolated)

When "Edit with AI" modifies a node's config, the node's visual label and description displayed on the canvas are not updated to reflect the change. The underlying config is patched, but the React Flow node data (label/description fields) remains stale until a manual refresh or re-render.

**Reproduction:** Open a node in the editor → Edit with AI → apply a change that renames the node or changes its description → node card on canvas still shows the old label/description.

---

## BUG #7 — Version History: Compare shows no visual diff

**Severity:** Medium  
**File:** Not yet isolated (editor version history component)

The "Compare" feature in the Version History panel loads without displaying any diff between versions. The diff view appears blank/empty regardless of how different the two versions are.

**Reproduction:** Open any program with multiple saved versions → Version History → Compare two versions → diff panel is empty.

---

## BUG #8 — "Run with payload" button disabled for valid empty object `{}`

**Severity:** Medium  
**File:** `apps/web/components/editor/EditorShell.tsx:1482`

The `webhookPayloadValid` state is initialized to `false`:

```ts
const [webhookPayloadValid, setWebhookPayloadValid] = React.useState(false);
```

But the initial payload value (line 1481) is `'{\n  \n}'`, which parses to `{}` — a valid JSON object. The `isJsonObject` function in `lib/triggers/manual-run.ts` correctly returns `true` for `{}` (non-null, non-array object), but because the initial state is `false` and the validation only runs on change, the "Run" button starts out disabled even though the payload is already valid.

**Reproduction:** Open any webhook-triggered program → click "Run manually" → "Run with payload" tab → Run button is disabled even though the default `{}` payload is perfectly valid. User must type a space and delete it to trigger re-validation.

---

## BUG #9 — Genesis accepts emoji-only input with no client-side validation

**Severity:** Low–Medium  
**File:** `apps/web/app/(app)/programs/new/page.tsx` (Genesis prompt textarea)

The Genesis prompt textarea performs no client-side content validation before submission. Submitting a string consisting entirely of emoji (e.g. `🚀📧💾🔔✅❌🎯🤖🔗📊`) sends the request to the model, which then returns a server-side error: *"Generation failed: The automation description is missing or does not specify any actionable steps or triggers."*

This is correct behavior at the model level, but the error could be caught client-side before the round trip, providing faster feedback and avoiding unnecessary API calls.

**Reproduction:** Go to `/programs/new` → type only emoji into the prompt → submit → spins for several seconds → server-side error.

---

## BUG #10 — Genesis returns generic error for contradictory/impossible prompts

**Severity:** Low  
**File:** Genesis backend / `apps/web/app/(app)/programs/new/building/page.tsx:187`

When given a self-contradictory prompt (e.g. *"Run every second AND never run"*), Genesis returns the generic message: *"We could not build the workflow. Please try again."* — with no indication of what went wrong or how to fix the prompt.

This is arguably acceptable, but a more informative error (e.g. *"The prompt contains conflicting instructions — please clarify your trigger conditions"*) would improve UX.

---

## BUG #11 — Raw Zod JSON error string shown to users on building page

**Severity:** High  
**File:** `apps/web/app/(editor)/programs/new/building/page.tsx:187`

```tsx
<p className="text-xs text-destructive">{error}</p>
```

When Genesis fails with a validation error, `error` contains the raw stringified Zod error array, e.g.:

```json
[{"code":"too_big","maximum":2000,"type":"string","inclusive":true,"exact":false,"message":"String must contain at most 2000 character(s)","path":["description"]}]
```

This is exposed directly in the UI. Users see technical JSON with internal schema field names like `"path":["description"]`.

**Reproduction:** Submit a Genesis prompt longer than 2000 characters → building page → raw JSON Zod error is displayed in red text.

---

## BUG #12 — Genesis Plan shows generic boilerplate steps unrelated to prompt

**Severity:** Low–Medium  
**File:** Genesis plan API / plan panel component

When clicking "Plan" before generating, the plan panel shows a generic 5-step description that does not reflect the actual prompt submitted. For example, prompting *"Every morning at 9am, fetch the top 10 HackerNews stories and email them to me"* produced a plan with steps like:
1. Trigger (generic)
2. Data fetch (generic)
3. Transform data (generic)
4. Send notification (generic)
5. Log results (generic)

None of the steps mention HackerNews, Gmail, 9am, or any prompt-specific detail.

**Reproduction:** Go to Genesis → type any specific prompt → click Plan → plan shows templated generic steps.

---

## BUG #13 — Genesis Plan shows "Using 6 of 6 connections" but Customize shows only 2

**Severity:** Medium  
**File:** Genesis plan panel component (connections count logic)

The plan panel header displays **"Using 6 of 6 connections"**, but clicking "Customize" opens a selection list with only **2 connections** (e.g. `gmail:primary`, `docs:primary`). The count in the header does not match the actual number of connections shown in the customization panel.

**Reproduction:** Go to Genesis → type a prompt → click Plan → header shows "Using N of N connections" → click Customize → far fewer connections are listed than the header claims.

---

## BUG #14 — Genesis-generated AGENT nodes have no AI model assigned

**Severity:** High  
**File:** `apps/web/lib/genesis/prompt.ts` (Genesis system prompt)

When Genesis generates a workflow containing an AGENT node type, the node is created without an AI model or API key configured. This causes the workflow to fail validation immediately upon opening in the editor ("No model" badge on the node), and the workflow cannot be run without manually editing the node.

**Observed example:** Prompt *"Every morning at 9am, fetch top HackerNews stories and email them"* → generated "Morning Hacker News Digest" with 9 nodes including an AGENT node using `llama-3.1-8b-instant` model label but with **"No model"** shown in the editor, indicating the model field is not properly set in the schema.

**Reproduction:** Use Genesis to generate any workflow → if an AGENT node appears → open in editor → node shows "No model" and workflow fails validation.

---

## BUG #15 — Public marketing pages show "Sign in" button to authenticated users

**Severity:** Low  
**File:** `/ai-act` page, `/security` page (public marketing/SEO pages)

The `/ai-act` and `/security` routes are standalone public marketing pages with their own nav header that includes a "Sign in" button. These pages do not check authentication state, so a logged-in user navigating to them sees "Sign in" instead of a link to their dashboard or any indication they are already authenticated.

This is likely intentional (pure SEO landing pages), but may be confusing for users who arrive from search results while already logged in.

**Reproduction:** Log in → navigate to `/ai-act` or `/security` → "Sign in" button is visible in the nav.

---

## Summary Table

| # | Title | Severity | File |
|---|-------|----------|------|
| 1 | Building page missing app shell (no sidebar) | High | `(editor)/programs/new/building/page.tsx` |
| 2 | `/residency` returns 404 | Medium | No redirect configured |
| 3 | Duplicate "Corelyx" in browser tab titles | Low | 12 page files |
| 4 | Notification bell accessible name "Notifications2" | Low | `notification-center.tsx:240` |
| 5 | Edit with AI: submit not blocked at 2000 char limit | Medium | `AiEditPanel.tsx:181` |
| 6 | Edit with AI: node label/description stale after edit | Medium | `AiEditPanel.tsx` |
| 7 | Version History Compare shows no diff | Medium | Editor version history component |
| 8 | Run with payload disabled for valid `{}` | Medium | `EditorShell.tsx:1482` |
| 9 | Genesis accepts emoji-only input (no client validation) | Low–Medium | `programs/new/page.tsx` |
| 10 | Genesis returns generic error for contradictory prompts | Low | Genesis backend |
| 11 | Raw Zod JSON shown to users on building error page | High | `building/page.tsx:187` |
| 12 | Genesis Plan shows generic boilerplate steps | Low–Medium | Genesis plan component |
| 13 | "6 of 6 connections" mismatch with Customize panel | Medium | Genesis plan panel |
| 14 | Genesis AGENT nodes generated without AI model | High | `lib/genesis/prompt.ts` |
| 15 | Public pages show "Sign in" to authenticated users | Low | `/ai-act`, `/security` pages |

---

## Fix Status (2026-06-12)

All bugs above plus the actionable findings from `AUDIT_REPORT_2026-06-11.md` were fixed in one pass.

**This report:**
| # | Fix |
|---|-----|
| 1 | Building page moved to `(app)` route group; canvas offset now `left-0 lg:left-16` |
| 2 | Permanent redirect `/residency` → `/data-residency` in `next.config.mjs` |
| 3 | Removed embedded "Corelyx" from all page titles (root template appends it); `createSeoMetadata` now uses `title.absolute` |
| 4 | Notification button got explicit `aria-label` (+ unread count); badge `aria-hidden` |
| 5 | Submit + Cmd/Ctrl-Enter blocked when prompt > 2000 chars |
| 6 | Refinement prompt now requires label/description updates when node behavior changes |
| 7 | Compare now fetches the real snapshot via `GET /versions?version=N` (embedded `version_history` was empty/stale → silent no-op); dead `getVersionSnapshot` removed |
| 8 | `webhookPayloadValid` initialized `true` (default `{}` payload is valid) |
| 9 | Client-side validation rejects emoji/symbol-only and >2000-char prompts with inline feedback |
| 10 | Genesis error contract now requires specific, user-actionable refusal messages |
| 11 | Building page parses Zod issue arrays into human-readable messages |
| 12 | Plan output now echoes the user's actual request (full AI-generated plans remain future work) |
| 13 | Connection chips fall back to provider name when `name` is empty (count/list mismatch not reproducible in code — same array drives both) |
| 14 | `assignAgentNodeDefaults` fills `__USER_ASSIGNED__` model/key sentinels with the workspace's best valid key in both genesis routes |
| 15 | SEO header CTA swaps to "Dashboard" client-side when a session exists |

**Audit report:** hydration mismatch fixed (creation_date set after mount); CSP allows `va.vercel-scripts.com` + `vitals.vercel-insights.com`; login/signup got `maxLength`; all webhook routes return generic 503 (not 500 + env-var name) when unconfigured; Inngest guard returns 503 without leaking config; unauthenticated `/api/*` now gets 401 JSON instead of 307; pricing yearly toggle got proper `aria-label`; public tool inputs capped (200/2000 chars).

**Documented as by-design (no change):** password-reset generic `{"ok":true}` (anti-enumeration, OWASP-correct); `/support`, `/updates`, `/consent`, `/governance` etc. requiring login; default-deny middleware redirecting unknown paths to `/login`; `/academy/*` → `/docs/*` legacy alias; deprecated Stripe stub returning 200; trigger-webhook 404 on bad token (anti-enumeration); German 404 text (tester's own locale cookie); XSS finding (React escapes on render — length limits added as the actionable part).
