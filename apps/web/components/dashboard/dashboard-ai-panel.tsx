"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// ─── Suggestion definitions ───────────────────────────────────────────────────

const SUGGESTIONS = [
  {
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3M8 11v.5" strokeLinecap="round" />
      </svg>
    ),
    label: "What needs attention?",
    description: "Scan this workspace for anything that looks blocked or urgent.",
    prompt: "What needs attention in my workspace? Look for blocked runs, failed workflows, and anything urgent.",
  },
  {
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary">
        <path d="M8 2l1.5 3L13 6.5 9.5 8 8 11.5 6.5 8 3 6.5 6.5 5z" strokeLinejoin="round" />
      </svg>
    ),
    label: "Find the right workflow",
    description: "Help me figure out where a workflow probably lives.",
    prompt: "Help me find the right workflow for my task.",
  },
  {
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500">
        <path d="M8 3v10M3 8h10" strokeLinecap="round" />
      </svg>
    ),
    label: "Build a new workflow",
    description: "Start from a goal and turn it into an automation.",
    prompt: "",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardAiPanel() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const prompt = value.trim();
    if (prompt) {
      router.push(`/programs/new?prompt=${encodeURIComponent(prompt)}`);
    } else {
      router.push("/programs/new");
    }
  }

  async function handleBlankCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "blank" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Could not create workflow.");
        return;
      }
      router.push(`/programs/${data.program.id}/editor`);
    } finally {
      setCreating(false);
    }
  }

  function applySuggestion(prompt: string) {
    if (!prompt) {
      void handleBlankCreate();
    } else {
      router.push(`/programs/new?prompt=${encodeURIComponent(prompt)}`);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-[13px] font-medium text-foreground/80">New workflow</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-muted-foreground">
          <rect x="1" y="1" width="6" height="14" rx="1.5" />
          <rect x="9" y="1" width="6" height="14" rx="1.5" />
        </svg>
      </div>

      {/* Body */}
      <div className="flex flex-col items-center gap-5 px-5 py-8">
        {/* Logo mark */}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <svg viewBox="0 0 32 32" fill="none" className="h-8 w-8">
            <path
              d="M16 4l3 6.5L26 13l-7 3.5L16 23l-3-6.5L6 13l7-3.5L16 4z"
              fill="hsl(var(--primary))"
              opacity="0.9"
            />
            <path
              d="M24 20l1.5 3L29 24l-3.5 1L24 28l-1.5-3L19 24l3.5-1L24 20z"
              fill="hsl(var(--primary))"
              opacity="0.6"
            />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-foreground">How can I help?</h2>

        {/* Prompt input */}
        <form onSubmit={handleSubmit} className="w-full">
          <div className="relative w-full rounded-xl border border-border bg-background/60 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
            <textarea
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Build a workflow, ask a question, or complete a task"
              rows={4}
              className="w-full resize-none rounded-t-xl bg-transparent px-3 pt-3 pb-2 text-sm placeholder:text-muted-foreground/40 outline-none"
            />
            <div className="flex items-center justify-between px-2.5 pb-2.5">
              <button
                type="button"
                title="Attach file"
                className="rounded p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
                  <path d="M13 7.5L7 13.5a4 4 0 01-5.5-5.5l6-6a2.5 2.5 0 013.5 3.5L5 11a1 1 0 01-1.5-1.5L9 4" strokeLinecap="round" />
                </svg>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Voice"
                  className="rounded p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
                    <rect x="5" y="1" width="6" height="9" rx="3" />
                    <path d="M3 8a5 5 0 0010 0M8 13v2" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="submit"
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-lg transition-colors",
                    value.trim()
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M8 14a.75.75 0 01-.75-.75V4.56L3.03 8.78a.75.75 0 01-1.06-1.06l4.5-4.5a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06L8.75 4.56v8.69A.75.75 0 018 14z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
        </form>

        {/* Suggestions */}
        <div className="w-full">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3 w-3">
              <circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1" strokeLinecap="round" />
            </svg>
            Suggestions
          </p>
          <div className="space-y-0.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={creating}
                onClick={() => applySuggestion(s.prompt)}
                className="w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2 text-xs hover:bg-accent/60 transition-colors disabled:opacity-50"
              >
                {s.icon}
                <div>
                  <span className="font-semibold text-foreground">{s.label}</span>
                  <span className="text-muted-foreground"> – {s.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
