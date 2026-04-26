"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

const STORAGE_KEY = "corelyx-onboarding-dismissed";

interface Props {
  hasPrograms: boolean;
  hasConnections: boolean;
  hasApiKeys: boolean;
}

export function OnboardingChecklist({ hasPrograms, hasConnections, hasApiKeys }: Props) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    try {
      setDismissed(!!localStorage.getItem(STORAGE_KEY));
    } catch {
      setDismissed(false);
    }
  }, []);

  const allDone = hasPrograms && (hasConnections || hasApiKeys);

  // Auto-dismiss once everything is done
  useEffect(() => {
    if (allDone) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
      setDismissed(true);
    }
  }, [allDone]);

  if (dismissed) return null;

  const steps = [
    {
      done: hasConnections,
      label: "Connect a service",
      description: "Link Gmail, Slack, Notion, or any other integration.",
      href: "/connections",
      cta: "Go to Connections",
    },
    {
      done: hasApiKeys,
      label: "Add an AI model key",
      description: "Add an Anthropic, OpenAI, or OpenRouter API key to power your agents.",
      href: "/api-keys",
      cta: "Add API key",
    },
    {
      done: hasPrograms,
      label: "Create your first program",
      description: "Describe an automation in plain English — Corelyx builds the graph.",
      href: "/programs/new",
      cta: "Create program",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="relative rounded-xl border border-primary/20 bg-primary/4 overflow-hidden">
      {/* Top glow line */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-bold">Get started</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount} of {steps.length} steps complete
            </p>
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(completedCount / steps.length) * 100}%` }}
              />
            </div>
            <button
              onClick={dismiss}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors text-xs"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {steps.map((step) => (
            <div
              key={step.label}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                step.done
                  ? "border-border/40 bg-card/40 opacity-60"
                  : "border-border bg-card hover:bg-accent/40"
              }`}
            >
              {/* Check circle */}
              <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                step.done
                  ? "border-green-500 bg-green-500/20"
                  : "border-border"
              }`}>
                {step.done && (
                  <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 text-green-400">
                    <path fillRule="evenodd" d="M10.5 2.5a.75.75 0 0 1 .166.913l-4 6a.75.75 0 0 1-1.153.098l-2.5-2.5a.75.75 0 0 1 1.06-1.06l1.89 1.889 3.464-5.196a.75.75 0 0 1 1.073-.144Z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${step.done ? "line-through text-muted-foreground" : ""}`}>
                  {step.label}
                </p>
                {!step.done && (
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">{step.description}</p>
                )}
              </div>

              {!step.done && (
                <Link
                  href={step.href}
                  className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
                >
                  {step.cta} →
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
