"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const TOUR_DONE_KEY = "corelyx-tour-done";
const SPOTLIGHT_PADDING = 6;

type TourStep = {
  id: string;
  /** Matches a [data-tour="..."] element. Omit for a centered modal step. */
  target?: string;
  placement?: "right" | "bottom";
  title: string;
  body: string;
};

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Corelyx",
    body: "Here's a quick tour of the essentials — it takes about a minute. We'll point at each part of the app and explain what it does. You can skip at any time.",
  },
  {
    id: "genesis",
    target: "genesis",
    placement: "bottom",
    title: "Describe it, AI builds it",
    body: "This is the heart of Corelyx. Describe an automation in plain English — like “summarize new GitHub issues into Slack” — and Genesis generates a working workflow you can inspect, edit, and run.",
  },
  {
    id: "create-new",
    target: "create-new",
    placement: "right",
    title: "Create new",
    body: "Starts a new workflow from anywhere in the app: describe it for AI, pick a template, or open a blank canvas and build by hand.",
  },
  {
    id: "workspace-switcher",
    target: "workspace-switcher",
    placement: "right",
    title: "Your workspace",
    body: "Workflows, connections, and people live inside workspaces. Click here to switch between them, create a new one, or invite teammates.",
  },
  {
    id: "nav-agents",
    target: "nav-agents",
    placement: "right",
    title: "Agents",
    body: "Agents are AI coworkers with their own instructions, knowledge, and tools. They can run on a schedule or be called as a step inside your workflows.",
  },
  {
    id: "nav-runs",
    target: "nav-runs",
    placement: "right",
    title: "Runs",
    body: "Every execution is recorded here, step by step. If something fails, a badge appears and you can open the run to see exactly what happened.",
  },
  {
    id: "nav-approvals",
    target: "nav-approvals",
    placement: "right",
    title: "Approvals",
    body: "Workflows can pause and wait for a human. Anything that needs your sign-off — like sending an email on your behalf — shows up here first.",
  },
  {
    id: "nav-connections",
    target: "nav-connections",
    placement: "right",
    title: "Connections",
    body: "Link Gmail, Slack, Notion, GitHub, and more. Workflows act through these connections — credentials stay safely here, never inside workflow text.",
  },
  {
    id: "usage",
    target: "usage",
    placement: "right",
    title: "Usage at a glance",
    body: "Keep an eye on your monthly runs and AI credits here. Included limits reset every month, and you can top up credits whenever you need more.",
  },
  {
    id: "finish",
    title: "That's the tour!",
    body: "You know your way around now. The button below takes you straight to the builder — describe your first automation and Genesis will put it together. You can replay this tour any time from the Get started panel.",
  },
];

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function ProductTour() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    if (searchParams.get("tour") === "1") {
      setIndex(0);
      setActive(true);
    }
  }, [searchParams]);

  // Keep the sidebar expanded while the tour points at it
  useEffect(() => {
    if (!active) return;
    window.dispatchEvent(new CustomEvent("corelyx:tour-start"));
    return () => {
      window.dispatchEvent(new CustomEvent("corelyx:tour-end"));
    };
  }, [active]);

  const step = active ? STEPS[index] : undefined;

  const finish = useCallback(
    (destination: string = "/dashboard") => {
      setActive(false);
      setRect(null);
      try {
        localStorage.setItem(TOUR_DONE_KEY, "1");
      } catch {
        /* ignore */
      }
      router.replace(destination, { scroll: false });
    },
    [router]
  );

  const next = useCallback(() => {
    setIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }, []);

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

    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      if (!r || r.width < 4 || r.height < 4 || r.right < 0 || r.left > window.innerWidth) {
        setRect(null);
        setIndex((i) => (i >= STEPS.length - 1 ? i : i + 1));
        return;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    measure();
    // Re-measure on a short interval so the spotlight tracks the sidebar's
    // expand transition and any layout shifts without bespoke observers.
    const interval = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step]);

  // Keyboard: Esc skips, arrows/Enter navigate
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (index >= STEPS.length - 1) finish("/programs/new");
        else next();
      } else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, index, next, back, finish]);

  if (!active || !step) return null;

  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;
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
            <h2 className="relative mt-5 text-2xl font-black tracking-tight">Welcome to Corelyx</h2>
            <p className="relative mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Before you build anything, a quick look around: eight stops covering the AI
              builder, your workflows, and where everything lives.
            </p>
            <div className="relative mt-7 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={next}
                className="w-full max-w-[280px] rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.35)] transition-all hover:opacity-95 hover:shadow-[0_0_32px_hsl(var(--primary)/0.5)]"
              >
                Show me around
              </button>
              <button
                type="button"
                onClick={() => finish()}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                I&apos;ll explore on my own
              </button>
            </div>
            <p className="relative mt-5 text-[11px] text-muted-foreground/60">
              Takes about a minute · Esc leaves any time
            </p>
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
              {STEPS.map((s, i) => (
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
                onClick={isLast ? () => finish("/programs/new") : next}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {isLast ? "Create your first workflow" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
