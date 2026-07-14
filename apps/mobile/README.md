# Corelyx Mobile

Expo (React Native) companion app for Corelyx: monitor runs, approve/answer
agents, manage your account, and act as your **Corelyx Guard** push-2FA device.

It is a companion, **not** a workflow builder — the React Flow canvas stays on
desktop. Everything here is a native view onto the existing web API (`apps/web`)
over HTTP, plus one new capability: push-based 2FA approval.

## Why it's outside the pnpm workspace

`apps/mobile` is excluded from the JS workspace (`!apps/mobile` in
`pnpm-workspace.yaml`), same as `apps/desktop`. Metro's module resolution fights
pnpm's symlink hoisting, and the app talks to the web API over HTTP — it has no
compile-time coupling to `packages/schema`. API payload types are declared
locally in `lib/types.ts` (keep them in sync with the web routes noted there).

Because of this, it manages its own dependencies and is **not** type-checked by
the web/CI scripts. Run `npm install` here first before `npm run type-check`.

## Setup

```bash
cd apps/mobile
npm install
```

Environment (EAS injects these at build time — see `eas.json`; for local dev put
them in your shell or an `.env`):

- `EXPO_PUBLIC_API_BASE_URL` — the Corelyx web app (default `http://localhost:3000`)
- `EXPO_PUBLIC_SUPABASE_URL` — same Supabase project as web
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key

Run:

```bash
npm run start      # Expo dev server (scan QR with Expo Go / a dev build)
npm run type-check # tsc --noEmit (after npm install)
```

Push notifications require a real device (not a simulator) and a dev/production
build (not Expo Go for remote push in SDK 51+). Server-side push send needs
`EXPO_ACCESS_TOKEN` set on the **web** app.

## Auth model

1. `signInWithPassword` (Supabase, secure-store session).
2. `POST /api/mobile/register` with the Supabase access token → mints a
   `crlxmob_` device token (stored in the OS keychain) and makes this phone the
   user's default **2FA** device.
3. Every subsequent API call sends the `crlxmob_` token as a Bearer; web
   middleware resolves it to the user (same path as personal API tokens).

"Sign out everywhere" on web revokes the device (soft-revoke + push-token clear);
the app re-verifies on foreground and drops to login when revoked.

## Corelyx Guard (push 2FA)

When 2FA is enabled and a phone is registered, web sign-in sends an approve/deny
push instead of (or alongside) the emailed code. Tapping it opens
`app/guard/[id].tsx`; approving calls `POST /api/auth/two-factor/approve` and the
web sign-in completes. Falls back to the email code if push isn't available.

## Structure

```
app/
  _layout.tsx          root: providers, auth gate, 2FA-push tap routing
  login.tsx            password sign-in + device registration
  guard/[id].tsx       Corelyx Guard approve/deny screen
  (tabs)/              Inbox · Runs · Agents · Account
  run/[id].tsx         run detail (live polling)
  agent/[id].tsx       agent detail, reports, questions, run/dry-run
lib/                   config, supabase, api client, auth, push, theme, types
components/ui.tsx      shared UI kit (Screen, Card, Badge, Button, …)
```

## Distribution

EAS Build/Submit (App Store Connect / Play Console) — the RN analogue of the
desktop app's `tauri-action` pipeline. Billing actions deep-link out to the web
app (App Store IAP rules); the account screen is read-only for money.
