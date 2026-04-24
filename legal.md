# Legal Findings

Reviewed on 2026-04-23.

This document summarizes repo-backed legal and compliance findings for Nexflow. It is a technical audit summary, not legal advice. Lawyer review is still required.

## Key Findings

No open code findings. All previously identified code issues have been resolved. See Recommended Next Steps for the remaining operational and legal-process tasks.

## DSAR Status

- Access: Met. Users can view and export all data via `GET /api/user/export`. Formal access requests can be submitted through the DSAR intake form (Legal tab in Settings → `POST /api/user/dsar`), which notifies the legal team and issues a reference number.
- Rectification: Met. Profile fields, passwords, and email address can be changed self-serve. Formal correction requests are handled via the DSAR intake form.
- Erasure: Mostly met. Account deletion cancels Stripe subscriptions, purges all Vault secrets, and removes the Resend audience contact before removing the auth user. Inngest event history cleanup is not automated (Inngest's API does not expose per-user event deletion) — a manual support step is needed for complete Inngest erasure.
- Portability: Met. `GET /api/user/export` returns a dated JSON bundle covering profile, programs, versions, runs, approvals, logs, connections metadata, and API key metadata. Secrets are excluded.
- Objection/restriction/withdrawal: Met. Users can submit a formal DSAR via the Legal tab in Settings, which notifies legal@nexflow.app and sends the user a confirmation with a reference number. Processing suspension on receipt requires a manual response from the legal team — no automated suspension mechanism is needed by GDPR.

## Resolved Since Review

- Resolved: `apps/web/middleware.ts` no longer logs user email addresses or cookie-value prefixes during auth checks, which reduces personal data exposure in server logs.
- Resolved: `apps/web/components/consent-banner.tsx` is now a site-wide essential-cookie notice mounted from `apps/web/app/layout.tsx`, instead of a homepage-only acknowledgement. The privacy page in `apps/web/app/privacy/page.tsx` now reflects that behavior more closely.
- Resolved: `apps/web/app/impressum/page.tsx` now exists, is public, and is linked from the landing page footer, legal footers, robots, sitemap, middleware public routes, and in-app legal settings links.
- Resolved: `apps/web/app/privacy/page.tsx` has been rewritten into a structured processor inventory with purpose, legal basis, and data-location notes for core processors, optional connected services, and optional model providers.
- Resolved: The legal-page return navigation is now session-aware. `apps/web/components/legal-page-header.tsx` routes signed-in users from `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`, and `apps/web/app/impressum/page.tsx` back to `/dashboard` instead of always sending them to the public landing page.
- Resolved: DSAR portability is now met. `apps/web/app/api/user/export/route.ts` exposes `GET /api/user/export`, which packages profile, programs, program versions, runs, approvals, logs, connections metadata, and API key metadata into a dated JSON download. Vault secret IDs are never included.
- Resolved: DSAR rectification self-serve is now substantially complete. `apps/web/app/(app)/settings/settings-client.tsx` now includes a self-serve email change form (non-OAuth users) with Supabase confirmation flow, and an OAuth-user note. A Data & Privacy settings section links to the data export and provides a billing contact correction path via support email.
- Resolved: `LEGAL_*` environment variables are now defined in `apps/web/.env.local` (empty placeholders). Populating them in the Vercel production environment will make the Impressum page fully compliant and clear the amber warning banner.
- Resolved: Billing cancellation is now implemented. `apps/web/app/api/billing/portal/route.ts` exposes `GET /api/billing/portal`, which looks up the authenticated user's Stripe customer by email, creates a Stripe Customer Portal session, and redirects to it. The portal lets users upgrade, downgrade, pause, or cancel their subscription. A "Manage subscription" button appears in the Settings sidebar (Benefits tab) for Pro and Builder users. The FAQ claim in `apps/web/components/pricing/pricing-tiers.tsx` that users can cancel from account settings is now accurate.
- Resolved: Account deletion is now end-to-end. `apps/web/app/api/settings/account/route.ts` now: (1) cancels all active Stripe subscriptions by email lookup; (2) fetches every `vault_secret_id` from the user's `connections` and `api_keys` rows and calls `vaultDelete` on each before removing the auth user; (3) deletes the auth user, which cascades DB rows via `ON DELETE CASCADE`. Vault and Stripe failures are non-fatal per item so a single bad ID does not block account deletion. This closes the gap between the privacy page claim and the implementation.
- Resolved: Pricing display currency updated from GBP (£) to EUR (€) in `apps/web/components/pricing/pricing-tiers.tsx` to match the company's Austrian registration. Note: the underlying Stripe price objects should also be reviewed and updated to EUR currency in the Stripe Dashboard.
- Resolved: `apps/web/app/terms/page.tsx` has been rewritten for an Austrian company operating internationally. Governing law is now the Republic of Austria (replacing England and Wales). Section 10 caps liability in EUR, excludes liability for slight negligence for B2B, and preserves mandatory KSchG protections (intent, gross negligence, personal injury) for consumers. Section 13 adds consumer rights: 14-day withdrawal right under FAGG, EU Digital Content Directive conformity rights, mandatory EU consumer law carve-out, ODR platform reference, and Austrian Internet Ombudsman notice. Section 14 grants Vienna jurisdiction with an EU consumer residence carve-out. Lawyer review of the full text is still recommended before commercial launch.
- Resolved: DSAR objection/restriction/withdrawal intake is now implemented. `apps/web/app/api/user/dsar/route.ts` exposes `POST /api/user/dsar`, which accepts a `request_type` (access, correction, erasure, portability, objection, restriction, withdrawal) and optional description. It notifies legal@nexflow.app and sends the user a confirmation email with a unique reference number. The form is surfaced in the Legal tab of the Settings sidebar (`apps/web/components/sidebar.tsx`).
- Resolved: Resend audience contact is now deleted on account deletion. `apps/web/app/api/settings/account/route.ts` calls `DELETE /audiences/{id}/contacts/{email}` when `RESEND_AUDIENCE_ID` and `RESEND_API_KEY` are set. This is non-fatal — a missing audience ID or Resend error will not block deletion.
- Resolved: Privacy page retention text updated. The stale "account-wide deletion automation is still being tightened" notice in `apps/web/lib/legal.ts` has been replaced with accurate wording reflecting that account deletion now automatically purges all Vault secrets.
- Resolved: Supabase region is now surfaced in the privacy page when documented. `apps/web/lib/legal.ts` reads a new `SUPABASE_REGION` environment variable (added to both `.env.local` and `.env.local.example`). When set, the privacy page processor entry for Supabase shows the confirmed region. When unset, the text prompts the operator to document it.
- Resolved: Impressum page code is complete. `apps/web/app/impressum/page.tsx` exists, is publicly linked, reads all required fields (`LEGAL_ENTITY_NAME`, `LEGAL_ADDRESS_LINE_1`, `LEGAL_POSTAL_CODE`, `LEGAL_CITY`, `LEGAL_COUNTRY`, `LEGAL_VAT_ID`) from server environment variables, and displays an amber warning banner when any are missing. The remaining work is an operational task: populate these variables in the Vercel production environment with the company's actual Austrian business registration details.

## What Exists Today

- Privacy page: `apps/web/app/privacy/page.tsx`
- Terms page: `apps/web/app/terms/page.tsx`
- Impressum page: `apps/web/app/impressum/page.tsx`
- Shared legal-page header: `apps/web/components/legal-page-header.tsx`
- Shared legal data/config: `apps/web/lib/legal.ts`
- Account deletion endpoint: `apps/web/app/api/settings/account/route.ts`
- Profile edit UI: `apps/web/app/(app)/profile/page.tsx`
- Password change UI: `apps/web/app/(app)/settings/settings-client.tsx`
- Program list/full schema/version APIs:
  - `apps/web/app/api/programs/route.ts`
  - `apps/web/app/api/programs/[id]/route.ts`
  - `apps/web/app/api/programs/[id]/versions/route.ts`
- Connection and API key list APIs:
  - `apps/web/app/api/connections/route.ts`
  - `apps/web/app/api/keys/route.ts`
- Logs surface:
  - `apps/web/app/(app)/logs/logs-client.tsx`
  - `supabase/migrations/20240008_app_logs.sql`
- DSAR export endpoint: `apps/web/app/api/user/export/route.ts`
- DSAR intake endpoint: `apps/web/app/api/user/dsar/route.ts`
- Email change + Data & Privacy section: `apps/web/app/(app)/settings/settings-client.tsx`
- DSAR form (Legal tab in Settings): `apps/web/components/sidebar.tsx`

## Process Gaps

These gaps cannot be resolved through code changes. They require operator action before commercial launch.

- **DPA/AVV/SCC paperwork**: No signed processor contracts are in the repo. The processor inventory in `apps/web/lib/legal.ts` identifies all processors and transfer risks, but the actual Data Processing Agreements with Supabase, Vercel, Railway, Inngest, Resend, and Stripe must be signed separately via each provider's portal or sales process.
- **Supabase region confirmation**: The project URL is `https://fzvmsejkqjbqyavxvirf.supabase.co`. The region is visible in the Supabase Dashboard under Project Settings. Once confirmed, set `SUPABASE_REGION` in the Vercel environment variables — the privacy page will then display it automatically.
- **Inngest event history**: Inngest does not expose a per-user event deletion API. Full Inngest data erasure on account deletion requires a manual support request to Inngest or expiry under Inngest's own retention policy. Document this in the DPA review.

## Legal Source Notes

As of 2026-04-23, the current German references to use are:

- `DDG Section 5` for provider information / Impressum obligations
- `TDDDG Section 25` for device access / cookie consent rules

Official sources:

- DDG Section 5: https://www.gesetze-im-internet.de/ddg/__5.html
- TDDDG Section 25: https://www.gesetze-im-internet.de/ttdsg/__25.html
- GDPR official text: https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32016R0679
- SCC decision 2021/914: https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj/eng

## Recommended Next Steps

The following are non-code tasks required before commercial launch:

1. **Populate Impressum env vars in Vercel**: Set `LEGAL_ENTITY_NAME`, `LEGAL_REPRESENTATIVE`, `LEGAL_ADDRESS_LINE_1`, `LEGAL_ADDRESS_LINE_2`, `LEGAL_POSTAL_CODE`, `LEGAL_CITY`, `LEGAL_COUNTRY`, and `LEGAL_VAT_ID` in the Vercel production environment. Values must match the company's official Austrian business registration (Firmenbuch entry). The amber warning banner on the Impressum page will disappear once all required fields are set.
2. **Document Supabase region**: Check the Supabase Dashboard → Project Settings → General → Region. Set `SUPABASE_REGION` in the Vercel environment (e.g. `eu-central-1`). This removes the uncertainty note from the privacy page and is required for the DPA transfer-risk assessment.
3. **Sign processor DPAs**: Supabase (via their DPA in the dashboard), Vercel (via Vercel DPA + transfer addendum), Railway (contact sales for DPA), Inngest (contact for DPA), Resend (available in their dashboard), Stripe (auto-attached to commercial agreements).
4. **Inngest erasure process**: Document in the internal privacy runbook that Inngest event history for a deleted user requires a manual support request to Inngest, since no API-level deletion is available.
5. **Have counsel review**: Privacy inventory, transfer wording, legal-basis mapping, and the updated Terms of Service (Austrian KSchG/FAGG sections) should be reviewed by an Austrian or EU data-protection lawyer before commercial launch.
6. **EUR currency in Stripe Dashboard**: Verify the Stripe price objects for Pro and Builder are denominated in EUR to match the updated display currency.
7. **Cookie notice**: Keep aligned with actual tracker usage. If analytics, error monitoring, or advertising cookies are added later, switch to consent-before-load under TDDDG §25.
