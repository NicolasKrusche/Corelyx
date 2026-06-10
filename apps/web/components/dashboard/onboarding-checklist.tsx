"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Plug, Workflow, CheckCircle2 } from "lucide-react";

const STORAGE_KEY = "corelyx-onboarding-dismissed";

interface Props {
  hasPrograms: boolean;
  hasConnections: boolean;
  hasApiKeys: boolean;
}

export function OnboardingChecklist({ hasPrograms, hasConnections, hasApiKeys }: Props) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid SSR flash

  useEffect(() => {
    try {
      setDismissed(!!localStorage.getItem(STORAGE_KEY));
    } catch {
      setDismissed(false);
    }
  }, []);

  const allDone = hasPrograms && (hasConnections || hasApiKeys);

  // Auto-dismiss once all steps are complete
  useEffect(() => {
    if (allDone) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
      setDismissed(true);
    }
  }, [allDone]);

  if (dismissed) return null;

  const steps = [
    {
      done: hasConnections || hasApiKeys,
      Icon: Plug,
      label: "Set up an integration",
      description: "Connect a service like Gmail or Slack, or add your own Anthropic / OpenAI API key.",
      href: "/connections",
      cta: "Go to Connections",
    },
    {
      done: hasPrograms,
      Icon: Workflow,
      label: "Create your first workflow",
      description: "Describe your automation in plain English — Genesis AI builds the graph for you.",
      href: "/programs/new",
      cta: "Create workflow",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.03]">
      {/* Top gradient line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="p-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <p className="text-sm font-bold">Get started</p>
            {/* Pill progress dots */}
            <div className="flex items-center gap-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i < completedCount
                      ? "w-5 bg-primary"
                      : "w-3 bg-border"
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {completedCount}/{steps.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard?tour=1"
              className="text-[11px] font-medium text-primary/70 hover:text-primary transition-colors"
            >
              Replay the tour
            </Link>
            <button
              onClick={dismiss}
              className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              title="Dismiss"
            >
              Skip
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.Icon;
            return (
              <div
                key={step.label}
                className={`flex gap-3 rounded-xl border p-4 transition-colors ${
                  step.done
                    ? "border-border/40 bg-white/[0.02] opacity-60"
                    : "border glass-card hover:border-primary/20"
                }`}
              >
                {/* Icon */}
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    step.done ? "bg-green-500/10" : "bg-primary/10"
                  }`}
                >
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Icon className="h-4 w-4 text-primary" />
                  )}
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      step.done ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    {step.label}
                  </p>
                  {!step.done && (
                    <>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/60">
                        {step.description}
                      </p>
                      <Link
                        href={step.href}
                        className="mt-2 inline-block text-[11px] font-semibold text-primary hover:underline"
                      >
                        {step.cta} →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
