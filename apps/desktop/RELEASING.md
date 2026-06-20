# Releasing Corelyx Desktop

Distribution + auto-update are wired up. This is what's automated and the few
manual steps left for you.

## How it works

The desktop app is a thin shell: it loads `corelyx.app` in a window + runs the
Rust Bridge. So:

- **Web/UI/API changes ship with your normal Vercel deploy** — no desktop release.
- **You only cut a desktop release when the Rust (`src-tauri/`) changes** — the
  Bridge: file ops, the folder watcher, snapshots/rollback, pairing/IPC.

Auto-update: on launch (release builds only) the app checks
`corelyx.app/api/desktop/update`, which proxies the signed `latest.json` from your
GitHub release. If a newer version exists it downloads it, **verifies the
signature against the public key baked into `tauri.conf.json`**, installs, and
relaunches. A bad/forged update can't install without the private signing key.

First install: send people to **`corelyx.app/download`** — it detects their OS and
links the right installer via `/api/desktop/download`.

## Already done (committed)

- Updater plugin wired (`tauri-plugin-updater`, launch-time check in `main.rs`,
  `plugins.updater` in `tauri.conf.json` with `createUpdaterArtifacts: true`).
- **Updater keypair generated.** Public key is in `tauri.conf.json`; private key is
  in `src-tauri/.tauri-updater.key` (gitignored — password-less).
- Window points at `https://corelyx.app`; capability allows it.
- Web: `/download` page, `/api/desktop/update` (manifest proxy),
  `/api/desktop/download` (installer redirect) — all public + maintenance-exempt.
- CI: `.github/workflows/desktop-release.yml` (build matrix → sign → draft release
  with `latest.json`).

## Manual steps (one-time)

1. **Push the monorepo to GitHub.**

2. **Vercel env var** (so the update/download routes resolve your release):
   ```
   DESKTOP_RELEASES_REPO = your-org/your-repo
   ```

3. **GitHub Actions secrets** (Settings → Secrets and variables → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` = the full contents of
     `apps/desktop/src-tauri/.tauri-updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = `` (empty — the key is password-less)

   > Keep `.tauri-updater.key` safe and backed up. If you lose it, existing installs
   > can no longer auto-update (they'd need a fresh download).

4. **(Optional) Code signing** — without it, users see "unknown publisher" /
   Gatekeeper warnings but the app still installs:
   - **macOS** (required to avoid Gatekeeper blocking): Apple Developer Program
     ($99/yr) → Developer ID Application cert → add the `APPLE_*` secrets listed at
     the top of the workflow.
   - **Windows**: an Authenticode cert; set `bundle.windows.certificateThumbprint`
     (+ `signCommand` if using a cloud HSM) in `tauri.conf.json`.

## Cutting a release

1. Bump `version` in `apps/desktop/src-tauri/tauri.conf.json`.
2. Tag and push:
   ```bash
   git tag desktop-v0.2.0 && git push origin desktop-v0.2.0
   ```
3. The workflow builds all three OSes, signs the update artifacts, and creates a
   **draft** GitHub Release with the installers + `latest.json`.
4. Review and **publish** the draft. Installed apps pick up the update on their
   next launch.

> The very first release won't auto-update anything (there's nothing older to
> update). Auto-update kicks in from the second release onward.
