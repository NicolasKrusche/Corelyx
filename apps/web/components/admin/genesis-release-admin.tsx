"use client";

import { useEffect, useState } from "react";
import { Play, Megaphone, RefreshCw } from "lucide-react";
import { GenesisV2ReleaseModal } from "@/components/genesis/genesis-v2-release";

type ReleaseState = { active: boolean; version: number };

export function GenesisReleaseAdmin() {
  const [state, setState] = useState<ReleaseState | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/genesis/release", { cache: "no-store" });
        if (res.ok) setState((await res.json()) as ReleaseState);
      } catch { /* ignore */ }
    })();
  }, []);

  async function post(body: { active?: boolean; bumpVersion?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/genesis/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setError((b as { message?: string; error?: string } | null)?.message ?? "Could not update the release.");
        return;
      }
      setState((await res.json()) as ReleaseState);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const published = state?.active === true;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
        <p className="text-muted-foreground">Publish the in-app release animation to all users.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Megaphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Genesis V2 release</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  published ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
                }`}
              >
                {state ? (published ? "Published" : "Unpublished") : "…"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A 4-slide intro to Genesis V2 with live previews of the clarifying-question and edit
              animations. When published, every user sees it once. Current version:{" "}
              <span className="font-mono">{state?.version ?? "…"}</span>.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreview(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <Play className="h-3.5 w-3.5" /> Preview
              </button>
              <button
                type="button"
                disabled={busy || !state}
                onClick={() => post({ active: !published })}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 ${
                  published ? "bg-muted-foreground/70" : "bg-primary"
                }`}
              >
                <Megaphone className="h-3.5 w-3.5" /> {published ? "Unpublish" : "Publish to all users"}
              </button>
              <button
                type="button"
                disabled={busy || !state}
                onClick={() => post({ bumpVersion: true, active: true })}
                title="Increment the version so users who already dismissed it see it again"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Re-show to everyone
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          </div>
        </div>
      </div>

      {preview && <GenesisV2ReleaseModal onClose={() => setPreview(false)} />}
    </div>
  );
}
