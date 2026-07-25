# Corelyx — TODO

## Mobile App

- [ ] **Wire FCM so Corelyx Guard pushes actually deliver on Android**
  - The sideload APK ships without `google-services.json` / Firebase config, so remote push
    (`getExpoPushTokenAsync`) returns nothing — Guard 2FA approvals currently rely on the
    app's in-app polling fallback instead of real push notifications.
  - Steps: create a Firebase project for `app.corelyx.mobile`, download `google-services.json`
    into `apps/mobile/`, reference it via `android.googleServicesFile` in `app.json`, upload the
    FCM V1 service-account key to EAS (`eas credentials`), rebuild, and verify a Guard push
    arrives with the app closed.
  - Server side already works (`EXPO_ACCESS_TOKEN` + `lib/push.ts`) — this is purely the
    Android client credential setup.

- [x] **Expo SDK upgrade for 16 KB page-size devices**
  - The current build (Expo SDK 57 / RN 0.76+) already has 16 KB page alignment support
  - SDK 57.0.7 is well beyond the required SDK 52+ threshold
  - Task completed: verified via package.json inspection

## EU Data Residency

- [ ] **OpenRouter enterprise DPA + EU routing**
  - Sign enterprise agreement with OpenRouter to get a DPA with SCCs and confirmed EU routing
  - Once done: update `provider-registry.ts` — set `eu_only_supported: true`, `dpa_available: true`, `scc_available: true`, update `transfer_basis` for OpenRouter entry
  - Also update the OpenRouter entry in `lib/legal.ts` (modelProviders) to remove the "no DPA in place" warning
  - Update Section 8 of privacy page to note the platform key path is now EU-resident
  - **Important caveat:** EU routing through OpenRouter only makes the path EU-compliant if the underlying model endpoints OpenRouter uses are also EU-hosted. Confirm with OpenRouter which models have EU inference endpoints before making a public EU-only claim.
  - Customer-owned Anthropic keys remain a third-country transfer (Anthropic has no EU region). Customer-owned OpenAI keys can be EU-only if the user enables it in their OpenAI account. These are the user's responsibility regardless.

## Legal Maintenance

- [ ] **Last updated date** — `LEGAL_LAST_UPDATED` in `apps/web/lib/legal.ts` is currently "April 23, 2026". Update it any time a legal document (Privacy Policy, Terms, DPA, Impressum) is revised. Also re-check that the substance of the document matches what was changed — the date is meaningless if the text wasn't also updated.

## Trust & Landing Page

- [ ] **Founders / About page** (`/about`)
  - Photos, names, and short bios of founders
  - Company origin story ("Built in Austria")
  - Link from footer nav and header nav
  - Helps enterprise buyers verify who is behind the product

## SEO

- [ ] **Improve SEO structure** across `/academy`, `/blog`, `/docs`, `/compare`, `/templates`, `/use-cases`, `/integrations`, `/industry`
  - Better heading hierarchy (H1 → H2 → H3)
  - JSON-LD structured data (Article, HowTo, FAQPage schema) on content pages
  - Breadcrumb nav + BreadcrumbList schema markup
  - OpenGraph images per section (not just the global one)
  - Review internal linking density — more cross-links between related pages
  - Check canonical URLs are correct on all dynamic routes
  - Review meta descriptions for uniqueness and click-worthiness

- [ ] **Academy course content** — real step-by-step tutorials with Corelyx-specific workflow steps, node types, and example schemas (keep public, no auth wall)
  - Sit down with product to verify what nodes/connectors are actually available
  - Start with: "Build a GDPR DSAR workflow", "Build an AI Act review checkpoint", "Build a human approval gate"

## Done

- [x] Add Contact link to header nav (mailto:support@corelyx.app)
- [x] Add Trust Center link to footer nav (`/trust`)
- [x] Show governing law in footer legal block
- [x] Show support email in footer
