"use client";

import { useEffect, useState } from "react";

/*
 * Renders a UTC instant in the *viewer's* timezone.
 *
 * Timestamps like triggers.next_run_at are genuine UTC instants (TIMESTAMPTZ).
 * Formatting them inside a server component resolves Intl against the server's
 * zone — UTC in production — and bakes that into the SSR HTML, so a 09:00
 * Europe/Vienna run rendered as "7:00 AM". Formatting has to happen on the
 * client, where the viewer's zone is actually known.
 *
 * Returns the fallback on the server and during hydration, then the real local
 * string after mount, so server and client markup match (same approach as
 * useClientCreationDate in components/compliance/public-compliance-tool.tsx).
 */

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function LocalDateTime({
  value,
  fallback = "Never",
  options = DEFAULT_OPTIONS,
  withTitle = false,
}: {
  value: string | null;
  /** Shown when `value` is null, and on the server/first paint. */
  fallback?: string;
  options?: Intl.DateTimeFormatOptions;
  /** Adds a title with the full local date and the viewer's zone name. */
  withTitle?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const [title, setTitle] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!value) {
      setText(null);
      setTitle(undefined);
      return;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      setText(null);
      setTitle(undefined);
      return;
    }
    // Locale stays "en" to match the rest of the UI; omitting timeZone is what
    // does the work here — on the client that resolves to the viewer's zone.
    setText(new Intl.DateTimeFormat("en", options).format(date));
    if (withTitle) {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTitle(`${date.toLocaleString("en")}${zone ? ` (${zone})` : ""}`);
    }
    // A caller passing a fresh `options` literal each render just re-runs this
    // and sets the same strings back, which React bails out of — no loop.
  }, [value, withTitle, options]);

  return (
    <span suppressHydrationWarning title={title}>
      {text ?? fallback}
    </span>
  );
}
