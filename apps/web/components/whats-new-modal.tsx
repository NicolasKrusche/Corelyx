"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, ChartBar, Clock, Globe, TriangleAlert, ListChecks, Zap } from "lucide-react";

// Bump this key whenever you want the modal to reappear for all users.
const WHATS_NEW_KEY = "corelyx-whats-new-v20260517";

type Update = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

const UPDATES: Update[] = [
  {
    icon: <ChartBar className="h-4 w-4" />,
    title: "Usage sparklines",
    description: "30-day AI spend and workflow run charts now live on your Credits & Usage page.",
  },
  {
    icon: <ListChecks className="h-4 w-4" />,
    title: "Onboarding checklist",
    description: "A step-by-step getting-started guide that tracks your progress and hides once complete.",
  },
  {
    icon: <TriangleAlert className="h-4 w-4" />,
    title: "Redesigned error pages",
    description: "404 and 500 pages are now full-screen with a proper recovery flow — inside the app shell too.",
  },
  {
    icon: <Clock className="h-4 w-4" />,
    title: "API key last-used timestamps",
    description: "See exactly when each key was last called, down to the minute.",
  },
  {
    icon: <Zap className="h-4 w-4" />,
    title: "Trigger event log",
    description: "Every webhook fire, cron tick, and program-chain run is now recorded on the Triggers page.",
  },
  {
    icon: <Globe className="h-4 w-4" />,
    title: "Full i18n across 12 languages",
    description: "All page content — dashboard, runs, approvals, API keys, credits, errors — now respects your locale.",
  },
];

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(WHATS_NEW_KEY)) {
        setOpen(true);
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — skip
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(WHATS_NEW_KEY, "1");
    } catch {}
    setOpen(false);
  }

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={dismiss}
    >
      {/* Blur + dim layer */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

      {/* Card — stop propagation so clicking inside doesn't close */}
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="px-6 pb-4 pt-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
            <Sparkles className="h-3 w-3" />
            What&apos;s new
          </div>
          <h2 className="text-xl font-black tracking-tight">Fresh off the press</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s everything that landed in this update.
          </p>
        </div>

        {/* Divider */}
        <div className="mx-6 h-px bg-border" />

        {/* Update list */}
        <ul className="space-y-0 divide-y divide-border/60 px-0">
          {UPDATES.map((u) => (
            <li key={u.title} className="flex items-start gap-3 px-6 py-3.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
                {u.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">{u.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground/70 leading-relaxed">{u.description}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="px-6 pb-5 pt-4">
          <button
            onClick={dismiss}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Got it, let&apos;s go →
          </button>
        </div>
      </div>
    </div>
  );
}
