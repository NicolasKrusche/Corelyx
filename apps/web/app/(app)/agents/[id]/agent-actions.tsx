"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, FlaskConical, Trash2, Bookmark, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(savedTemplate);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isRunning = state === "running";
  const isCompleted = state === "completed";

  // The detail page is a server component, so reports and the final state only
  // appear on a re-fetch. While the agent is running, poll so its report window
  // and completion show up live without the user manually refreshing.
  useEffect(() => {
    if (!isRunning) {
      setNotice(null);
      return;
    }
    const interval = setInterval(() => router.refresh(), 3500);
    return () => clearInterval(interval);
  }, [isRunning, router]);

  async function run(dryRun: boolean) {
    if (busy) return;
    setBusy(dryRun ? "dry" : "run");
    setError(null);
    setNotice(null);
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
      // Refresh so the new run + state show up, then guide the user to where the
      // report will load.
      setNotice(
        dryRun
          ? "Dry run started — the preview report will appear in “Agent report” above as it works."
          : "Agent started — its report will appear in “Agent report” above as it works."
      );
      router.refresh();
      setTimeout(() => {
        document.getElementById("agent-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
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
    setConfirmDelete(false);
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
        {canRun && !isCompleted && (
          <>
            <Button onClick={() => void run(false)} disabled={busy !== null || isRunning}>
              <Play className="mr-1.5 h-4 w-4" />
              {busy === "run" ? "Starting…" : isRunning ? "Running…" : "Approve & run"}
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
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            {busy === "delete" ? "Deleting…" : "Delete"}
          </Button>
        )}
      </div>

      {isCompleted ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          This agent has completed its one-time run and can&apos;t be run again. Its report is shown above.
          {canEdit && " Save it as a template to reuse the plan for a new agent."}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          <FlaskConical className="mr-1 inline h-3 w-3" />
          Dry run executes read-only steps and <span className="font-medium">simulates</span> anything that would change
          your data, so you can preview what the agent will do before approving it.
          {!saved && " Unsaved agents are discarded after a successful run."}
        </p>
      )}

      {notice && !error && (
        <p className="flex items-center gap-2 text-sm text-primary">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          {notice}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this agent?"
        description="This permanently deletes the agent, its plan, and its run history. This cannot be undone."
        confirmLabel="Delete agent"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
