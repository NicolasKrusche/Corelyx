"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const DATA_REQUEST_TYPES = [
  { value: "access", article: "Art. 15", label: "Access", help: "Receive a copy of account and workflow data held by Corelyx." },
  { value: "rectification", article: "Art. 16", label: "Rectification", help: "Ask us to correct inaccurate or incomplete personal data." },
  { value: "erasure", article: "Art. 17", label: "Erasure", help: "Queue a reviewed erasure request. Immediate account deletion still requires Settings > Danger zone after sign-in verification." },
  { value: "restriction", article: "Art. 18", label: "Restriction", help: "Pause new processing while a request is reviewed." },
  { value: "portability", article: "Art. 20", label: "Portability", help: "Use the machine-readable JSON export for switching or reuse." },
  { value: "objection", article: "Art. 21", label: "Objection", help: "Object to processing based on legitimate interests." },
  { value: "withdrawal", article: "Art. 7", label: "Withdraw consent", help: "Withdraw consent for consent-based processing." },
] as const;

const POLICY_LINKS = [
  { href: "/privacy", label: "Privacy Policy", description: "Controller notice, purposes, rights, retention, and contacts." },
  { href: "/terms", label: "Terms of Service", description: "Acceptable use, AI Act limits, and customer responsibilities." },
  { href: "/impressum", label: "Impressum", description: "Austrian/German legal identity publication." },
  { href: "/dpa", label: "Data Processing Agreement", description: "Processor terms and Article 28 controls." },
  { href: "/subprocessors", label: "Subprocessor Registry", description: "Third-party processors and change notice information." },
  { href: "/security", label: "Security Policy", description: "Security measures, disclosure process, and response targets." },
  { href: "/dpia-template", label: "DPIA Template", description: "Customer workflow risk assessment template." },
  { href: "/data-export-schema", label: "Export Schema", description: "Documented machine-readable export fields." },
];

type DataRequestType = (typeof DATA_REQUEST_TYPES)[number]["value"];

type DataSubjectRequest = {
  id: string;
  request_type: DataRequestType;
  status: "submitted" | "in_review" | "waiting_on_user" | "completed" | "rejected";
  details: string | null;
  response_summary: string | null;
  submitted_at: string;
  due_at: string;
  completed_at: string | null;
};

type StatusMessage = {
  type: "success" | "error";
  message: string;
};

type EuComplianceCenterProps = {
  className?: string;
  variant?: "full" | "compact";
  onNavigate?: () => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(status: DataSubjectRequest["status"]) {
  return status.replace(/_/g, " ");
}

function statusClass(status: DataSubjectRequest["status"]) {
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

function selectedRequestHelp(requestType: DataRequestType) {
  return DATA_REQUEST_TYPES.find((item) => item.value === requestType)?.help ?? "";
}

export function EuComplianceCenter({
  className,
  variant = "full",
  onNavigate,
}: EuComplianceCenterProps) {
  const [requestType, setRequestType] = useState<DataRequestType>("access");
  const [details, setDetails] = useState("");
  const [requests, setRequests] = useState<DataSubjectRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const panelClass = variant === "compact"
    ? "rounded-2xl border border-border bg-card p-5 shadow-sm"
    : "rounded-lg border border-border bg-card p-4";
  const subPanelClass = variant === "compact"
    ? "rounded-2xl border border-border bg-secondary/35 p-5"
    : "rounded-lg border border-border bg-secondary/35 p-4";
  const linkClass = "rounded-xl border border-border px-3 py-3 text-left text-sm text-foreground transition-colors hover:bg-accent";

  const openRequests = useMemo(
    () => requests.filter((request) => !["completed", "rejected"].includes(request.status)).length,
    [requests]
  );

  async function refreshRequests() {
    setLoadingRequests(true);
    const res = await fetch("/api/user/data-request", { cache: "no-store" });
    if (!res.ok) {
      setLoadingRequests(false);
      setStatus({ type: "error", message: "Could not load data subject request history." });
      return;
    }
    const body = await res.json().catch(() => null) as { requests?: DataSubjectRequest[] } | null;
    setRequests(body?.requests ?? []);
    setLoadingRequests(false);
  }

  useEffect(() => {
    void refreshRequests();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const res = await fetch("/api/user/data-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: requestType,
        details: details.trim() || undefined,
      }),
    });

    const body = await res.json().catch(() => null) as {
      error?: string;
      request?: DataSubjectRequest;
    } | null;

    if (!res.ok || !body?.request) {
      setStatus({ type: "error", message: body?.error ?? "Could not submit the data subject request." });
      setSubmitting(false);
      return;
    }

    setRequests((current) => [body.request!, ...current]);
    setStatus({
      type: "success",
      message: `Request ${body.request.id} submitted. Response due by ${formatDate(body.request.due_at)}.`,
    });
    setDetails("");
    setRequestType("access");
    setSubmitting(false);
  }

  return (
    <div className={cn("space-y-6", className)}>
      <section className={panelClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">EU Compliance</p>
        <p className="mt-3 text-sm text-foreground">
          Access customer-facing compliance materials, GDPR rights controls, export tooling, request tracking, and audit evidence for this workspace.
        </p>
      </section>

      <section className={panelClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">GDPR controls</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Use these controls for access, portability, erasure, objection, restriction, and accountability evidence.
            </p>
          </div>
          <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            {openRequests} open
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <a href="/api/user/export" download onClick={onNavigate} className={linkClass}>
            <span className="block font-medium">Download data export</span>
            <span className="mt-1 block text-xs text-muted-foreground">GDPR Articles 15 and 20 JSON export.</span>
          </a>
          <Link href="/data-export-schema" onClick={onNavigate} className={linkClass}>
            <span className="block font-medium">Review export schema</span>
            <span className="mt-1 block text-xs text-muted-foreground">Field-level export documentation.</span>
          </Link>
          <Link href="/logs" onClick={onNavigate} className={linkClass}>
            <span className="block font-medium">View audit logs</span>
            <span className="mt-1 block text-xs text-muted-foreground">Recent workspace processing and security events.</span>
          </Link>
          <Link href="/settings#danger-zone" onClick={onNavigate} className={linkClass}>
            <span className="block font-medium">Account deletion</span>
            <span className="mt-1 block text-xs text-muted-foreground">Direct erasure flow for your Corelyx account.</span>
          </Link>
        </div>
      </section>

      <section className={panelClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Submit data subject request</p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="dsr-request-type">
              Request type
            </label>
            <select
              id="dsr-request-type"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as DataRequestType)}
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              {DATA_REQUEST_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.article} - {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">{selectedRequestHelp(requestType)}</p>
            {requestType === "erasure" && (
              <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Submitting this request does not delete the account by itself. To immediately erase your Corelyx account, use Settings &gt; Danger zone &gt; Delete my account.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="dsr-details">
              Details
            </label>
            <textarea
              id="dsr-details"
              rows={variant === "compact" ? 3 : 4}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={4000}
              className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Describe what you need. Do not include passwords, API keys, or other secrets."
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{details.length}/4000</p>
          </div>

          {status && (
            <p
              className={cn(
                "rounded-lg border px-3 py-2 text-xs",
                status.type === "success"
                  ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300"
                  : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
              )}
            >
              {status.message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit request"}
          </button>
        </form>
      </section>

      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Request history</p>
          <button
            type="button"
            onClick={() => void refreshRequests()}
            disabled={loadingRequests}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-accent disabled:opacity-50"
          >
            {loadingRequests ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {loadingRequests && requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading request history...</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data subject requests have been submitted yet.</p>
          ) : (
            requests.slice(0, variant === "compact" ? 4 : 8).map((request) => (
              <div key={request.id} className="rounded-xl border border-border bg-background/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium capitalize text-foreground">
                      {request.request_type.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submitted {formatDate(request.submitted_at)}. Due {formatDate(request.due_at)}.
                    </p>
                  </div>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", statusClass(request.status))}>
                    {statusLabel(request.status)}
                  </span>
                </div>
                {request.completed_at && (
                  <p className="mt-2 text-xs text-muted-foreground">Completed {formatDate(request.completed_at)}.</p>
                )}
                {request.response_summary && (
                  <p className="mt-2 rounded-lg bg-secondary/70 px-2.5 py-2 text-xs text-muted-foreground">
                    {request.response_summary}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className={panelClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Policies & evidence</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {POLICY_LINKS.map((item) => (
            <Link key={item.href} href={item.href} onClick={onNavigate} className={linkClass}>
              <span className="block font-medium">{item.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={subPanelClass}>
        <p className="text-sm font-medium text-foreground">Regulatory reference</p>
        <p className="mt-1 text-sm text-muted-foreground">
          GDPR rights and deadlines are based on Articles 7 and 15-22, including the standard one-month response period under Article 12.
        </p>
        <a href="https://gdpr-info.eu/" target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-primary hover:underline underline-offset-2">
          Read the GDPR text
        </a>
      </section>
    </div>
  );
}
