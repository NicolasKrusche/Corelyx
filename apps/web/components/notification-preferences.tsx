"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Prefs = {
  run_failures:       boolean;
  approvals:          boolean;
  agent_reports:      boolean;
  run_limit_warnings: boolean;
  security_alerts:    boolean;
  product_updates:    boolean;
};

type PrefKey = keyof Prefs;

const ITEMS: { key: PrefKey; label: string; caption: string; locked?: boolean }[] = [
  {
    key: "run_failures",
    label: "Run failures",
    caption: "Email when a workflow run fails.",
  },
  {
    key: "approvals",
    label: "Approval requests",
    caption: "Email when a workflow step needs your sign-off.",
  },
  {
    key: "agent_reports",
    label: "Agent updates",
    caption: "Email when an agent finishes or needs your input.",
  },
  {
    key: "run_limit_warnings",
    label: "Run limit warnings",
    caption: "Email when you've used 80% of your monthly runs.",
  },
  {
    key: "security_alerts",
    label: "Security alerts",
    caption: "Email for suspicious sign-ins and account changes.",
    locked: true,
  },
  {
    key: "product_updates",
    label: "Product updates",
    caption: "Occasional emails about new features and releases.",
  },
];

export function NotificationPreferences({ panelClass }: { panelClass: string }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<PrefKey | null>(null);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => r.json())
      .then((data) => setPrefs(data as Prefs))
      .catch(() => { /* keep null — show skeleton */ });
  }, []);

  async function toggle(key: PrefKey) {
    if (!prefs || saving) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    setStatus("idle");
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!res.ok) {
        // Revert on error
        setPrefs(prefs);
        setStatus("error");
      } else {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      }
    } catch {
      setPrefs(prefs);
      setStatus("error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className={panelClass}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Email notifications
        </p>
        {status === "saved" && (
          <span className="text-xs text-primary">Saved</span>
        )}
        {status === "error" && (
          <span className="text-xs text-destructive">Could not save</span>
        )}
      </div>

      <div className="mt-4 space-y-1">
        {ITEMS.map(({ key, label, caption, locked }) => {
          const enabled = prefs?.[key] ?? true;
          const isSaving = saving === key;

          return (
            <label
              key={key}
              className={cn(
                "flex items-start gap-4 rounded-xl px-3 py-3 transition-colors",
                locked ? "" : "cursor-pointer hover:bg-accent/50"
              )}
            >
              {/* Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={locked || isSaving || !prefs}
                onClick={() => { if (!locked) void toggle(key); }}
                className={cn(
                  "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  enabled ? "bg-primary" : "bg-input",
                  (locked || !prefs) && "cursor-not-allowed opacity-60",
                )}
              >
                <span
                  className={cn(
                    "ml-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    enabled ? "translate-x-[16px]" : "translate-x-0",
                    isSaving && "opacity-60"
                  )}
                />
              </button>

              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {label}
                  {locked && (
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Always on
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{caption}</span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
