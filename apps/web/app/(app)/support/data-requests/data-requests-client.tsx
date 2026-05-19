"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type DsrStatus = "submitted" | "in_review" | "waiting_on_user" | "completed" | "rejected";

type DsrRow = {
  id: string;
  request_type: string;
  status: DsrStatus;
  details: string | null;
  response_summary: string | null;
  submitted_at: string;
  due_at: string;
  completed_at: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  access: "Right of Access",
  rectification: "Right to Rectification",
  erasure: "Right to Erasure",
  restriction: "Restriction of Processing",
  portability: "Data Portability",
  objection: "Right to Object",
  withdrawal: "Withdrawal of Consent",
};

const STATUS_COPY: Record<DsrStatus, { label: string; color: string; description: string }> = {
  submitted: {
    label: "Submitted",
    color: "border-border bg-muted/50 text-muted-foreground",
    description: "We've received your request and will begin review shortly.",
  },
  in_review: {
    label: "In review",
    color: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    description: "Our team is actively reviewing your request.",
  },
  waiting_on_user: {
    label: "Action needed",
    color: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    description: "We need more information from you before we can continue.",
  },
  completed: {
    label: "Completed",
    color: "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300",
    description: "Your request has been fulfilled.",
  },
  rejected: {
    label: "Closed",
    color: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
    description: "Your request could not be fulfilled as submitted.",
  },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(iso: string, status: DsrStatus) {
  return !["completed", "rejected"].includes(status) && new Date(iso).getTime() < Date.now();
}

export function DataRequestsClient({ userEmail }: { userEmail: string }) {
  const [requests, setRequests] = useState<DsrRow[]>([]);
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
      const data = await res.json() as { requests: DsrRow[] };
      setRequests(data.requests);
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
      const data = await res.json() as { request: DsrRow };
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, ...data.request } : r));
      setFollowUp((prev) => ({ ...prev, [id]: "" }));
      setSuccessId(id);
      setTimeout(() => setSuccessId(null), 4000);
    } else {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      setError(body?.error ?? "Failed to send. Please try again.");
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
          <a href="/settings/privacy" className="text-primary hover:underline">privacy settings</a>.
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
        const meta = STATUS_COPY[req.status];
        const isExpanded = expandedId === req.id;
        const needsAction = req.status === "waiting_on_user";
        const overdue = isOverdue(req.due_at, req.status);

        return (
          <div
            key={req.id}
            className={cn(
              "rounded-2xl border bg-card transition-colors",
              needsAction ? "border-amber-400/40" : "border-border"
            )}
          >
            {/* Header row */}
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
                      Action needed
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Submitted {fmt(req.submitted_at)}</span>
                  <span className={overdue ? "text-red-600 dark:text-red-400" : ""}>
                    {req.completed_at ? `Resolved ${fmt(req.completed_at)}` : `Due ${fmt(req.due_at)}`}
                    {overdue && " · overdue"}
                  </span>
                  <span className="font-mono text-[10px] opacity-50">{req.id.slice(0, 8)}…</span>
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

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
                <p className="text-xs text-muted-foreground">{meta.description}</p>

                {req.details && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Your original message</p>
                    <p className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm whitespace-pre-wrap">
                      {req.details}
                    </p>
                  </div>
                )}

                {req.response_summary && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      {req.status === "waiting_on_user" ? "What we need from you" : "Our response"}
                    </p>
                    <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm whitespace-pre-wrap">
                      {req.response_summary}
                    </p>
                  </div>
                )}

                {/* Follow-up form — only shown when waiting on user */}
                {needsAction && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold">Your reply</p>
                    <textarea
                      rows={4}
                      maxLength={4000}
                      value={followUp[req.id] ?? ""}
                      onChange={(e) => setFollowUp((prev) => ({ ...prev, [req.id]: e.target.value }))}
                      placeholder="Provide the requested information here…"
                      className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted-foreground">
                        {(followUp[req.id] ?? "").length}/4000
                      </span>
                      <div className="flex items-center gap-2">
                        {successId === req.id && (
                          <span className="text-xs text-green-600 font-medium">Sent — we&apos;ll review shortly.</span>
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

                {req.status === "completed" && (
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

      <p className="text-xs text-muted-foreground px-1">
        Requests are handled within 30 days per GDPR Article 12. Questions? Email{" "}
        <a href="mailto:legal@corelyx.app" className="text-primary hover:underline">legal@corelyx.app</a>
        {userEmail ? ` — we'll reply to ${userEmail}` : ""}.
      </p>
    </div>
  );
}
