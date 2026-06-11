"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

/**
 * Per-agent capability scope the user sets before approving: read-only vs allowed
 * to make changes. Enforced at runtime regardless of what the plan requests.
 */
export function AgentPermissions({
  agentId,
  allowWrites,
  maxCostUsd,
  canEdit,
}: {
  agentId: string;
  allowWrites: boolean;
  maxCostUsd: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [writes, setWrites] = useState(allowWrites);
  const [cap, setCap] = useState<string>(maxCostUsd != null ? String(maxCostUsd) : "");
  const [savingCap, setSavingCap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveCap() {
    if (savingCap) return;
    setSavingCap(true);
    setError(null);
    try {
      const trimmed = cap.trim();
      const value = trimmed === "" ? null : Number(trimmed);
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        setError("Enter a valid dollar amount, or leave blank for no cap.");
        return;
      }
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_cost_usd: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not save the spend cap."));
        return;
      }
      router.refresh();
    } finally {
      setSavingCap(false);
    }
  }

  async function set(next: boolean) {
    if (busy || next === writes) return;
    setBusy(true);
    setError(null);
    setWrites(next);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allow_writes: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not update permissions."));
        setWrites(!next); // revert
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Please try again.");
      setWrites(!next);
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { value: false, icon: <Eye className="h-3.5 w-3.5" />, label: "Read-only", hint: "Look and report, never change anything" },
    { value: true, icon: <Pencil className="h-3.5 w-3.5" />, label: "Can make changes", hint: "May send, create, and update via your apps" },
  ];

  return (
    <div className="rounded-2xl border glass-panel">
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Permissions</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="text-xs text-muted-foreground">
          Decide what this agent is allowed to do. Enforced while it runs, whatever its plan says.
        </p>
        <div className="grid gap-2">
          {options.map((o) => {
            const active = writes === o.value;
            const interactive = canEdit && !busy;
            return (
              <button
                key={String(o.value)}
                type="button"
                disabled={!interactive}
                onClick={() => void set(o.value)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 hover:border-primary/30"
                } ${!interactive ? "cursor-default opacity-80" : ""}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {o.icon}
                  {o.label}
                  {active && <span className="ml-auto text-[10px] font-bold uppercase text-primary">active</span>}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{o.hint}</span>
              </button>
            );
          })}
        </div>
        {/* Spend cap */}
        <div className="border-t border-border/50 pt-3">
          <p className="text-sm font-medium">Spend cap per run</p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Stop a run once its AI cost passes this amount. Leave blank for no cap.
          </p>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-border/60 bg-background px-2.5">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                disabled={!canEdit || savingCap}
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                placeholder="none"
                className="w-24 bg-transparent px-1.5 py-1.5 text-sm outline-none"
              />
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => void saveCap()} disabled={savingCap}>
                {savingCap ? "Saving…" : "Save cap"}
              </Button>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
