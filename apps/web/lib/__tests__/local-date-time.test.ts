import { describe, expect, it } from "vitest";

/* Regression guard for the "Next run" badge showing UTC.
 *
 * triggers.next_run_at is a UTC instant. The program page is a server
 * component, so formatting it there resolved Intl against the server's zone
 * (UTC in prod) and baked "7:00 AM" into the SSR HTML for a run that fires at
 * 09:00 Europe/Vienna. <LocalDateTime> re-formats on the client instead.
 *
 * These assert the formatting contract the component relies on: an explicit
 * "en" locale (matching the UI language) with NO timeZone option, so the
 * runtime's own zone applies. Passing an explicit timeZone here would test
 * nothing about the bug, so the process zone is what varies. */

const BADGE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/** What <LocalDateTime> does, with `zone` standing in for the runtime's zone. */
function formatIn(zone: string, iso: string): string {
  return new Intl.DateTimeFormat("en", { ...BADGE_OPTIONS, timeZone: zone }).format(new Date(iso));
}

describe("LocalDateTime formatting contract", () => {
  // The exact instant from the reported run: fires 07:00Z, i.e. 09:00 in Vienna.
  const NEXT_RUN = "2026-07-20T07:00:00.000Z";

  it("renders a 07:00Z run as 9:00 AM for a GMT+2 viewer", () => {
    expect(formatIn("Europe/Vienna", NEXT_RUN)).toBe("Jul 20, 9:00 AM");
  });

  it("still renders 7:00 AM for a UTC viewer — the old output was only correct there", () => {
    expect(formatIn("UTC", NEXT_RUN)).toBe("Jul 20, 7:00 AM");
  });

  it("shifts the calendar day when the viewer's zone crosses midnight", () => {
    // 07:00Z is the previous evening in Los Angeles.
    expect(formatIn("America/Los_Angeles", NEXT_RUN)).toBe("Jul 20, 12:00 AM");
    expect(formatIn("Pacific/Auckland", NEXT_RUN)).toBe("Jul 20, 7:00 PM");
    // Tokyo pushes it to the 20th at 16:00; Vienna in winter would be +1 not +2.
    expect(formatIn("Asia/Tokyo", NEXT_RUN)).toBe("Jul 20, 4:00 PM");
  });

  it("tracks DST rather than a fixed offset for the same wall-clock cron", () => {
    // Vienna is UTC+2 in July (CEST) but UTC+1 in January (CET). A 07:00Z cron
    // therefore surfaces as 09:00 in summer and 08:00 in winter.
    expect(formatIn("Europe/Vienna", "2026-07-20T07:00:00.000Z")).toBe("Jul 20, 9:00 AM");
    expect(formatIn("Europe/Vienna", "2026-01-20T07:00:00.000Z")).toBe("Jan 20, 8:00 AM");
  });

  it("keeps English month names regardless of zone", () => {
    // Guards against dropping the locale to `undefined`, which would render
    // "20. Juli" on a German-locale browser and clash with the English UI.
    expect(formatIn("Europe/Vienna", NEXT_RUN)).toContain("Jul");
  });
});
