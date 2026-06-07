"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CronBuilder } from "@/components/triggers/cron-builder";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

type CronTrigger = {
  id: string;
  is_active: boolean;
  config: { expression?: string; timezone?: string };
};

/**
 * Schedule an agent to run on a recurring basis. Each fire re-runs the agent in
 * place (reasoning from scratch with memory of its own past runs) — a standing
 * agent, distinct from a fixed workflow. Cron triggers are available on all tiers.
 */
export function AgentSchedule({ agentId, canEdit }: { agentId: string; canEdit: boolean }) {
  const [triggers, setTriggers] = useState<CronTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [expression, setExpression] = useState("0 9 * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/programs/${agentId}/triggers`);
      const data = res.ok ? await res.json() : { triggers: [] };
      setTriggers(((data.triggers ?? []) as Array<{ id: string; type: string; is_active: boolean; config: any }>)
        .filter((t) => t.type === "cron")
        .map((t) => ({ id: t.id, is_active: t.is_active, config: t.config ?? {} })));
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function addSchedule() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${agentId}/triggers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cron", config: { expression, timezone } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not add the schedule."));
        return;
      }
      setAdding(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(triggerId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${agentId}/triggers/${triggerId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not remove the schedule."));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  // Nothing to show and the user can't add one.
  if (!canEdit && triggers.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card/80 shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Schedule</p>
        </div>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={busy}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add schedule
          </Button>
        )}
      </div>

      <div className="space-y-3 px-5 py-4">
        {triggers.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            Run this agent automatically on a schedule. Each run reasons from scratch with memory of its
            past runs — a standing agent, not a fixed workflow.
          </p>
        )}

        {triggers.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5">
            <div className="min-w-0">
              <p className="font-mono text-xs text-foreground/90">{t.config.expression ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground">
                {t.config.timezone ?? "UTC"} · {t.is_active ? "active" : "paused"}
              </p>
            </div>
            {canEdit && (
              <button
                onClick={() => void remove(t.id)}
                disabled={busy}
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Remove schedule"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {adding && (
          <div className="space-y-3 rounded-xl border border-border/60 p-4">
            <CronBuilder
              expression={expression}
              timezone={timezone}
              onChange={(expr, tz) => {
                setExpression(expr);
                setTimezone(tz);
              }}
            />
            <div className="flex items-center gap-2">
              <Button onClick={() => void addSchedule()} disabled={busy}>
                {busy ? "Saving…" : "Save schedule"}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
