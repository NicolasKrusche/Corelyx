"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, FlaskConical, Trash2, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

export function AgentActions({
  agentId,
  state,
  savedTemplate,
  canRun,
  canEdit,
}: {
  agentId: string;
  state: string;
  savedTemplate: boolean;
  canRun: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "run" | "dry" | "save" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(savedTemplate);

  const isRunning = state === "running";

  async function run(dryRun: boolean) {
    if (busy) return;
    setBusy(dryRun ? "dry" : "run");
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not start the agent. Please try again."));
        return;
      }
      // Refresh so the new run + state show up.
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleSaved() {
    if (busy) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_saved_template: !saved }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not update the agent."));
        return;
      }
      setSaved((s) => !s);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not delete the agent."));
        return;
      }
      router.push("/agents");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canRun && (
          <>
            <Button onClick={() => void run(false)} disabled={busy !== null || isRunning}>
              <Play className="mr-1.5 h-4 w-4" />
              {busy === "run" ? "Starting…" : isRunning ? "Running…" : state === "completed" ? "Run again" : "Approve & run"}
            </Button>
            <Button variant="outline" onClick={() => void run(true)} disabled={busy !== null || isRunning}>
              <FlaskConical className="mr-1.5 h-4 w-4" />
              {busy === "dry" ? "Starting…" : "Dry run"}
            </Button>
          </>
        )}
        {canEdit && (
          <Button variant="outline" onClick={() => void toggleSaved()} disabled={busy !== null}>
            <Bookmark className={`mr-1.5 h-4 w-4 ${saved ? "fill-current" : ""}`} />
            {saved ? "Saved" : "Save as template"}
          </Button>
        )}
        {canEdit && (
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={busy !== null}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        <FlaskConical className="mr-1 inline h-3 w-3" />
        Dry run executes read-only steps and <span className="font-medium">simulates</span> anything that would change
        your data, so you can preview what the agent will do before approving it.
        {!saved && " Unsaved agents are discarded after a successful run."}
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
