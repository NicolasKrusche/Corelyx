# Safety Issues

Review date: 2026-04-29

This file tracks concrete, currently actionable issues from the broader `safety_concerns.md` review.

## Fixed or Partially Fixed This Pass

### SI-1. Workspace switcher native dropdown did not fit the app shell

Status: fixed.

The sidebar workspace switcher no longer uses the browser-native select UI. It now uses a themed menu that follows the sidebar palette and keeps role labels readable.

### SI-2. Missing baseline browser security headers

Status: partially fixed.

`apps/web/next.config.mjs` now sets:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Content-Security-Policy: base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`

Remaining work: add a fuller CSP with `script-src`, `style-src`, `connect-src`, and nonces/hashes after auditing all required external origins and the inline theme boot script.

### SI-3. Weak generated redemption codes

Status: fixed for newly generated codes.

`apps/web/app/api/admin/codes/route.ts` now uses `crypto.randomInt` and generates 16-character non-confusable codes instead of 8 characters from `Math.random()`.

### SI-4. Redemption endpoint was useful for code enumeration

Status: partially fixed.

`apps/web/app/api/settings/redeem/route.ts` now rate-limits attempts per user and per forwarded IP, and returns a generic failure for invalid, expired, exhausted, locked, or already-used codes.

Remaining work: move redemption into a database transaction/RPC that locks the code row, checks usage, applies the workspace benefit, records redemption, and increments usage atomically.

### SI-5. Production builds still ignore TypeScript and ESLint failures

Status: fixed.

`apps/web/next.config.mjs` no longer disables TypeScript or ESLint checks during production builds. The existing type/lint blockers were fixed, including the Next 15 route context migration needed after upgrading Next.

### SI-6. Dependency advisories still need a fresh audit/remediation pass

Status: fixed.

`next` and `eslint-config-next` were upgraded to `15.5.15`, `postcss` was upgraded to `^8.5.12`, and root `pnpm.overrides` now pins `protobufjs` to `7.5.5` and `postcss` to `^8.5.12`.

Verification: `pnpm audit --prod` now reports no known vulnerabilities.

### SI-7. Webhook body limits and persistent dedupe are incomplete

Status: fixed.

Public webhook and trigger ingestion routes now use `apps/web/lib/request-body.ts` for bounded 64 KB body reads. GitHub, Slack, Typeform, HubSpot, Airtable, Asana, Gmail, and custom webhook triggers now use the persistent `webhook_deliveries` table for idempotency where a stable provider/event id can be derived.

## Still Open

No items remain open in this actionable file. Residual broader risks and hardening opportunities remain tracked in `safety_concerns.md`.
