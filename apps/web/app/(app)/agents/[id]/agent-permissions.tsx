"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Eye, Pencil } from "lucide-react";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

/**
 * Per-agent capability scope the user sets before approving: read-only vs allowed
 * to make changes. Enforced at runtime regardless of what the plan requests.
 */
export function AgentPermissions({
  agentId,
  allowWrites,
  canEdit,
}: {
  agentId: string;
  allowWrites: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [writes, setWrites] = useState(allowWrites);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="rounded-2xl border bg-card/80 shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Permissions</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Decide what this agent is allowed to do. Enforced while it runs, whatever its plan says.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
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
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
