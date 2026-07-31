import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  readSystemFlags,
  isMaintenanceBypassAdmin,
  DEFAULT_MAINTENANCE_MESSAGE,
} from "@/lib/system-flags";
import { matchDisabledArea } from "@/lib/maintenance-areas";
import { isProtectedAppPath } from "@/lib/protected-app-routes";
import {
  MAINTENANCE_BYPASS_PARAM,
  MAINTENANCE_BYPASS_COOKIE,
  MAINTENANCE_BYPASS_COOKIE_OPTIONS,
  previewBypassConfigured,
  previewTokenMatches,
} from "@/lib/maintenance-bypass";

/**
 * Maintenance-mode + feature kill-switch gate, backed by the `system_settings`
 * DB row so it can be toggled at runtime without a redeploy.
 *
 * When full maintenance is on, the *signed-in app* goes dark for everyone except
 * admins (so they can verify fixes): app pages get a 503 maintenance page, API
 * requests get a 503 JSON body. The public marketing site (homepage, pricing,
 * docs, blog, legal/SEO pages) deliberately stays online throughout — it needs
 * no backend, and taking it down costs sign-ups and search rankings for an
 * outage that never affected it. When maintenance is off, individual feature
 * kill-switches can still soft-block specific API routes while the rest of the
 * app stays up.
 *
 * Returns a NextResponse to short-circuit the request, or null to continue.
 */

// Always reachable, even during full maintenance: framework assets, the
// maintenance page itself, health/status, internal runtime callbacks, the
// desktop Bridge's device-token endpoints, and the auth routes (so an admin can
// still log in to lift maintenance).
const EXEMPT_PREFIXES = [
  "/_next",
  "/static",
  "/favicon",
  "/maintenance",
  "/status",
  "/api/health",
  "/api/status",
  "/api/internal/",
  // Inngest Cloud executes scheduled/background functions (cron triggers,
  // data-retention purge, approval timeouts) by calling this endpoint. It
  // verifies its own request signatures (INNGEST_SIGNING_KEY), and blocking it
  // during maintenance silently stopped every background job.
  "/api/inngest",
  // The desktop Bridge authenticates with a per-device token (not a user
  // session), so it can never be the maintenance-bypass admin. Blocking it would
  // stall file operations + folder watches for the whole maintenance window — and
  // it's a trusted background worker, like the internal runtime callbacks above.
  "/api/bridge/",
  // The Corelyx Mobile bootstrap/registration routes authenticate a verified
  // Supabase access token or a crlxmob_ device token in-handler (no cookie
  // session, so never the bypass admin). The phone is a trusted first-party
  // client — monitoring, approvals, and 2FA must survive a maintenance window.
  // (Its calls to shared /api/* routes are exempted via the crlxmob_ bearer
  // check below.)
  "/api/mobile/",
  // Desktop download + auto-update must keep working during maintenance (the
  // updater has no session; users may still want to install).
  "/api/desktop/",
  "/download",
  "/login",
  "/signup",
  "/forgot-password",
  "/update-password",
  "/auth/",
  "/api/auth/",
];

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * A signed-in Corelyx Mobile app calls the shared /api/* routes with a crlxmob_
 * device token. Like the desktop Bridge, it's trusted first-party traffic that
 * should keep working during a maintenance window (an invalid token is still
 * rejected with 401 by the route, so exempting it here leaks nothing).
 */
function isTrustedMobileRequest(request: NextRequest): boolean {
  const auth = request.headers.get("authorization") ?? "";
  return /^Bearer\s+crlxmob_/i.test(auth.trim());
}

/** Minimal HTML escaping for values interpolated into the maintenance page. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Self-contained maintenance page served straight from middleware so it can
 * carry a real HTTP 503.
 *
 * The old path rewrote to the /maintenance App Router page, but a rewrite always
 * emits 200 — Next takes the final status from the rendered destination, not
 * from the middleware response, so `rewrite(url, { status: 503 })` does not
 * work. A 200 told Google the thin "we'll be right back" page WAS each URL's
 * real content, and it deindexed the live marketing/SEO pages (impressions
 * collapse). A 503 + Retry-After signals a temporary outage so crawlers hold
 * rankings and return later. Inline <style> is permitted by our CSP
 * (style-src 'unsafe-inline'); the meta refresh recovers the page for humans.
 */
function maintenanceHtml(title: string, message: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="30">
<title>${safeTitle}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; padding: 64px 24px; background: #f9fafb;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif; color: #111827; }
  .card { width: 100%; max-width: 28rem; text-align: center; }
  .icon { margin: 0 auto 24px; height: 64px; width: 64px; display: flex;
    align-items: center; justify-content: center; border-radius: 16px;
    background: #fef3c7; }
  .icon svg { height: 32px; width: 32px; color: #d97706; }
  h1 { margin: 0; font-size: 1.5rem; line-height: 2rem; font-weight: 600; }
  p { margin: 12px 0 0; color: #4b5563; line-height: 1.6; }
  a { display: inline-block; margin-top: 32px; font-size: .875rem;
    color: #9ca3af; text-decoration: none; }
  a:hover { color: #4b5563; text-decoration: underline; }
  .brand { margin-top: 8px; font-size: .875rem; color: #9ca3af; }
</style>
</head>
<body>
  <main class="card">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    </div>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <a href="/login">Team sign-in</a>
    <p class="brand">Corelyx</p>
  </main>
</body>
</html>`;
}

/** 503 maintenance response carrying the temporary-outage signal crawlers need. */
function maintenancePageResponse(title: string, message: string): NextResponse {
  return new NextResponse(maintenanceHtml(title, message), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Retry-After": "3600",
    },
  });
}

/** Decode the user's id/email from the cookie session (no network call). */
async function readSessionIdentity(
  request: NextRequest
): Promise<{ userId: string | null; email: string | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return { userId: null, email: null };

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // Read-only here: maintenance gate never needs to refresh cookies.
        setAll(_cookies: { name: string; value: string; options: CookieOptions }[]) {},
      },
    });
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    return { userId: user?.id ?? null, email: user?.email ?? null };
  } catch {
    return { userId: null, email: null };
  }
}

export async function maintenanceGate(request: NextRequest): Promise<NextResponse | null> {
  const flags = await readSystemFlags();
  const { pathname } = request.nextUrl;

  // ── Full-app maintenance ──────────────────────────────────────────────────
  if (flags.maintenanceMode) {
    // Tester preview bypass: an unguessable token lets one trusted tester
    // browse the live app while maintenance stays ON for everyone else. The
    // token is matched against a stored hash (DB primary, env fallback).
    const previewHash = flags.previewBypassHash;
    if (previewBypassConfigured(previewHash)) {
      // Already granted via the httpOnly cookie from a prior valid hit.
      if (await previewTokenMatches(request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value, previewHash)) {
        return null;
      }
      // First hit carries the token in the URL: grant a cookie, then redirect
      // to the same URL without the token so it doesn't linger in the address
      // bar, browser history, referer headers, or server logs.
      const provided = request.nextUrl.searchParams.get(MAINTENANCE_BYPASS_PARAM);
      if (provided && (await previewTokenMatches(provided, previewHash))) {
        const url = request.nextUrl.clone();
        url.searchParams.delete(MAINTENANCE_BYPASS_PARAM);
        const response = NextResponse.redirect(url);
        response.cookies.set(
          MAINTENANCE_BYPASS_COOKIE,
          provided,
          MAINTENANCE_BYPASS_COOKIE_OPTIONS
        );
        return response;
      }
    }

    if (isExempt(pathname) || isTrustedMobileRequest(request)) return null;

    // Only the signed-in app + its APIs go dark. Everything else is the public
    // marketing/SEO site, which keeps serving normally (see the header comment).
    // Allowlist-by-omission is deliberate but guarded: protected-app-routes.ts is
    // kept in sync with the route-group directories by its own test.
    if (!isProtectedAppPath(pathname) && !pathname.startsWith("/api/")) return null;

    const { userId, email } = await readSessionIdentity(request);
    if (await isMaintenanceBypassAdmin(userId, email)) {
      return null; // admins browse normally to verify the fix
    }

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "SERVICE_UNAVAILABLE",
          message: flags.maintenanceMessage || DEFAULT_MAINTENANCE_MESSAGE,
        },
        { status: 503, headers: { "Retry-After": "120" } }
      );
    }

    return maintenancePageResponse(
      "We'll be right back",
      flags.maintenanceMessage || DEFAULT_MAINTENANCE_MESSAGE
    );
  }

  // ── Scoped maintenance: individual areas disabled, rest of app stays up ────
  const blockedArea = matchDisabledArea(flags, pathname, request.method);
  if (blockedArea) {
    if (isExempt(pathname)) return null;

    // Admins bypass scoped blocks too, so they can fix/verify the area.
    const { userId, email } = await readSessionIdentity(request);
    if (await isMaintenanceBypassAdmin(userId, email)) return null;

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "FEATURE_DISABLED",
          area: blockedArea.key,
          message: `${blockedArea.label} is temporarily disabled for maintenance.`,
        },
        { status: 503, headers: { "Retry-After": "120" } }
      );
    }

    return maintenancePageResponse(
      `${blockedArea.label} is under maintenance`,
      `${blockedArea.description} This part of Corelyx is temporarily unavailable — please try again shortly.`
    );
  }

  return null;
}
