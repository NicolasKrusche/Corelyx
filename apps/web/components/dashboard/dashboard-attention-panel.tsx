"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, CircleCheck, Clock3, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

export type DashboardApproval = {
  id: string;
  createdAt: string;
  nodeLabel: string;
  reason: string | null;
  programId: string;
  programName: string;
  runId: string;
};

export type DashboardFailedRun = {
  id: string;
  createdAt: string;
  programId: string;
  programName: string;
  triggeredBy: string;
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ApprovalItem({ approval }: { approval: DashboardApproval }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"approved" | "rejected" | null>(null);
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setSubmitting(decision);
    setError(null);

    try {
      const response = await fetch(`/api/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(friendlyResponseMessage(body as { error?: string }, "We could not save your decision."));
        return;
      }

      setDecided(decision);
      window.dispatchEvent(new CustomEvent("approval-changed"));
      router.refresh();
    } catch {
      setError("We could not connect. Please try again.");
    } finally {
      setSubmitting(null);
    }
  }

  if (decided) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
        <CircleCheck className="h-4 w-4 shrink-0" />
        Decision recorded
      </div>
    );
  }

  return (
    <article className="rounded-xl border border-border/70 bg-background/45 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold">{approval.nodeLabel}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {approval.programName} · {timeAgo(approval.createdAt)}
          </p>
        </div>
      </div>
      {approval.reason && (
        <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
          {approval.reason}
        </p>
      )}
      {error && <p className="mt-2 text-[10px] text-destructive">{error}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => void decide("approved")}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          {submitting === "approved" ? "Approving..." : "Approve"}
        </button>
        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => void decide("rejected")}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-border text-[11px] font-semibold transition-colors hover:bg-muted disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          {submitting === "rejected" ? "Declining..." : "Decline"}
        </button>
      </div>
    </article>
  );
}

export function DashboardAttentionPanel({
  approvals,
  failedRuns,
}: {
  approvals: DashboardApproval[];
  failedRuns: DashboardFailedRun[];
}) {
  // Render everything we are given: silently capping the list made the
  // "Needs attention" counts elsewhere disagree with what users see here.
  const visibleApprovals = approvals;
  const visibleFailedRuns = failedRuns;
  const isEmpty = visibleApprovals.length === 0 && visibleFailedRuns.length === 0;

  return (
    <aside className="overflow-hidden rounded-2xl border border-border/80 bg-card/80 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold">Needs your attention</h2>
          {approvals.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-500">
              {approvals.length}
            </span>
          )}
        </div>
        <Link href="/approvals" className="text-[11px] font-semibold text-primary transition-colors hover:text-primary/80">
          View all
        </Link>
      </div>

      <div className="space-y-3 p-3">
        {visibleApprovals.map((approval) => (
          <ApprovalItem key={approval.id} approval={approval} />
        ))}

        {visibleFailedRuns.map((run) => (
          <Link
            key={run.id}
            href={`/programs/${run.programId}/runs/${run.id}`}
            className="group flex items-start gap-2.5 rounded-xl border border-red-500/15 bg-red-500/[0.04] p-3 transition-colors hover:bg-red-500/[0.08]"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">Failed run</p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{run.programName}</p>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <Clock3 className="h-3 w-3" />
                {timeAgo(run.createdAt)} · {run.triggeredBy}
              </p>
            </div>
            <ArrowRight className="mt-1 h-3.5 w-3.5 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </Link>
        ))}

        {isEmpty && (
          <div className="px-3 py-8 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CircleCheck className="h-5 w-5" />
            </span>
            <p className="mt-3 text-xs font-bold">Everything looks clear</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              No approvals or failed runs need your attention.
            </p>
          </div>
        )}
      </div>

      {!isEmpty && (
        <Link
          href="/runs"
          className={cn(
            "flex items-center justify-between border-t border-border/70 px-4 py-3 text-[11px] font-semibold text-muted-foreground transition-colors",
            "hover:bg-muted/40 hover:text-foreground"
          )}
        >
          Open activity center
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </aside>
  );
}
