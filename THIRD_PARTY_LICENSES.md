# Third-Party Licenses & Notices

**Last reviewed:** 2026-07-24

Corelyx is proprietary software (see [`LICENSE`](./LICENSE)), but it is built with,
and its distributed artifacts bundle, third-party open-source components.

## Why this file exists (the obligation)

Permissive open-source licenses — **MIT, BSD (2/3-clause), ISC, Apache-2.0** — are
free to use commercially but are **not "no strings attached."** They require that
the original copyright notice and license text be **preserved and reproduced in
distributions** of the software. Apache-2.0 additionally requires carrying any
`NOTICE` file and stating significant changes. Weak-copyleft licenses (**LGPL,
MPL-2.0**) add conditions when their covered files are modified or statically
linked.

Two of our artifacts are **distributions** in the license sense and therefore must
ship attribution:

- the **desktop app** (Tauri / Rust + web bundle), and
- the **mobile app** (Expo / React Native APK & IPA).

The web application is delivered as a hosted service (SaaS). Client-side JS is
still served to browsers, so we keep attribution for the web bundle too, but the
binaries above are where notice preservation is legally load-bearing.

> **Status:** This file is the high-level inventory and the process record. A
> machine-generated, complete `NOTICE`/attribution file is **not yet wired into
> the desktop and mobile build pipelines** — that is the tracked follow-up in the
> "Generating the full notices" section below.

## License inventory (high level)

Full dependency-by-dependency data must come from the generators below; this is
the reviewed summary.

### JavaScript / TypeScript (`apps/web`, `apps/mobile`, packages)

- **Vast majority MIT** (~700 packages), then **Apache-2.0** (~110), with the
  remainder **BSD-2/3-Clause, ISC, MPL-2.0, BlueOak-1.0.0, CC0**. No AGPL, SSPL,
  BUSL, or unlicensed packages were found in the JS tree.
- **`jszip` — dual-licensed MIT OR GPL-2.0.** We elect the **MIT** option; no GPL
  obligations attach under that election. Record the MIT election in the generated
  notice.
- **`sharp` → bundles `libvips` (LGPL-3.0).** `sharp` itself is Apache-2.0. It is
  pulled in transitively (image handling, incl. Next.js image optimization) and
  used **server-side without modification and dynamically linked**, so LGPL
  redistribution conditions are satisfied by not modifying libvips and keeping it
  replaceable. Re-check if `sharp`/`libvips` is ever statically bundled into a
  shipped desktop/mobile binary.
- **`gsap@^3.15.0` — PROPRIETARY (GreenSock Standard "No Charge" License), not
  OSI open source.** Free for commercial use since GSAP 3.13, subject to a
  no-compete/no-repackaging restriction. It is intentionally **excluded from the
  open-source buckets above** and documented separately in
  [`docs/gsap-license.md`](./docs/gsap-license.md).

### Python (`apps/runtime`)

- Runtime Python dependencies reviewed as **MIT / BSD / Apache-2.0**. No copyleft
  (GPL/AGPL/LGPL) Python packages found.
- The spaCy model `xx_ent_wiki_sm` (used server-side for NER) carries its own
  model license (CC BY-SA / MIT depending on component) — server-side use only;
  it is not redistributed to clients.

### Rust (desktop app — Tauri)

- **Not yet fully verified.** The Rust/Cargo dependency tree of the desktop app
  must be enumerated with `cargo about` / `cargo license` and its notices bundled
  before desktop General Availability. Tauri and the typical Rust ecosystem are
  predominantly MIT/Apache-2.0, but this must be confirmed, not assumed.

### Fonts & assets

- Self-hosted **Inter** font — SIL Open Font License (OFL); redistribution allowed
  with the OFL notice.
- Product logos and generated SVG textures are our own.
- **Connector/provider logos are third-party trademarks** used for identification
  only (see the non-affiliation disclaimer in the site footer and the note in
  `apps/web/lib/provider-icons.ts`). These are brand assets, not OSS, and are not
  covered by this file.

## Generating the full notices (follow-up to wire into CI)

Run these at release time and commit/bundle the output into each distributed
artifact. This is the outstanding automation task.

```bash
# JS/TS — full license list across the pnpm workspace
pnpm licenses list --json > third-party-licenses.js.json
#   (human-readable: pnpm licenses list)

# Rust (desktop / Tauri) — generate an attribution file from a template
cargo install cargo-about
cargo about generate about.hbs > apps/desktop/THIRD_PARTY_NOTICES.html
#   (quick audit alternative: cargo install cargo-license && cargo license)

# Cross-ecosystem license detection at the repo/package level
licensee detect .        # (github/licensee) — confirms declared vs detected
```

Recommended pipeline wiring:

1. **Desktop (Tauri):** `cargo about generate` in the desktop build, embedding a
   "Third-Party Notices" view/menu item in the app, plus `pnpm licenses list` for
   its web bundle.
2. **Mobile (Expo):** `pnpm licenses list` output shipped as an in-app
   "Open-source licenses" screen (a common RN/Expo pattern) reachable from the
   account/legal area.
3. **Web:** optionally publish a `/licenses` page generated from
   `pnpm licenses list`.
4. **CI gate:** fail the build if a new dependency introduces a
   copyleft/network-copyleft (AGPL/SSPL/BUSL) or unlicensed package.

## References

- Apache-2.0 §4 (redistribution / NOTICE): https://www.apache.org/licenses/LICENSE-2.0
- pnpm licenses: https://pnpm.io/cli/licenses
- cargo-about: https://github.com/EmbarkStudios/cargo-about
- licensee: https://github.com/licensee/licensee

*This is an internal license-hygiene record, not legal advice.*
