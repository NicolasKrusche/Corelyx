# Performance Improvements Guide

This document explains why the site may feel slow and what to change to improve load time. It is intentionally documentation-only.

## What is likely slowing the site now

### 1) Middleware does expensive auth work for almost every request

Evidence:
- `apps/web/middleware.ts` calls `supabase.auth.getUser()` inside middleware.
- It does this even for public routes (`/`, `/pricing`, `/privacy`, etc.), because the call happens before any early return for public pages.
- Middleware also logs path, user, and cookie summaries per request.

Why this hurts:
- Middleware runs in request path, so auth roundtrips add to TTFB.
- Per-request logging (especially cookie string formatting) increases server/edge overhead and log I/O.

### 2) Duplicate authentication checks happen across layers

Evidence:
- `apps/web/middleware.ts` checks session/user.
- `apps/web/app/(app)/layout.tsx` checks session/user again.
- Some pages also call `supabase.auth.getUser()` again (example: `apps/web/app/pricing/page.tsx`).

Why this hurts:
- Multiple user/session fetches for the same navigation increase latency and backend calls.

### 3) Landing page ships interactive client components on first load

Evidence:
- `apps/web/app/page.tsx` renders client components like `InteractiveFlowDiagram` and `ConsentBanner` directly.
- `apps/web/components/landing/interactive-flow-diagram.tsx` is a hydrated client component with drag handlers and animated SVG.

Why this hurts:
- Hydration JS and runtime work are paid on initial load, even before user interaction.

### 4) Unoptimized images on critical route

Evidence:
- `apps/web/app/page.tsx` uses raw `<img>` for logo instances.

Why this hurts:
- No automatic resizing, modern format negotiation, or priority tuning from `next/image`.

## How to verify bottlenecks before changing code

Run these checks first to baseline:

1. Lighthouse (mobile + desktop): capture FCP, LCP, TBT, TTFB.
2. Web Vitals in production-like environment: monitor LCP and INP.
3. Server timing around middleware path: measure auth and logging overhead.
4. `next build` output: inspect route JS sizes and shared chunks.

Suggested commands:

```bash
pnpm --filter @flowos/web build
pnpm --filter @flowos/web start
```

Then profile:
- Chrome DevTools Performance panel on landing page.
- Network waterfall for TTFB + blocking JS.

## Recommended fix plan (priority order)

### Priority A: Reduce middleware cost (highest impact)

1. Skip `supabase.auth.getUser()` on all explicitly public routes.
2. Remove verbose cookie/path logs from middleware in normal operation.
3. Restrict middleware matcher further so only protected app routes are checked.

Target outcome:
- Lower TTFB for public pages.
- Lower server/edge CPU and log overhead.

### Priority B: Remove duplicate auth roundtrips

1. Use one auth guard strategy per route segment.
2. For app-protected pages, centralize auth check in `app/(app)/layout.tsx`.
3. For public pages (for example pricing), avoid unconditional user lookups unless required for rendering.

Target outcome:
- Fewer Supabase auth calls per navigation.

### Priority C: Defer non-critical landing interactivity

1. Lazy-load heavy/non-critical client components with `next/dynamic` and `ssr: false` where appropriate.
2. Keep above-the-fold hero mostly server-rendered/static.
3. Start interactive diagram after initial paint or when in viewport.

Target outcome:
- Lower JS on initial route.
- Faster LCP and less main-thread blocking.

### Priority D: Optimize images and static assets

1. Replace critical `<img>` elements with `next/image`.
2. Add explicit `width`/`height`, `sizes`, and `priority` for hero/logo images.
3. Verify images are compressed and correctly sized for mobile.

Target outcome:
- Better image loading and LCP.

### Priority E: Control animation and hydration cost

1. Reduce always-running animations on initial frame for low-end devices.
2. Respect `prefers-reduced-motion` and pause non-essential decorative animations.
3. Avoid hydrating components that do not need client interactivity.

Target outcome:
- Better startup CPU, smoother first interaction.

## Suggested implementation sequence

1. Middleware public-route short-circuit + remove logs.
2. Consolidate duplicate auth checks.
3. Dynamic import for interactive landing modules.
4. Switch critical images to `next/image`.
5. Re-run Lighthouse and compare metrics.

## Success criteria

Track before/after:
- TTFB down on `/`, `/pricing`, `/privacy`.
- LCP down on landing page.
- Initial JS payload down on landing route.
- Fewer auth requests per page navigation.

## Notes for this codebase

Files to change when you decide to implement:
- `apps/web/middleware.ts`
- `apps/web/app/(app)/layout.tsx`
- `apps/web/app/pricing/page.tsx` (and other public pages with user fetches)
- `apps/web/app/page.tsx`
- `apps/web/components/landing/interactive-flow-diagram.tsx` (if deferring behavior)
