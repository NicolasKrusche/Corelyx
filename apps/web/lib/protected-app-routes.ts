// The signed-in product surface: every top-level path owned by the `(app)`,
// `(editor)` and `(onboarding)` route groups. Plain data + string matching, so
// it is edge-safe and usable from middleware.
//
// The maintenance gate uses this to keep the public marketing/SEO site online
// while the logged-in app goes dark: anything listed here (plus /api/) is
// blocked, everything else — homepage, pricing, docs, blog, legal pages — keeps
// serving 200s so crawlers and prospects never see the outage.
//
// `lib/__tests__/protected-app-routes.test.ts` reads the route-group directories
// off disk and fails if a new app route is added without listing it here, so the
// gate can't silently start leaking a signed-in page during maintenance.

/** Top-level segments of the `(app)` route group. */
const APP_GROUP_PREFIXES = [
  "/account",
  "/admin",
  "/agents",
  "/api-keys",
  "/approvals",
  "/browse",
  "/connections",
  "/credits",
  "/dashboard",
  "/env-vars",
  "/governance",
  "/logs",
  "/migrate",
  "/plan",
  "/profile",
  "/programs",
  "/runs",
  "/settings",
  "/support",
  "/updates",
  "/workspaces",
];

/** Top-level segments of the `(editor)` route group. */
const EDITOR_GROUP_PREFIXES = ["/programs"];

/** Top-level segments of the `(onboarding)` route group. */
const ONBOARDING_GROUP_PREFIXES = ["/onboarding"];

/**
 * Post-login steps that live outside the route groups but are still part of the
 * signed-in flow, not the public site.
 */
const EXTRA_APP_PREFIXES = ["/verify-2fa"];

export const PROTECTED_APP_PREFIXES: string[] = [
  ...new Set([
    ...APP_GROUP_PREFIXES,
    ...EDITOR_GROUP_PREFIXES,
    ...ONBOARDING_GROUP_PREFIXES,
    ...EXTRA_APP_PREFIXES,
  ]),
];

/** Route-group directory name → the prefixes the sync test expects from it. */
export const ROUTE_GROUP_PREFIXES: Record<string, string[]> = {
  "(app)": APP_GROUP_PREFIXES,
  "(editor)": EDITOR_GROUP_PREFIXES,
  "(onboarding)": ONBOARDING_GROUP_PREFIXES,
};

/**
 * True when the path belongs to the signed-in app. Matches the prefix exactly or
 * on a `/` boundary so `/api-keys` never swallows an unrelated `/api-keysomething`.
 */
export function isProtectedAppPath(pathname: string): boolean {
  return PROTECTED_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
