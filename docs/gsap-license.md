# GSAP License Determination

**Package:** `gsap@^3.15.0` (dependency of `apps/web`)
**License:** GreenSock "Standard" (No Charge) License — **proprietary, not an OSI-approved open-source license**
**Reviewed:** 2026-07-24
**Determination:** Approved for our current use.

## Why this needs a separate note

Most of our JavaScript dependencies are permissive OSI licenses (MIT / Apache-2.0 /
BSD / ISC). GSAP is the exception in the web bundle: it ships under GreenSock's own
**Standard "No Charge" License**, which is a proprietary license, not open source.
It is easy to mis-file GSAP as MIT because it is distributed on npm — hence this
explicit record.

## What the license permits (as reviewed)

- **Free commercial use since GSAP 3.13.** As of GSAP 3.13 (May 2025), GreenSock
  (now under Webflow) made the full toolset — including the previously
  "Club GreenSock"-only plugins — free to use, including in commercial projects,
  under the Standard No-Charge License. Our pinned range `^3.15.0` resolves to
  3.13 or later, so our usage falls under these free terms.
- We use GSAP only in the **client-side cinematic landing page** animation
  (`apps/web/app/_landing/**`). We do not resell GSAP, expose it as a competing
  API, or redistribute it as a standalone library.

## The restriction that still applies

The Standard No-Charge License is **not** permissive in the OSI sense. The key
restriction we must continue to honor:

- **No-compete / no-repackaging:** GSAP may not be used to build a product that
  competes with GreenSock, and it may not be redistributed as part of a product
  whose primary purpose is to provide animation tooling to others (i.e. you may
  not repackage or resell GSAP itself). Using it to animate our own product UI
  is fine; shipping it as a feature others script against is not.
- Because it is proprietary, GSAP is **excluded from any "open-source" attribution
  bucket** and is tracked here instead. If we ever ship GSAP inside a distributed
  binary (desktop/mobile), re-confirm the redistribution terms for that channel.

## Follow-up triggers (re-review if any of these change)

- We adopt a GreenSock plugin or bonus tool with different terms.
- We build any feature that lets end users create/export animations (possible
  no-compete concern).
- GreenSock/Webflow changes the license for a future major version.

## References

- GreenSock Standard "No Charge" License: https://gsap.com/community/standard-license/
- GSAP 3.13 "now 100% free" announcement (Webflow): https://gsap.com/pricing/

*This is an internal license-hygiene record, not legal advice.*
