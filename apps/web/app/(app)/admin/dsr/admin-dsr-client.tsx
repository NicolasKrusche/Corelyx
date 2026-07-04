"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CineEyebrow } from "@/components/cinematic";

type DsrStatus = "submitted" | "in_review" | "waiting_on_user" | "completed" | "rejected";

type DsrRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  request_type: string;
  status: DsrStatus;
  requester_email: string | null;
  details: string | null;
  response_summary: string | null;
  submitted_at: string;
  due_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS: DsrStatus[] = ["in_review", "waiting_on_user", "completed", "rejected"];

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusClass(status: DsrStatus) {
  switch (status) {
    case "completed":
      return "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300";
    case "rejected":
      return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
    case "waiting_on_user":
      return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "in_review":
      return "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    default:
      return "border-border bg-secondary text-muted-foreground";
  }
}

function isOverdue(value: string) {
  return new Date(value).getTime() < Date.now();
}

export function AdminDsrClient() {
  const [requests, setRequests] = useState<DsrRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [status, setStatus] = useState<DsrStatus>("completed");
  const [response, setResponse] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? requests[0] ?? null,
    [requests, selectedId]
  );

  const openCount = requests.filter((request) => !["completed", "rejected"].includes(request.status)).length;

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const url = includeClosed ? "/api/admin/dsr?include_closed=1" : "/api/admin/dsr";
    // try/finally guarantees the loading flag clears — a network error or a
    // thrown JSON parse would otherwise leave "Refreshing…/Loading requests…" up.
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json() as { requests?: DsrRow[] };
        setRequests(data.requests ?? []);
      } else {
        setMessage({ type: "error", text: "Could not load data subject requests." });
      }
    } catch {
      setMessage({ type: "error", text: "Could not load data subject requests. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }, [includeClosed]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (!selected) {
      setSelectedId(null);
      setResponse("");
      setStatus("completed");
      return;
    }
    setSelectedId(selected.id);
    setStatus(selected.status === "submitted" ? "in_review" : selected.status);
    setResponse(selected.response_summary ?? "");
  }, [selected]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/dsr", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        status,
        response_summary: response.trim() || null,
      }),
    });

    const body = await res.json().catch(() => null) as { request?: DsrRow; error?: string } | null;
    if (!res.ok || !body?.request) {
      setMessage({ type: "error", text: body?.error ?? "Could not update request." });
      setSaving(false);
      return;
    }

    setRequests((current) => current.map((row) => row.id === body.request!.id ? body.request! : row));
    setMessage({
      type: "success",
      text: ["completed", "rejected", "waiting_on_user"].includes(body.request.status)
        ? "Request updated and response email queued."
        : "Request updated.",
    });
    setSaving(false);
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <CineEyebrow className="mb-1">Admin</CineEyebrow>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">DSR Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review open GDPR requests, write responses, and mark fulfillment status.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Include closed
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Open requests <span className="text-foreground/50">({openCount})</span>
            </p>
            <button
              type="button"
              onClick={() => void fetchRequests()}
              disabled={loading}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {loading && requests.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Loading requests...</p>
          ) : requests.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No matching data subject requests.</p>
          ) : (
            <div className="divide-y divide-border">
              {requests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => setSelectedId(request.id)}
                  className={cn(
                    "block w-full px-4 py-3 text-left transition-colors hover:bg-accent",
                    selected?.id === request.id && "bg-accent"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize text-foreground">
                        {request.request_type.replace(/_/g, " ")}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {request.requester_email ?? request.user_id}
                      </p>
                    </div>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", statusClass(request.status))}>
                      {request.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span>Submitted {formatDate(request.submitted_at)}</span>
                    <span className={isOverdue(request.due_at) && !["completed", "rejected"].includes(request.status) ? "text-red-600 dark:text-red-300" : ""}>
                      Due {formatDate(request.due_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-border bg-card p-4">
          {selected ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Request</p>
                <p className="mt-2 text-sm font-semibold capitalize text-foreground">
                  {selected.request_type.replace(/_/g, " ")}
                </p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{selected.id}</p>
              </div>

              <div className="rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                <p>User: {selected.requester_email ?? selected.user_id}</p>
                <p>Submitted: {formatDate(selected.submitted_at)}</p>
                <p>Due: {formatDate(selected.due_at)}</p>
              </div>

              {selected.details && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Details</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 text-sm text-foreground">
                    {selected.details}
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="dsr-status">Status</label>
                <select
                  id="dsr-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DsrStatus)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="dsr-response">Response</label>
                <textarea
                  id="dsr-response"
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={8}
                  maxLength={8000}
                  className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Write the response that should be stored and sent to the requester."
                />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">{response.length}/8000</p>
              </div>

              {message && (
                <p className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  message.type === "success"
                    ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300"
                    : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
                )}>
                  {message.text}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save response"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Select a request to review.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
