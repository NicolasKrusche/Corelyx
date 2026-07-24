"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  Clock,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

type ApprovalRow = {
  id: string;
  node_execution_id: string;
  user_id: string;
  status: string;
  sla_hours: number | null;
  context: {
    node_label?: string;
    input?: unknown;
    program_id?: string;
    reason?: string;
    approver?: string;
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

type EscalationEntry = {
  id: string;
  escalation_reason: string;
  escalated_to: string;
  created_at: string;
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

function formatTimeRemaining(ms: number) {
  if (ms <= 0) return "SLA breached";
  const totalMins = Math.floor(ms / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function ApprovalCard({ approval }: { approval: ApprovalRow }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<"approved" | "rejected" | null>(null);
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [escalations, setEscalations] = useState<EscalationEntry[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [slaRemaining, setSlaRemaining] = useState<number | null>(null);

  // SLA countdown
  useEffect(() => {
    const slaHours = approval.sla_hours ?? 24;
    const createdAt = new Date(approval.created_at).getTime();
    const deadline = createdAt + slaHours * 60 * 60 * 1000;

    function tick() {
      const remaining = deadline - Date.now();
      setSlaRemaining(remaining);
    }

    tick();
    const interval = setInterval(tick, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [approval.created_at, approval.sla_hours]);

  const isSlaBreached = slaRemaining !== null && slaRemaining <= 0;
  const isUrgent =
    slaRemaining !== null && slaRemaining > 0 && slaRemaining < 3600000; // < 1 hour

  const programName =
    approval.node_executions?.runs?.programs?.name ?? "Unknown program";
  const runId = approval.node_executions?.run_id;
  const programId = approval.node_executions?.runs?.program_id;
  const nodeLabel = approval.context?.node_label ?? approval.node_executions?.node_id;
  const reason = approval.context?.reason;
  const approver = approval.context?.approver;

  // Fetch escalations when timeline is opened
  const fetchTimeline = useCallback(async () => {
    try {
      const res = await fetch(`/api/approvals/${approval.id}/timeline`);
      if (res.ok) {
        const data = await res.json();
        const escEvents = (data.timeline ?? []).filter(
          (e: { type: string }) => e.type === "escalated"
        );
        setEscalations(
          escEvents.map((e: { id: string; timestamp: string; actor: string; details: Record<string, unknown> }) => ({
            id: e.id,
            escalation_reason: (e.details?.reason as string) ?? "unknown",
            escalated_to: e.actor,
            created_at: e.timestamp,
          }))
        );
      }
    } catch {
      // Silently fail — escalation history is non-critical
    }
  }, [approval.id]);

  useEffect(() => {
    if (showTimeline && escalations.length === 0) {
      void fetchTimeline();
    }
  }, [showTimeline, fetchTimeline, escalations.length]);

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

  async function escalate() {
    setEscalating(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${approval.id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: isSlaBreached ? "SLA breach" : "Manual escalation",
        }),
      });
      if (res.ok) {
        setEscalated(true);
        window.dispatchEvent(new CustomEvent("approval-changed"));
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(
          friendlyResponseMessage(
            body as { error?: string },
            "Could not escalate. Please try again."
          )
        );
      }
    } catch {
      setError("Could not connect to escalate. Check your connection.");
    } finally {
      setEscalating(false);
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
      {/* SLA Breach Banner */}
      {isSlaBreached && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-5 py-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-xs font-medium text-red-400">
            SLA breached — this approval has exceeded its {approval.sla_hours ?? 24}h deadline
          </span>
        </div>
      )}

      {/* Urgent Banner (< 1h remaining) */}
      {!isSlaBreached && isUrgent && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-xs font-medium text-amber-400">
            SLA expiring soon — {formatTimeRemaining(slaRemaining ?? 0)} remaining
          </span>
        </div>
      )}

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
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
            <Clock className="h-3 w-3" />
            {timeAgo(approval.created_at)}
          </div>
          {/* SLA countdown */}
          {slaRemaining !== null && (
            <div
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                isSlaBreached
                  ? "bg-red-500/20 text-red-400"
                  : isUrgent
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-white/[0.06] text-muted-foreground/60"
              }`}
            >
              {isSlaBreached
                ? "SLA breached"
                : `${formatTimeRemaining(slaRemaining)} left`}
            </div>
          )}
        </div>
      </div>

      {/* Assigned approver (recorded on the decision for audit evidence) */}
      {approver && (
        <div className="mx-5 mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Assigned approver:</span>
          <span>{approver}</span>
        </div>
      )}

      {/* Reason */}
      {reason && (
        <div className="mx-5 mb-4 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {reason}
            {reason.startsWith("Bulk write approval required") && (
              <>
                {" "}
                You can change this in{" "}
                <Link
                  href="/workspaces#bulk-write-threshold"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  settings
                </Link>
                .
              </>
            )}
          </p>
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

      {/* Escalation History */}
      {escalations.length > 0 && (
        <div className="mx-5 mb-4">
          <button
            onClick={() => setShowTimeline((s) => !s)}
            className="flex w-full items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showTimeline ? "rotate-180" : ""}`} />
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            {escalations.length} escalation{escalations.length > 1 ? "s" : ""}
          </button>
          {showTimeline && (
            <div className="mt-2 space-y-2">
              {escalations.map((esc) => (
                <div
                  key={esc.id}
                  className="rounded-xl bg-amber-500/[0.06] border border-amber-500/20 px-3.5 py-2.5"
                >
                  <p className="text-xs text-amber-400 font-medium">
                    Escalated to {esc.escalated_to}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                    {esc.escalation_reason.replace("manual:", "")} ·{" "}
                    {timeAgo(esc.created_at)}
                  </p>
                </div>
              ))}
            </div>
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

        <div className="flex items-center gap-2 flex-wrap">
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
          <Button
            variant="outline"
            size="sm"
            onClick={escalate}
            disabled={escalating || escalated}
            className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/50"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            {escalated
              ? "Escalated"
              : escalating
                ? "Escalating…"
                : "Escalate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
