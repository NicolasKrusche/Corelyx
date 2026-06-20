import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  readSystemFlags,
  isMaintenanceBypassAdmin,
  DEFAULT_MAINTENANCE_MESSAGE,
} from "@/lib/system-flags";
import { matchDisabledArea } from "@/lib/maintenance-areas";
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
 * When full maintenance is on, everyone is blocked except admins (so they can
 * verify fixes): page requests are rewritten to /maintenance, API requests get
 * a 503. When maintenance is off, individual feature kill-switches can still
 * soft-block specific API routes while the rest of the app stays up.
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
  // The desktop Bridge authenticates with a per-device token (not a user
  // session), so it can never be the maintenance-bypass admin. Blocking it would
  // stall file operations + folder watches for the whole maintenance window — and
  // it's a trusted background worker, like the internal runtime callbacks above.
  "/api/bridge/",
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

    if (isExempt(pathname)) return null;

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

    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    return NextResponse.rewrite(url);
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

    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    url.searchParams.set("area", blockedArea.key);
    return NextResponse.rewrite(url);
  }

  return null;
}
