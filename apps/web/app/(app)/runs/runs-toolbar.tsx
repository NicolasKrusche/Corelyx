"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const LIVE_KEY = "corelyx-runs-live";

type RunExport = {
  id: string;
  program: string;
  status: string;
  triggered_by: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
};

export function RunsLiveButton({ hasActive }: { hasActive: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(LIVE_KEY) === "1") setActive(true);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (active) {
      try { localStorage.setItem(LIVE_KEY, "1"); } catch { /* noop */ }
      intervalRef.current = setInterval(() => router.refresh(), 10_000);
    } else {
      try { localStorage.removeItem(LIVE_KEY); } catch { /* noop */ }
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active, router]);

  return (
    <button
      type="button"
      onClick={() => setActive((v) => !v)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
          : "border glass-card text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
      title={active ? "Click to stop auto-refresh" : "Click to auto-refresh every 10 seconds"}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", active ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40")} />
      Live · {active ? "auto" : "off"}
    </button>
  );
}

export function ExportRunsButton({ runs }: { runs: RunExport[] }) {
  function handleExport() {
    const headers = ["id", "program", "status", "triggered_by", "started_at", "completed_at", "duration_ms", "error"].join(",");
    const rows = runs.map((r) =>
      [
        r.id,
        `"${(r.program ?? "").replace(/"/g, '""')}"`,
        r.status,
        r.triggered_by ?? "",
        r.started_at ?? "",
        r.completed_at ?? "",
        r.duration_ms ?? "",
        `"${(r.error_message ?? "").replace(/"/g, '""')}"`,
      ].join(",")
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `runs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-lg border glass-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"/>
        <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"/>
      </svg>
      Export
    </button>
  );
}
