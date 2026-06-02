"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { friendlyResponseMessage } from "@/lib/friendly-errors";
import type { DsrMessage, DsrRowWithMessages } from "@/app/api/user/data-request/route";

const TYPE_LABELS: Record<string, string> = {
  access: "Right of Access",
  rectification: "Right to Rectification",
  erasure: "Right to Erasure",
  restriction: "Restriction of Processing",
  portability: "Data Portability",
  objection: "Right to Object",
  withdrawal: "Withdrawal of Consent",
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  submitted:        { label: "Submitted",     color: "border-border bg-muted/50 text-muted-foreground" },
  in_review:        { label: "In review",     color: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  waiting_on_user:  { label: "Action needed", color: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  completed:        { label: "Completed",     color: "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300" },
  rejected:         { label: "Closed",        color: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isOverdue(iso: string, status: string) {
  return !["completed", "rejected"].includes(status) && new Date(iso).getTime() < Date.now();
}

function MessageBubble({ msg }: { msg: DsrMessage }) {
  const isAdmin = msg.sender === "admin";
  return (
    <div className={cn("flex gap-2.5", isAdmin ? "flex-row" : "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
        isAdmin ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {isAdmin ? "C" : "Y"}
      </div>
      {/* Bubble */}
      <div className={cn(
        "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm",
        isAdmin
          ? "rounded-tl-sm bg-primary/8 border border-primary/15"
          : "rounded-tr-sm bg-muted/60 border border-border"
      )}>
        <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">{fmtTime(msg.created_at)}</p>
      </div>
    </div>
  );
}

export function DataRequestsClient({ userEmail }: { userEmail: string }) {
  const [requests, setRequests] = useState<DsrRowWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/user/data-request");
    if (res.ok) {
      const data = await res.json() as { requests: DsrRowWithMessages[] };
      setRequests(data.requests);
      // Auto-expand any request that needs action
      const actionNeeded = data.requests.find((r) => r.status === "waiting_on_user");
      if (actionNeeded) setExpandedId(actionNeeded.id);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitFollowUp(id: string) {
    const text = followUp[id]?.trim();
    if (!text) return;
    setSubmitting(id);
    setError(null);
    const res = await fetch("/api/user/data-request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, follow_up: text }),
    });
    if (res.ok) {
      setFollowUp((prev) => ({ ...prev, [id]: "" }));
      setSuccessId(id);
      setTimeout(() => setSuccessId(null), 3000);
      await load();
    } else {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      setError(friendlyResponseMessage(body, "We could not send your reply. Please try again."));
    }
    setSubmitting(null);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-4 w-36 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
              </div>
              <div className="h-5 w-20 rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <p className="text-sm font-medium">No data requests yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You haven&apos;t submitted any GDPR data requests. You can do so from your{" "}
          <Link href="/settings#data-rights" className="text-primary hover:underline">privacy settings</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {requests.map((req) => {
        const meta = STATUS_META[req.status] ?? STATUS_META.submitted;
        const isExpanded = expandedId === req.id;
        const needsAction = req.status === "waiting_on_user";
        const overdue = isOverdue(req.due_at, req.status);
        const isDone = ["completed", "rejected"].includes(req.status);

        return (
          <div
            key={req.id}
            className={cn(
              "rounded-2xl border bg-card transition-colors",
              needsAction ? "border-amber-400/40" : "border-border"
            )}
          >
            {/* Header */}
            <button
              type="button"
              className="flex w-full items-start justify-between gap-4 p-5 text-left"
              onClick={() => setExpandedId(isExpanded ? null : req.id)}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm">
                    {TYPE_LABELS[req.request_type] ?? req.request_type.replace(/_/g, " ")}
                  </p>
                  {needsAction && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Reply needed
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Submitted {fmt(req.submitted_at)}</span>
                  <span className={overdue ? "text-red-600 dark:text-red-400" : ""}>
                    {req.completed_at ? `Resolved ${fmt(req.completed_at)}` : `Due ${fmt(req.due_at)}`}
                    {overdue && " · overdue"}
                  </span>
                  {req.messages.length > 0 && (
                    <span>{req.messages.length} message{req.messages.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", meta.color)}>
                  {meta.label}
                </span>
                <svg
                  width="14" height="14" viewBox="0 0 14 14" fill="none"
                  className={cn("shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
                >
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>

            {/* Expanded — message thread */}
            {isExpanded && (
              <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">

                {req.messages.length > 0 ? (
                  <div className="space-y-3">
                    {req.messages.map((msg) => (
                      <MessageBubble key={msg.id} msg={msg} />
                    ))}
                  </div>
                ) : (
                  /* No messages yet — fall back to showing raw fields */
                  <div className="space-y-3">
                    {req.details && (
                      <div className="flex flex-row-reverse gap-2.5">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">Y</div>
                        <div className="max-w-[82%] rounded-2xl rounded-tr-sm border border-border bg-muted/60 px-3.5 py-2.5 text-sm">
                          <p className="whitespace-pre-wrap leading-relaxed">{req.details}</p>
                        </div>
                      </div>
                    )}
                    {req.response_summary && (
                      <div className="flex gap-2.5">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">C</div>
                        <div className="max-w-[82%] rounded-2xl rounded-tl-sm border border-primary/15 bg-primary/8 px-3.5 py-2.5 text-sm">
                          <p className="whitespace-pre-wrap leading-relaxed">{req.response_summary}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reply box — only when waiting on user */}
                {needsAction && (
                  <div className="pt-1">
                    <textarea
                      rows={3}
                      maxLength={4000}
                      value={followUp[req.id] ?? ""}
                      onChange={(e) => setFollowUp((prev) => ({ ...prev, [req.id]: e.target.value }))}
                      placeholder="Type your reply…"
                      className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted-foreground">
                        {(followUp[req.id] ?? "").length}/4000
                      </span>
                      <div className="flex items-center gap-2">
                        {successId === req.id && (
                          <span className="text-xs font-medium text-green-600">Sent — we&apos;ll review shortly.</span>
                        )}
                        <button
                          type="button"
                          disabled={submitting === req.id || !(followUp[req.id] ?? "").trim()}
                          onClick={() => void submitFollowUp(req.id)}
                          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                        >
                          {submitting === req.id ? "Sending…" : "Send reply"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {isDone && (
                  <p className="text-xs text-muted-foreground">
                    Need further help? Contact{" "}
                    <a href="mailto:legal@corelyx.app" className="text-primary hover:underline">legal@corelyx.app</a>.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <p className="px-1 text-xs text-muted-foreground">
        Requests are handled within 30 days per GDPR Article 12. Questions? Email{" "}
        <a href="mailto:legal@corelyx.app" className="text-primary hover:underline">legal@corelyx.app</a>
        {userEmail ? ` — we'll reply to ${userEmail}` : ""}.
      </p>
    </div>
  );
}
