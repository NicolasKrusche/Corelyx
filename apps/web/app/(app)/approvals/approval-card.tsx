"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, ChevronDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

type ApprovalRow = {
  id: string;
  node_execution_id: string;
  user_id: string;
  status: string;
  context: {
    node_label?: string;
    input?: unknown;
    program_id?: string;
    reason?: string;
  } | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  node_executions: {
    id: string;
    node_id: string;
    run_id: string;
    runs: {
      id: string;
      program_id: string;
      programs: {
        id: string;
        name: string;
      };
    };
  };
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ApprovalCard({ approval }: { approval: ApprovalRow }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<"approved" | "rejected" | null>(null);
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

  const programName =
    approval.node_executions?.runs?.programs?.name ?? "Unknown program";
  const runId = approval.node_executions?.run_id;
  const programId = approval.node_executions?.runs?.program_id;
  const nodeLabel = approval.context?.node_label ?? approval.node_executions?.node_id;
  const reason = approval.context?.reason;

  async function decide(decision: "approved" | "rejected") {
    setSubmitting(decision);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      if (res.ok) {
        setDecided(decision);
        window.dispatchEvent(new CustomEvent("approval-changed"));
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(friendlyResponseMessage(body as { error?: string }, "We could not save your decision. Please try again."));
      }
    } catch {
      setError("We could not connect. Check your internet connection and try again.");
    } finally {
      setSubmitting(null);
    }
  }

  if (decided) {
    return (
      <div className="rounded-2xl border glass-card px-5 py-4 flex items-center gap-3">
        {decided === "approved"
          ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
        <p className="text-sm text-muted-foreground">
          <span className={decided === "approved" ? "text-green-500 font-medium" : "text-destructive font-medium"}>
            {decided === "approved" ? "Approved" : "Rejected"}
          </span>
          {" "}— decision recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border glass-card overflow-hidden">
      {/* Header bar */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div className="flex items-start gap-3 min-w-0">
          {/* Pulsing indicator */}
          <span className="relative mt-1 flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-50 [animation-duration:2s]" />
            <span className="relative h-2 w-2 rounded-full bg-amber-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{nodeLabel}</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {programId ? (
                <Link href={`/programs/${programId}`} className="hover:text-foreground transition-colors">
                  {programName}
                </Link>
              ) : programName}
              {runId && programId && (
                <>
                  {" · "}
                  <Link href={`/programs/${programId}/runs/${runId}`} className="hover:text-foreground transition-colors">
                    View run
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground/50">
          <Clock className="h-3 w-3" />
          {timeAgo(approval.created_at)}
        </div>
      </div>

      {/* Reason */}
      {reason && (
        <div className="mx-5 mb-4 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">{reason}</p>
        </div>
      )}

      {/* Input context collapsible */}
      {approval.context?.input != null && (
        <div className="mx-5 mb-4">
          <button
            onClick={() => setContextOpen(o => !o)}
            className="flex w-full items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${contextOpen ? "rotate-180" : ""}`} />
            Input context
          </button>
          {contextOpen && (
            <pre className="mt-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-xs text-muted-foreground overflow-x-auto max-h-48 leading-relaxed">
              {JSON.stringify(approval.context.input, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="mx-5 h-px bg-white/[0.06]" />

      {/* Note + actions */}
      <div className="px-5 py-4 space-y-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note for your decision (optional)…"
          rows={2}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-white/20 resize-none transition-colors"
        />

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <Button
            onClick={() => decide("approved")}
            disabled={submitting !== null}
            size="sm"
            className="gap-1.5 bg-green-600 hover:bg-green-500 text-white border-0"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {submitting === "approved" ? "Approving…" : "Approve"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => decide("rejected")}
            disabled={submitting !== null}
            className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
          >
            <XCircle className="h-3.5 w-3.5" />
            {submitting === "rejected" ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      </div>
    </div>
  );
}
