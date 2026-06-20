"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { isDesktop } from "@/lib/desktop-bridge";

/**
 * Keeps the desktop window's auth state honest.
 *
 * The middleware authenticates from the cached JWT with no network call, so a
 * session revoked elsewhere — "Sign out everywhere", a remote device revoke, a
 * password change — is invisible to the always-open desktop window until its
 * access token expires (~1h). The user appears to stay logged in. In a normal
 * browser this self-corrects on the next navigation; the desktop window may sit
 * on one page for hours and never re-check.
 *
 * This watcher (desktop shell only) closes the gap:
 *   1. it listens for SIGNED_OUT and sends the window to /login; and
 *   2. to catch a sign-out started on another device, it forces a session refresh
 *      when the window regains focus and on a slow interval. The revoked refresh
 *      token makes that refresh fail, which both returns no session and fires
 *      SIGNED_OUT — either path lands the user on /login.
 *
 * In a normal browser `isDesktop()` is false and this is an inert no-op.
 */

const REFRESH_INTERVAL_MS = 4 * 60 * 1000; // re-verify at least every 4 minutes
const MIN_VERIFY_GAP_MS = 30 * 1000; // don't thrash on rapid focus changes

export function DesktopSessionWatcher() {
  useEffect(() => {
    if (!isDesktop()) return;

    const supabase = createBrowserClient();
    let redirecting = false;
    let lastVerify = 0;

    function toLogin() {
      if (redirecting) return;
      redirecting = true;
      window.location.href = "/login";
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") toLogin();
    });

    // Force a server round-trip that fails if the session was revoked elsewhere.
    async function verify(force = false) {
      if (redirecting) return;
      const now = Date.now();
      if (!force && now - lastVerify < MIN_VERIFY_GAP_MS) return;
      lastVerify = now;
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session) toLogin();
      } catch {
        toLogin();
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void verify();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    const interval = window.setInterval(() => void verify(true), REFRESH_INTERVAL_MS);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
