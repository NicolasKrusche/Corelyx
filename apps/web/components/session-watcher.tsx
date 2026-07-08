"use client";

import { useEffect } from "react";
import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Keeps every open window's auth state honest.
 *
 * The middleware authenticates from the cached JWT with no network call, and
 * PostgREST accepts any signature-valid JWT regardless of revocation — so a
 * session revoked elsewhere ("Sign out everywhere", a remote device revoke, a
 * password change) is invisible to an already-open window until its access
 * token expires (~1h). The user appears to stay logged in.
 *
 * This watcher (mounted on every authenticated page, browser and desktop
 * shell alike) closes the gap:
 *   1. it listens for SIGNED_OUT — fired when this tab's auto-refresh hits the
 *      revoked refresh token, or broadcast from another tab of the same
 *      browser — and sends the window to /login; and
 *   2. to catch a revocation started on another device, it re-verifies the
 *      session against the auth server (getUser checks the sessions table;
 *      getSession only decodes the JWT) when the window regains focus and on
 *      a slow interval. A revoked session gets a definitive 4xx verdict; the
 *      dead local session is cleared before redirecting so the middleware's
 *      cookie check can't bounce /login back into the app.
 *
 * Only definitive auth-server verdicts sign the user out. Transient failures
 * (laptop waking before wifi, auth-server hiccups, rate limits) keep the
 * session and re-check on the next tick.
 */

const VERIFY_INTERVAL_MS = 4 * 60 * 1000; // re-verify at least every 4 minutes
const MIN_VERIFY_GAP_MS = 30 * 1000; // don't thrash on rapid focus changes

// Auth API statuses that mean "this session no longer exists" (session_not_found,
// revoked refresh token, deleted user). Deliberately excludes 429 (rate limit).
const SESSION_DEAD_STATUSES = new Set([400, 401, 403, 404]);

export function SessionWatcher() {
  useEffect(() => {
    const supabase = createBrowserClient();
    let redirecting = false;
    let lastVerify = 0;

    function toLogin() {
      if (redirecting) return;
      redirecting = true;
      window.location.href = "/login";
    }

    // Clear the revoked-but-unexpired local session before redirecting: the
    // middleware trusts the cookie JWT, so navigating to /login with it still
    // set bounces straight back into the app.
    async function clearSessionAndLeave() {
      if (redirecting) return;
      redirecting = true;
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // cookies may already be gone — the redirect is what matters
      }
      window.location.href = "/login";
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") toLogin();
    });

    async function verify(force = false) {
      if (redirecting) return;
      const now = Date.now();
      if (!force && now - lastVerify < MIN_VERIFY_GAP_MS) return;
      lastVerify = now;
      try {
        const { error } = await supabase.auth.getUser();
        if (!error) return;
        if (
          isAuthSessionMissingError(error) ||
          (isAuthApiError(error) && SESSION_DEAD_STATUSES.has(error.status))
        ) {
          void clearSessionAndLeave();
        }
      } catch {
        // Treat thrown errors (network, cross-tab lock timeout) as transient.
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void verify();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    const interval = window.setInterval(() => void verify(true), VERIFY_INTERVAL_MS);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
