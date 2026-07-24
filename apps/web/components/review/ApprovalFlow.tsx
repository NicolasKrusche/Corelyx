"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  Clock,
  MessageSquareWarning,
  ChevronDown,
  ChevronUp,
  Send,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Approval {
  id: string;
  program_id: string;
  reviewer_id: string;
  status: "pending" | "approved" | "changes_requested";
  note: string | null;
  created_at: string;
  decided_at: string | null;
  reviewer_display_name: string | null;
  reviewer_avatar_url: string | null;
}

export interface ApprovalFlowProps {
  programId: string;
  currentUserId: string;
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Approval["status"] }) {
  if (status === "approved") {
    return (
      <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Approved
      </Badge>
    );
  }
  if (status === "changes_requested") {
    return (
      <Badge className="gap-1 bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
        <MessageSquareWarning className="h-3 w-3" />
        Changes Requested
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="h-3 w-3" />
      Pending Review
    </Badge>
  );
}

// ─── Review History Panel ───────────────────────────────────────────────────

function ReviewHistory({ approvals }: { approvals: Approval[] }) {
  const [expanded, setExpanded] = useState(false);

  if (approvals.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-foreground"
      >
        <span>Review History ({approvals.length})</span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {approvals.map((approval) => {
            const initials = approval.reviewer_display_name
              ? approval.reviewer_display_name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()
              : "??";

            return (
              <div
                key={approval.id}
                className="flex items-start gap-2 rounded-md bg-muted/50 p-2"
              >
                {approval.reviewer_avatar_url ? (
                  <img
                    src={approval.reviewer_avatar_url}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                    {initials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">
                      {approval.reviewer_display_name ?? "Anonymous"}
                    </span>
                    <StatusBadge status={approval.status} />
                  </div>
                  {approval.note && (
                    <p className="mt-1 whitespace-pre-wrap text-foreground/80">
                      {approval.note}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                    {new Date(approval.created_at).toLocaleString()}
                    {approval.decided_at &&
                      ` → decided ${new Date(approval.decided_at).toLocaleString()}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ApprovalFlow({ programId, currentUserId }: ApprovalFlowProps) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNote, setReviewNote] = useState("");
  const [actionLoading, setActionLoading] = useState<
    "request_review" | "approve" | "request_changes" | null
  >(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch(`/api/programs/${programId}/approvals`);
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const latestApproval = approvals[0] ?? null;
  const hasPendingReview =
    latestApproval?.status === "pending";

  const handleAction = async (
    action: "request_review" | "approve" | "request_changes"
  ) => {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/programs/${programId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: reviewNote.trim() || undefined,
          approval_id: latestApproval?.id,
        }),
      });
      if (res.ok) {
        setReviewNote("");
        await fetchApprovals();
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5 animate-pulse" />
        Loading review status…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Current status banner */}
      {latestApproval && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2.5",
            latestApproval.status === "approved" &&
              "border-emerald-300 bg-emerald-500/5 dark:border-emerald-500/30",
            latestApproval.status === "changes_requested" &&
              "border-amber-300 bg-amber-500/5 dark:border-amber-500/30",
            latestApproval.status === "pending" &&
              "border-blue-300 bg-blue-500/5 dark:border-blue-500/30"
          )}
        >
          <StatusBadge status={latestApproval.status} />
          <span className="flex-1 text-xs text-muted-foreground">
            by {latestApproval.reviewer_display_name ?? "Unknown"}
            {latestApproval.decided_at &&
              ` on ${new Date(latestApproval.decided_at).toLocaleDateString()}`}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {!hasPendingReview && (
          <Button
            variant="outline"
            size="sm"
            disabled={actionLoading === "request_review"}
            onClick={() => handleAction("request_review")}
            className="gap-1.5 text-xs"
          >
            <Send className="h-3.5 w-3.5" />
            {actionLoading === "request_review"
              ? "Sending…"
              : "Request Review"}
          </Button>
        )}

        {(hasPendingReview || latestApproval?.status === "changes_requested") && (
          <>
            <Button
              variant="default"
              size="sm"
              disabled={actionLoading === "approve"}
              onClick={() => handleAction("approve")}
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
            >
              <Check className="h-3.5 w-3.5" />
              {actionLoading === "approve" ? "Approving…" : "Approve"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoading === "request_changes"}
              onClick={() => handleAction("request_changes")}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-500/50 dark:text-amber-400 text-xs"
            >
              <X className="h-3.5 w-3.5" />
              {actionLoading === "request_changes"
                ? "Requesting…"
                : "Request Changes"}
            </Button>
          </>
        )}
      </div>

      {/* Optional review note */}
      <Textarea
        value={reviewNote}
        onChange={(e) => setReviewNote(e.target.value)}
        placeholder="Add a note to your review (optional)…"
        rows={2}
        className="text-xs"
      />

      {/* Review history */}
      <ReviewHistory approvals={approvals} />
    </div>
  );
}
