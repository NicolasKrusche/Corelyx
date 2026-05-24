"use client";

import { useEffect, useState } from "react";

// Bump this key whenever you want the modal to reappear for all users.
const WHATS_NEW_KEY = "corelyx-whats-new-v20260525";

type Update = {
  icon: string;
  title: string;
  description: string;
};

const UPDATES: Update[] = [
  {
    icon: "🔑",
    title: "Corelyx AI Keys",
    description: "Generate personal API tokens and call Corelyx from scripts, CI pipelines, or external agents. Tokens are shown once — store them safely. Manage them in Settings → Developer.",
  },
  {
    icon: "✨",
    title: "Glassmorphism editor nodes",
    description: "Workflow nodes got a full visual refresh — frosted glass, coloured accent bars per node type, and glow handles. The canvas now has a persistent dot grid too.",
  },
  {
    icon: "{ }",
    title: "Raw schema editor",
    description: "Enable the raw schema editor in Settings → Developer to get a live JSON panel in the workflow editor. Read, edit, and apply the full workflow schema directly.",
  },
  {
    icon: "⚙️",
    title: "Execution defaults",
    description: "Set workspace-level defaults for execution mode and conflict policy in Settings → Developer. New workflows inherit these automatically.",
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
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>

        {/* Header */}
        <div className="px-6 pb-4 pt-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828l.645-1.937ZM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.734 1.734 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69A1.734 1.734 0 0 0 2.31 4.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.734 1.734 0 0 0 3.407 2.31l.387-1.162ZM10.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.156 1.156 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.156 1.156 0 0 0-.732-.732L9.1 2.137a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732L10.863.1Z" />
            </svg>
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
        <ul className="divide-y divide-border/60">
          {UPDATES.map((u) => (
            <li key={u.title} className="flex items-start gap-3 px-6 py-3.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-base leading-none">
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
