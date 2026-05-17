"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

type FailedRun = { id: string; program_id: string };

export function RunsFooter({
  totalShown,
  filterLabel,
  failedRuns,
}: {
  totalShown: number;
  filterLabel?: string;
  failedRuns: FailedRun[];
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryDone, setRetryDone] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  function handleMarkReviewed() {
    try { localStorage.setItem("runs_last_seen", Date.now().toString()); } catch { /* noop */ }
    setReviewed(true);
    router.refresh();
  }

  async function handleRetryFailed() {
    if (retrying || failedRuns.length === 0) return;
    setRetrying(true);
    // Deduplicate by program_id and retry each unique program once
    const seen = new Set<string>();
    const toRetry = failedRuns.filter((r) => {
      if (seen.has(r.program_id)) return false;
      seen.add(r.program_id);
      return true;
    });
    await Promise.allSettled(
      toRetry.map((r) =>
        fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ program_id: r.program_id }),
        })
      )
    );
    setRetrying(false);
    setRetryDone(true);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground/60">
      <span>
        Showing {totalShown} run{totalShown !== 1 ? "s" : ""}
        {filterLabel && <> · filtered to <span className="font-medium text-foreground/70">{filterLabel}</span></>}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleMarkReviewed}
          disabled={reviewed}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium transition-colors",
            reviewed
              ? "text-green-500 cursor-default"
              : "hover:bg-accent hover:text-foreground"
          )}
        >
          {reviewed ? "✓ Reviewed" : "Mark all reviewed"}
        </button>
        {failedRuns.length > 0 && (
          <button
            type="button"
            onClick={handleRetryFailed}
            disabled={retrying || retryDone}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition-colors",
              retryDone
                ? "border-green-500/30 bg-green-500/10 text-green-500 cursor-default"
                : retrying
                ? "border-border bg-muted/40 opacity-60 cursor-not-allowed"
                : "border-border bg-card text-foreground hover:bg-accent"
            )}
          >
            {retrying && (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Z" strokeOpacity={0.3}/>
                <path d="M14 8a6 6 0 0 0-6-6"/>
              </svg>
            )}
            {retryDone ? "✓ Retried" : retrying ? "Retrying…" : "↺ Retry failed"}
          </button>
        )}
      </div>
    </div>
  );
}
