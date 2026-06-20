# Corelyx Desktop (Phase 1)

A small [Tauri](https://tauri.app) app that runs **local file operations** for
Corelyx workflows and agents. The cloud runtime can call any cloud API but cannot
touch a file on the user's machine — this app is the code that does, securely, on
the cloud's behalf.

## How it fits together

```
Workflow run (cloud runtime)
  │  hits a `file` connection node
  ▼
enqueues a file_operations row (status: pending) ──► web /api/bridge/poll
  │  run suspends, waits on the row                      │  (device-token auth)
  ◄──── terminal row (done / error) ◄── web ◄── this Bridge executes it locally
  │  run resumes with the file result                     inside granted folders
  ▼
downstream nodes
```

The Bridge **never** talks to Supabase directly — all DB access stays server-side
in the web app (per the repo's security rules). The Bridge authenticates with a
per-device token and exchanges work over two endpoints:

- `POST /api/bridge/poll` — claim pending operations + fetch the device's grants.
- `POST /api/bridge/operations/{id}` — report each result/error.

## Security model

- **Folder grants are the boundary.** Every operation resolves to a real path and
  must be inside a granted folder. See [`src-tauri/src/bridge/sandbox.rs`] — the
  single most important file here. It canonicalises paths (following symlinks),
  rejects `..` escapes (including in not-yet-existing write targets), and checks
  containment component-wise (so `/granted` never covers `/granted_evil`).
- **Typed ops only.** The Bridge exposes a closed set (read/write/append/list/
  stat/move/copy/delete/mkdir/search) — never a generic shell.
- **Read vs read/write grants** are enforced per operation.
- **Revocable.** Revoke a device from Corelyx → Settings → Devices; its token is
  rejected immediately and its in-flight ops are cancelled.
- The device token is stored locally in the app config dir (0600 on Unix).
  *TODO (hardening): back it with the OS keychain — macOS Keychain / Windows
  Credential Manager.*

## Project layout

```
src/                      Frontend shell (pairing + status UI; vanilla HTML/JS)
src-tauri/
  src/
    main.rs               Tauri bin: state, commands (pair/unpair/get_status), loop wiring
    lib.rs                Library target (so the Bridge is unit-testable sans windowing)
    config.rs             Device token + server URL persistence
    bridge/
      mod.rs              The poll → execute → submit loop + status
      client.rs           HTTP client for /api/bridge/*
      sandbox.rs          ★ path sandbox (canonicalize + grant-prefix check) + tests
      ops.rs              Typed file operations + tests
      model.rs            Wire types shared with the web endpoints
```

## Building & running

Prerequisites: the [Rust toolchain](https://rustup.rs) and the
[Tauri v2 system prerequisites](https://tauri.app/start/prerequisites/) for your
OS (WebView2 on Windows, `libwebkit2gtk` on Linux, Xcode CLT on macOS).

This app is intentionally **outside the pnpm workspace** (like `apps/runtime`), so
install and run it from this directory:

```bash
cd apps/desktop
pnpm install            # installs @tauri-apps/cli only
pnpm dev                # tauri dev — launches the window
pnpm build              # tauri build — produces a signed-able installer
```

Run the Bridge unit tests (no windowing toolchain needed, just `cargo`):

```bash
pnpm test:bridge        # cargo test --manifest-path src-tauri/Cargo.toml
```

> Placeholder bundle icons are already committed under `src-tauri/icons/` (see
> **Icons** below) so `dev` and `build` work out of the box — swap in real
> branding before shipping.

### Dev against a local web app (test the login → auto-pair handshake)

`pnpm dev:local` runs `tauri dev` with `src-tauri/tauri.dev.conf.json` merged in,
which points the window at `http://localhost:3000` (already allow-listed in the
capability's `remote.urls`). The committed `tauri.conf.json` stays on the
production URL. End-to-end:

```bash
# terminal 1 — the web app (from the repo root; needs apps/web/.env.local)
pnpm --filter @flowos/web dev          # serves http://localhost:3000

# terminal 2 — the desktop shell (from apps/desktop)
pnpm dev:local                         # window loads localhost:3000
```

Log in inside the window with a Solo+ account → the web app's
`DesktopBridgeHandshake` registers a device and hands the token to the Bridge;
it appears under **Settings → Devices**. Grant a folder there and the Bridge can
run file operations. **For production, keep `remote.urls` locked to the real
Corelyx domain.**

### Icons

The committed icons under `src-tauri/icons/` are placeholders generated from
`gen-icon.py` via `pnpm tauri icon icon-source.png`. Replace with real branding
by running `pnpm tauri icon path/to/logo.png` (1024×1024 PNG).

## Pairing (login-based — no token to copy)

The window loads the real Corelyx web app (`tauri.conf.json` →
`app.windows[0].url`). Pairing is automatic:

1. The user **logs in** to Corelyx inside the window, like the website.
2. The web app's `DesktopBridgeHandshake` detects the desktop shell, calls
   `POST /api/devices/register-self` for the signed-in session, and hands the
   minted device token to the native Bridge via the `set_device_token` command.
   The Bridge stores it and starts polling. The user never sees a token.
3. The user grants folders from **Settings → Devices**. Until then the device is
   inert — it can't touch any files.

For this to work, the hosted origin must be allowed to use IPC — see
`src-tauri/capabilities/main-capability.json` (the `remote.urls` allow-list) and
`withGlobalTauri: true`. **Validate this capability against your installed Tauri
version** — if remote IPC is not permitted, the app still works as a plain window
onto the web app; only the auto-pair step is skipped. A manual `pair` command
remains for advanced/headless use.

## Troubleshooting

- **`brotli` fails to compile (`StandardAlloc: Allocator<…> is not satisfied`)** —
  `alloc-stdlib` 0.2.3 bumped `alloc-no-stdlib` to 3.0, clashing with the 2.x that
  brotli 8.0.3 (Tauri's asset compressor) uses. `Cargo.lock` pins `alloc-stdlib`
  to 0.2.2 to fix it; keep that pin (don't `cargo update` it away). The committed
  `Cargo.lock` is authoritative for this app.

## Not yet in Phase 1 (tracked for later)

- Tray icon with live status (loop + status struct are already in place).
- OS keychain token storage.
- Realtime push instead of polling (latency optimisation; the runtime already
  has the Realtime+poll wait on its side).
- Native OS folder-picker for granting folders from inside the app (today the
  user types/grants paths on the web Settings → Devices page).
- Auto-update + code signing / notarization.
