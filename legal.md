# Legal Findings

Reviewed on 2026-04-23.

This document summarizes repo-backed legal and compliance findings for Nexflow. It is a technical audit summary, not legal advice. Lawyer review is still required.

## Key Findings

- High: Account deletion is not end-to-end. `apps/web/app/api/settings/account/route.ts` only calls `auth.admin.deleteUser`, while Vault cleanup exists separately in `supabase/migrations/20240002_vault_helpers.sql`. I found no trigger or job that purges a user's stored secrets on account deletion. The privacy claim in `apps/web/app/privacy/page.tsx` that credentials are deleted within 30 days is therefore stronger than the implementation.
- High: Billing cancellation is not implemented, but product copy says it is. The only Stripe flows I found are checkout in `apps/web/app/api/billing/checkout/route.ts` and webhook sync in `apps/web/app/api/billing/webhook/route.ts`. I found no customer portal or subscription cancel route, while the FAQ in `apps/web/components/pricing/pricing-tiers.tsx` says users can cancel from account settings. Deleting an account also does not appear to touch Stripe.
- Medium: DSAR portability tooling is still incomplete. The rewritten privacy page no longer overpromises a 90-day retention rule or an export-on-request flow, but I still found no dedicated account-wide DSAR export endpoint that packages profile, programs, runs, approvals, logs, connections metadata, and API key metadata together.
- Medium: The new `Impressum` page is env-driven and still needs production values. `apps/web/app/impressum/page.tsx` now exists, but the legal name, address, country, and VAT ID come from server environment variables defined in `apps/web/.env.local.example`. Until those are populated in the live deployment, the page is not fully compliant.
- Medium: Terms are not missing, but they are generic and not German-SaaS-ready. The page exists in `apps/web/app/terms/page.tsx`, yet it uses England and Wales governing law and UK-style liability language. That needs lawyer review for a German-facing commercial site.
- Medium: DSAR rectification is only partial. Users can edit display name/avatar in `apps/web/app/(app)/profile/page.tsx` and change passwords in `apps/web/app/(app)/settings/settings-client.tsx`, but there is no self-serve email change, no billing/contact data correction flow, and no consolidated DSAR intake/status workflow.

## DSAR Status

- Access: Partial. Users can already view a lot through profile/settings plus APIs for programs, runs/logs, connections, keys, and approvals.
- Rectification: Partial. Profile fields and passwords can be changed, but account email, billing/contact data, and a formal correction workflow are missing.
- Erasure: Partial. Delete program, key, connection, and account exist, but external processor cleanup and Vault secret cleanup do not look complete.
- Portability: Partial. Program JSON is retrievable/importable, but there is no account-wide export bundle or user-facing DSAR export flow.
- Objection/restriction/withdrawal: Mostly missing. Users can disconnect integrations and delete keys, but there is no dedicated objection/restriction flow or consent registry.

## Resolved Since Review

- Resolved: `apps/web/middleware.ts` no longer logs user email addresses or cookie-value prefixes during auth checks, which reduces personal data exposure in server logs.
- Resolved: `apps/web/components/consent-banner.tsx` is now a site-wide essential-cookie notice mounted from `apps/web/app/layout.tsx`, instead of a homepage-only acknowledgement. The privacy page in `apps/web/app/privacy/page.tsx` now reflects that behavior more closely.
- Resolved: `apps/web/app/impressum/page.tsx` now exists, is public, and is linked from the landing page footer, legal footers, robots, sitemap, middleware public routes, and in-app legal settings links.
- Resolved: `apps/web/app/privacy/page.tsx` has been rewritten into a structured processor inventory with purpose, legal basis, and data-location notes for core processors, optional connected services, and optional model providers.
- Resolved: The legal-page return navigation is now session-aware. `apps/web/components/legal-page-header.tsx` routes signed-in users from `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`, and `apps/web/app/impressum/page.tsx` back to `/dashboard` instead of always sending them to the public landing page.

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

- Populate the production `LEGAL_*` environment variables so the `Impressum` page shows the real legal entity name, address, country, and VAT ID.
- Have counsel review the new privacy inventory, transfer wording, and legal-basis mapping before launch.
- Add a real DSAR export flow, ideally a single endpoint that packages profile, programs, versions, runs, approvals, logs, connections metadata, and API key metadata.
- Make account deletion purge Vault secrets and document how external processors such as Stripe should be handled.
- Fix misleading billing copy until a customer portal or cancel flow exists.
- Keep the cookie notice aligned with actual tracker usage. If analytics, error monitoring, or advertising cookies are added later, switch to consent-before-load under TDDDG Section 25.
