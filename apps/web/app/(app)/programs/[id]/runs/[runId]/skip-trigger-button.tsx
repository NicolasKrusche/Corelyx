"use client";

import { useState } from "react";

export function SkipTriggerButton({ runId }: { runId: string }) {
  const [skipping, setSkipping] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSkip() {
    setSkipping(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/skip-trigger`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSkipping(false);
    }
  }

  if (done) return null;

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleSkip}
        disabled={skipping}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3 w-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h7M7 5l3 3-3 3M12 4v8" />
        </svg>
        {skipping ? "Skipping…" : "Skip trigger"}
      </button>
      {error && (
        <p className="text-xs text-destructive max-w-sm">{error}</p>
      )}
    </div>
  );
}
