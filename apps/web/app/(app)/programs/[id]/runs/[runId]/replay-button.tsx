"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReplayButton({ runId, programId }: { runId: string; programId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleReplay() {
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/runs/${runId}/replay`, { method: "POST" });
      const data = await res.json() as { run_id?: string; message?: string; error?: string };
      if (!res.ok) {
        setErrorMsg(data.message ?? data.error ?? "Failed to start replay");
        setState("error");
        return;
      }
      if (data.run_id) {
        router.push(`/programs/${programId}/runs/${data.run_id}`);
      }
    } catch {
      setErrorMsg("Network error — please try again.");
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleReplay}
        disabled={state === "loading"}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state === "loading" ? (
          <>
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
            </svg>
            Starting…
          </>
        ) : (
          <>
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531L5.305 13.533A1.5 1.5 0 0 1 3 12.267V3.732Z" />
            </svg>
            Re-run
          </>
        )}
      </button>
      {state === "error" && errorMsg && (
        <p className="text-xs text-destructive max-w-xs truncate" title={errorMsg}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}
