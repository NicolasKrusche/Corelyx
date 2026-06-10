"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const SPOTLIGHT_PADDING = 6;

export type GuidedTourStep = {
  id: string;
  /** Matches a [data-tour="..."] element. Omit for a centered modal step. */
  target?: string;
  placement?: "right" | "bottom";
  title: string;
  body: string;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Game-style guided tour: dims the page, spotlights one element at a time,
 * and explains it in a popup card. Starts when the URL has ?tour=1, or —
 * with autoStartOnce — the first time the page is visited (tracked via
 * doneKey in localStorage). The first step must be unanchored; it renders
 * as a larger branded welcome card.
 */
export function GuidedTour({
  steps,
  doneKey,
  autoStartOnce = false,
  expandSidebar = false,
  welcomeCta = "Show me around",
  welcomeDismiss = "I'll explore on my own",
  welcomeFootnote = "Takes about a minute · Esc leaves any time",
  finishLabel = "Done",
  finishDestination,
}: {
  steps: GuidedTourStep[];
  doneKey: string;
  /** Start automatically when doneKey is not set yet (first visit). */
  autoStartOnce?: boolean;
  /** Force the app sidebar open while the tour runs (dashboard tour). */
  expandSidebar?: boolean;
  welcomeCta?: string;
  welcomeDismiss?: string;
  welcomeFootnote?: string;
  finishLabel?: string;
  /** Where the final button navigates. Defaults to just closing the tour. */
  finishDestination?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    if (searchParams.get("tour") === "1") {
      setIndex(0);
      setActive(true);
      return;
    }
    if (!autoStartOnce) return;
    try {
      if (!localStorage.getItem(doneKey)) {
        // Mark seen at start, not finish — leaving the page mid-tour
        // shouldn't re-trigger it forever. ?tour=1 always replays.
        localStorage.setItem(doneKey, "1");
        setIndex(0);
        setActive(true);
      }
    } catch {
      /* ignore */
    }
  }, [searchParams, autoStartOnce, doneKey]);

  // Keep the app sidebar expanded while the tour points at it
  useEffect(() => {
    if (!active || !expandSidebar) return;
    window.dispatchEvent(new CustomEvent("corelyx:tour-start"));
    return () => {
      window.dispatchEvent(new CustomEvent("corelyx:tour-end"));
    };
  }, [active, expandSidebar]);

  const step = active ? steps[index] : undefined;

  const finish = useCallback(
    (destination?: string) => {
      setActive(false);
      setRect(null);
      try {
        localStorage.setItem(doneKey, "1");
      } catch {
        /* ignore */
      }
      // Strip ?tour=1 (or navigate onward) so the tour doesn't restart.
      router.replace(destination ?? pathname, { scroll: false });
    },
    [router, pathname, doneKey]
  );

  const next = useCallback(() => {
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [steps.length]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Measure the current target; if it isn't on screen (e.g. mobile, removed
  // element), silently skip past that step instead of stranding the tour.
  useEffect(() => {
    if (!active || !step) return;
    if (!step.target) {
      setRect(null);
      return;
    }

    // Bring off-screen targets into view once per step (long pages).
    document.querySelector(`[data-tour="${step.target}"]`)?.scrollIntoView({ block: "center" });

    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      if (!r || r.width < 4 || r.height < 4 || r.right < 0 || r.left > window.innerWidth) {
        setRect(null);
        setIndex((i) => (i >= steps.length - 1 ? i : i + 1));
        return;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    measure();
    // Re-measure on a short interval so the spotlight tracks layout
    // transitions and shifts without bespoke observers.
    const interval = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step, steps.length]);

  // Keyboard: Esc skips, arrows/Enter navigate
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (index >= steps.length - 1) finish(finishDestination);
        else next();
      } else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, index, next, back, finish, finishDestination, steps.length]);

  if (!active || !step) return null;

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const anchored = Boolean(step.target && rect);

  const cardWidth = anchored ? 340 : isFirst ? 460 : 420;
  let cardStyle: React.CSSProperties;
  if (anchored && rect) {
    const margin = 16;
    let top: number;
    let left: number;
    if (step.placement === "bottom") {
      top = rect.top + rect.height + SPOTLIGHT_PADDING + margin;
      left = rect.left;
    } else {
      left = rect.left + rect.width + SPOTLIGHT_PADDING + margin;
      top = rect.top - 8;
    }
    left = Math.min(Math.max(12, left), window.innerWidth - cardWidth - 12);
    top = Math.min(Math.max(12, top), window.innerHeight - 280);
    cardStyle = { position: "fixed", top, left, width: cardWidth };
  } else {
    cardStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: Math.min(cardWidth, typeof window !== "undefined" ? window.innerWidth - 32 : cardWidth),
    };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Backdrop. For anchored steps the spotlight element below carries the
          dimming via a giant box-shadow so the target stays bright. */}
      {anchored && rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-primary/80 transition-all duration-300 ease-out"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.62)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(2,6,23,0.62)]" />
      )}

      {/* Popup card */}
      {isFirst ? (
        <div
          style={cardStyle}
          className="overflow-hidden rounded-3xl border border-border bg-popover text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        >
          <div className="relative px-8 pb-8 pt-10 text-center">
            {/* Soft brand glow behind the logo */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-36"
              style={{ background: "radial-gradient(ellipse 80% 100% at 50% 0%, hsl(var(--primary) / 0.14), transparent 70%)" }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pictures/logo-no-bg.png" alt="" className="relative mx-auto h-12 w-12 object-contain" />
            <h2 className="relative mt-5 text-2xl font-black tracking-tight">{step.title}</h2>
            <p className="relative mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>
            <div className="relative mt-7 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={next}
                className="w-full max-w-[280px] rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.35)] transition-all hover:opacity-95 hover:shadow-[0_0_32px_hsl(var(--primary)/0.5)]"
              >
                {welcomeCta}
              </button>
              <button
                type="button"
                onClick={() => finish()}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {welcomeDismiss}
              </button>
            </div>
            <p className="relative mt-5 text-[11px] text-muted-foreground/60">{welcomeFootnote}</p>
          </div>
        </div>
      ) : (
        <div
          style={cardStyle}
          className="rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold leading-snug">{step.title}</p>
            {!isLast && (
              <button
                type="button"
                onClick={() => finish()}
                className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip tour
              </button>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.body}</p>

          <div className="mt-4 flex items-center justify-between gap-3">
            {/* Progress dots */}
            <div className="flex items-center gap-1">
              {steps.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index ? "w-5 bg-primary" : i < index ? "w-1.5 bg-primary/50" : "w-1.5 bg-border"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {index > 0 && (
                <button
                  type="button"
                  onClick={back}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={isLast ? () => finish(finishDestination) : next}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {isLast ? finishLabel : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
