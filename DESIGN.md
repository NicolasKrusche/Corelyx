# DESIGN.md

This file documents the visual design system for Corelyx. Reference it when making UI changes to maintain consistency.

---

## Design Philosophy

Dark, premium, and operational. The aesthetic borrows from liquid marble — organic depth, glowing color beneath glass surfaces, subtle motion. It should feel alive without feeling distracting. This is a compliance-focused B2B product, so restraint matters: no garish effects, no animations that compete with data.

---

## Background System

Three layers compose the background, stacked in z-index order:

| Layer | Class / Element | z-index | Purpose |
|---|---|---|---|
| Base | `.app-bg-gradient` (fixed, inset-0) | -10 | Dark background + static ambient gradients |
| Orbs | `.orb-primary`, `.orb-blue`, `.orb-violet` (fixed) | -9 | Animated color blobs that drift slowly |
| Texture | Inline `<svg feTurbulence>` (fixed) | -9 | Marble grain at 9% opacity, fades at ~70% height |

**Critical:** The outer app wrapper div must NOT have `bg-background` — if it does, it paints over the negative-z-index orbs at paint step 5 of the root stacking context. The `app-bg-gradient` div provides the dark base instead.

### Animated Orbs

Defined in `globals.css` as `.orb-primary` (orange, top-right), `.orb-blue` (blue, bottom-left), `.orb-violet` (violet, mid-right). Each uses `@keyframes orb-drift` on independent cycle lengths (16s / 21s / 26s) with offsets so they never synchronise.

Current opacities: primary 0.22, blue 0.18, violet 0.14. These are the tuned values — going higher looks overdone, lower becomes invisible.

### Marble Texture

An inline SVG `<feTurbulence>` element in `(app)/layout.tsx`. Must be inline (not a CSS `background-image` data URI) — browsers do not apply SVG filters in that context. Parameters: `baseFrequency="0.008 0.005"`, `numOctaves="6"`, `seed="42"`. High `feComponentTransfer` slope/intercept creates vein-like contrast rather than smooth noise.

---

## Glass Surface System

Two utility classes in `globals.css`:

```css
.glass-card   /* cards, list items, feature tiles */
.glass-panel  /* large containers, tables, section wrappers */
```

Both use `backdrop-filter: blur()` + semi-transparent white background + white border. The blur is intentionally low (8px / 6px) so the animated orbs bleed through the glass visibly — higher blur kills the effect.

Always keep the Tailwind `border` class alongside `glass-card`/`glass-panel` (sets border-width). Remove `border-border` and `bg-card` when applying glass. Example:

```tsx
// Before
<div className="rounded-xl border border-border bg-card px-5 py-4">
// After
<div className="rounded-xl border glass-card px-5 py-4">
```

Light mode overrides exist (`.light .glass-card`, `.light .glass-panel`) — they use 60%/50% white opacity since there's no dark background to blur through.

---

## Color System

Defined as CSS custom properties in `globals.css`. Dark mode is the default (`:root, .dark`). Light mode requires `.light` class on `<html>`.

### Accent Themes

Applied as a class on `<html>` alongside the base theme. Six options: `accent-orange` (default for landing/auth), `accent-blue` (default for app), `accent-indigo`, `accent-green`, `accent-pink`, `accent-cyan`. Each sets `--primary`, `--primary-foreground`, and `--ring`.

The anti-flash script in the root layout reads `localStorage` keys `corelyx-base` and `corelyx-accent` and applies classes before first paint. Landing and auth pages are forced to `light accent-orange` regardless of user preference.

---

## Animation Conventions

### Orb Drift
```css
@keyframes orb-drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%       { transform: translate(4%, 5%) scale(1.07); }
  66%       { transform: translate(-3%, 2%) scale(0.95); }
}
```
GPU-composited (transform + opacity only). Never animate background-color or filter directly.

### Status Indicators
Active/healthy program dots use Tailwind `animate-ping` at `[animation-duration:2.5s]` — slower than the default 1s to avoid feeling alarming. Pattern:

```tsx
<span className="relative flex h-1.5 w-1.5 shrink-0">
  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-40 [animation-duration:2.5s]" />
  <span className="relative h-1.5 w-1.5 rounded-full bg-green-500" />
</span>
```

Only apply to green (healthy/active) states. Red failure dots stay static — pulsing a failure indicator reads as alarming.

---

## Typography

Font: Inter (via `next/font/google`), variable `--font-inter`, applied as `font-sans` on `<body>`. No custom type scale — uses Tailwind defaults.

Key conventions:
- Section labels: `text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60`
- Card metadata: `text-[11px] text-muted-foreground/60`
- Hero h1: `text-3xl font-bold tracking-tight` with italic muted secondary line

---

## Component Patterns

### Dashboard Stats Cards
Four-column grid, `glass-card`, large tabular number with label above and sub-note below. Progress bar on the runs card uses `bg-primary` normally, `bg-yellow-500` at 80%, `bg-destructive` at 90%.

### Pinned Agent Cards
`glass-card` with hover `-translate-y-0.5` lift and `shadow-primary/10`. Contains: icon badge, title, description, status badges, colored node dots, footer with status dot + last run time.

### Empty / First-run States
Dashed border variant: `border border-dashed border-white/[0.08] bg-white/[0.02] backdrop-blur-md`. Hover: `hover:border-primary/40 hover:bg-white/[0.05]`.

---

## Files to Know

| File | Role |
|---|---|
| `apps/web/app/globals.css` | All design tokens, glass classes, orb animations, marble texture config |
| `apps/web/app/(app)/layout.tsx` | Orb divs, marble SVG, background layer — the whole background stack lives here |
| `apps/web/app/(app)/dashboard/page.tsx` | Reference implementation of glass-card, glass-panel, pulsing dots |
| `apps/web/components/sidebar.tsx` | Intentionally NOT glassmorphism — has its own separate dark panel design |
| `apps/web/components/ui/card.tsx` | Base shadcn Card — do NOT add glass here, it would affect every card globally |
