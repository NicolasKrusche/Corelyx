"use client";

import { useEffect, useState } from "react";

/**
 * Polls /api/status and reloads the page the moment maintenance clears, so users
 * never have to guess when to come back — the page lets them in automatically.
 * Reloading the current URL works because middleware *rewrites* (not redirects)
 * to the maintenance page, so location.reload() retries the original destination.
 */
export function MaintenanceAutoRecover({ area }: { area?: string }) {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let stopped = false;
    const url = area ? `/api/status?area=${encodeURIComponent(area)}` : "/api/status";

    async function check() {
      if (stopped) return;
      try {
        setChecking(true);
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { maintenance?: boolean };
          if (!stopped && data.maintenance === false) {
            window.location.reload();
            return;
          }
        }
      } catch {
        // Offline or transient — keep polling.
      } finally {
        if (!stopped) setChecking(false);
      }
    }

    const interval = setInterval(check, 15_000);
    // Also re-check when the user returns to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [area]);

  return (
    <p className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-400">
      <span
        className={`h-2 w-2 rounded-full bg-amber-500 ${checking ? "animate-pulse" : ""}`}
        aria-hidden
      />
      This page refreshes automatically when we&apos;re back.
    </p>
  );
}
