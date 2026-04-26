"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "corelyx-cookie-notice-dismissed";
const LEGACY_STORAGE_KEY = "corelyx-consent";

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed =
      window.localStorage.getItem(STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_STORAGE_KEY);

    setVisible(!dismissed);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="leading-relaxed">
          We only use essential authentication cookies and saved interface
          preferences. We do not load analytics, advertising, or other optional
          trackers. See our{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(STORAGE_KEY, "dismissed");
            window.localStorage.removeItem(LEGACY_STORAGE_KEY);
            setVisible(false);
          }}
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
