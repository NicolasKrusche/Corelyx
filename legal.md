# Legal Findings

Reviewed on 2026-04-23.

This document summarizes repo-backed legal and compliance findings for Nexflow. It is a technical audit summary, not legal advice. Lawyer review is still required.

## Key Findings

- High: Account deletion is not end-to-end. `apps/web/app/api/settings/account/route.ts` only calls `auth.admin.deleteUser`, while Vault cleanup exists separately in `supabase/migrations/20240002_vault_helpers.sql`. I found no trigger or job that purges a user's stored secrets on account deletion. The privacy claim in `apps/web/app/privacy/page.tsx` that credentials are deleted within 30 days is therefore stronger than the implementation.
- Medium: The new `Impressum` page is env-driven and still needs production values. `apps/web/app/impressum/page.tsx` now exists, but the legal name, address, country, and VAT ID come from server environment variables defined in `apps/web/.env.local.example`. Until those are populated in the live deployment, the page is not fully compliant.

## DSAR Status

- Access: Mostly met. Users can view their data through profile/settings, APIs, and the full account-wide export at `GET /api/user/export`.
- Rectification: Mostly met. Profile fields, passwords, and email address can be changed self-serve in `apps/web/app/(app)/settings/settings-client.tsx`. Billing contact data correction is handled via support email (legal@nexflow.app). No formal DSAR correction intake workflow exists yet.
- Erasure: Partial. Delete program, key, connection, and account exist. Account deletion now cancels Stripe subscriptions. Vault secret cleanup on account deletion is still incomplete, and account deletion does not document cleanup at other external processors (Resend, Inngest, etc.).
- Portability: Met. `GET /api/user/export` returns a dated JSON bundle covering profile, programs, versions, runs, approvals, logs, connections metadata, and API key metadata. Secrets are excluded.
- Objection/restriction/withdrawal: Mostly missing. Users can disconnect integrations and delete keys, but there is no dedicated objection/restriction flow or consent registry.

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
- Resolved: Account deletion now cancels Stripe subscriptions before removing the auth user. `apps/web/app/api/settings/account/route.ts` looks up all Stripe customers by email and cancels active, trialing, past-due, unpaid, and paused subscriptions immediately before calling `auth.admin.deleteUser`. Failure to reach Stripe is non-fatal so the account deletion still completes.
- Resolved: Pricing display currency updated from GBP (£) to EUR (€) in `apps/web/components/pricing/pricing-tiers.tsx` to match the company's Austrian registration. Note: the underlying Stripe price objects should also be reviewed and updated to EUR currency in the Stripe Dashboard.
- Resolved: `apps/web/app/terms/page.tsx` has been rewritten for an Austrian company operating internationally. Governing law is now the Republic of Austria (replacing England and Wales). Section 10 caps liability in EUR, excludes liability for slight negligence for B2B, and preserves mandatory KSchG protections (intent, gross negligence, personal injury) for consumers. Section 13 adds consumer rights: 14-day withdrawal right under FAGG, EU Digital Content Directive conformity rights, mandatory EU consumer law carve-out, ODR platform reference, and Austrian Internet Ombudsman notice. Section 14 grants Vienna jurisdiction with an EU consumer residence carve-out. Lawyer review of the full text is still recommended before commercial launch.

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
- Email change + Data & Privacy section: `apps/web/app/(app)/settings/settings-client.tsx`

## Process Gaps

- I found no DPA/AVV/SCC paperwork in the repo. The processor inventory now exists in code, but not the signed processor contracts themselves.
- I cannot verify the Supabase region from repo/local config alone. `apps/runtime/.env` contains a hosted Supabase project URL, but not the region.
- The runtime README explicitly says "Deploy to Railway" in `apps/runtime/README.md`, which should be reflected in the final processor inventory and DPA review.

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


- Have counsel review the new privacy inventory, transfer wording, and legal-basis mapping before launch.
- Make account deletion purge Vault secrets and document how external processors such as Stripe should be handled.
- Fix misleading billing copy until a customer portal or cancel flow exists.
- Keep the cookie notice aligned with actual tracker usage. If analytics, error monitoring, or advertising cookies are added later, switch to consent-before-load under TDDDG Section 25.
