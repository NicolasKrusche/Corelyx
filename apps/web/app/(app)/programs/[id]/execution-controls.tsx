"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Hand, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  programId: string;
  executionMode: string;
  conflictPolicy: string;
};

const MODE_DESCRIPTIONS: Record<string, string> = {
  autonomous: "Autonomous. Runs fully automatically - no approvals required (except nodes explicitly marked).",
  supervised: "Supervised. Every agent node requires manual approval before executing.",
  manual: "Manual. Step-through mode - you advance each node manually.",
};

const POLICY_DESCRIPTIONS: Record<string, string> = {
  queue: "Queue. New runs wait in line if another is already running.",
  skip: "Skip. New runs are skipped if another is already running.",
  fail: "Fail. New runs fail immediately if another is already running.",
};

const MODE_ICONS = {
  autonomous: Zap,
  supervised: Eye,
  manual: Hand,
};

export function ExecutionControls({ programId, executionMode, conflictPolicy }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState(executionMode);
  const [policy, setPolicy] = useState(conflictPolicy);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = mode !== executionMode || policy !== conflictPolicy;

  const handleReset = () => {
    setMode(executionMode);
    setPolicy(conflictPolicy);
    setError(null);
    setSaved(false);
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/programs/${programId}/execution-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execution_mode: mode, conflict_policy: policy }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Save failed");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  };

  return (
    <section className="overflow-hidden rounded-lg border glass-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Execution</h2>
          <p className="mt-1 text-sm text-muted-foreground">How the program runs and handles concurrent triggers.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={isPending}>
          <RefreshCw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="mb-2 text-sm text-foreground">
            Execution mode <span className="text-xs text-muted-foreground">- how steps advance</span>
          </p>
          <div className="grid rounded-lg border border-border bg-muted/60 p-1 sm:grid-cols-3">
            {(["autonomous", "supervised", "manual"] as const).map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
                    mode === m
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="capitalize">{m}</span>
                </button>
              );
            })}
          </div>
          {MODE_DESCRIPTIONS[mode] && (
            <p className="mt-2 text-sm text-muted-foreground">{MODE_DESCRIPTIONS[mode]}</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm text-foreground">
            Concurrent run policy <span className="text-xs text-muted-foreground">- when a run is already in progress</span>
          </p>
          <div className="grid rounded-lg border border-border bg-muted/60 p-1 sm:grid-cols-3">
            {(["queue", "skip", "fail"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPolicy(p)}
                className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors ${
                  policy === p
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="capitalize">{p}</span>
              </button>
            ))}
          </div>
          {POLICY_DESCRIPTIONS[policy] && (
            <p className="mt-2 text-sm text-muted-foreground">{POLICY_DESCRIPTIONS[policy]}</p>
          )}
        </div>

        {(isDirty || saved || error) && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !isDirty}
              className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Saving..." : saved ? "Saved" : "Save changes"}
            </button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
