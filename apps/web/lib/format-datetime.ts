/**
 * Timestamp formatting shared by server and client components.
 *
 * `new Date(iso).toLocaleString()` with no locale resolves against whatever
 * environment runs it — the Node server (en-US) for a server component, the
 * browser (whatever the user has set) for a client one. The run log rendered
 * both on the same screen, so "Started" read "8/4/2026, 9:00:33 PM" while the
 * failure panel right below it read "5.8.2026, 20:38:59". Pinning the locale
 * makes the two agree and keeps hydration stable.
 */
const LOCALE = "en-US";

/** "Aug 4, 2026, 9:00:33 PM" — full precision, for run metadata. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = new Date(iso);
  if (Number.isNaN(ts.getTime())) return "—";
  return ts.toLocaleString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "Aug 4, 2026, 9:00 PM" — for secondary timestamps where seconds are noise. */
export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ts = new Date(iso);
  if (Number.isNaN(ts.getTime())) return "—";
  return ts.toLocaleString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
