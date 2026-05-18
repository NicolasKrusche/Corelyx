"use client";

import { useState } from "react";
import Link from "next/link";

export type TriggerEvent = {
  id: string;
  trigger_id: string | null;
  run_id: string | null;
  fired_at: string;
  source: string;
  status: "dispatched" | "skipped" | "failed";
  message: string | null;
  payload?: unknown;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SOURCE_LABELS: Record<string, string> = {
  cron:    "Cron",
  webhook: "Webhook",
  program: "Program",
  event:   "Event",
  manual:  "Manual",
};

const SOURCE_COLORS: Record<string, string> = {
  cron:    "bg-blue-500/10 text-blue-500",
  webhook: "bg-purple-500/10 text-purple-500",
  program: "bg-green-500/10 text-green-500",
  event:   "bg-orange-500/10 text-orange-500",
  manual:  "bg-muted text-muted-foreground",
};

const STATUS_STYLES: Record<string, string> = {
  dispatched: "bg-green-500/10 text-green-600 dark:text-green-400",
  skipped:    "bg-muted/60 text-muted-foreground",
  failed:     "bg-red-500/10 text-red-500",
};

const STATUS_DOT: Record<string, string> = {
  dispatched: "bg-green-500",
  skipped:    "bg-muted-foreground/40",
  failed:     "bg-red-500",
};

// ─── Payload inspector ─────────────────────────────────────────────────────────

function PayloadInspector({ payload }: { payload: unknown }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (payload === null || payload === undefined) return null;

  const json = JSON.stringify(payload, null, 2);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-2 ml-0">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center gap-1 text-[10px] font-medium text-purple-500/80 hover:text-purple-500 transition-colors"
      >
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
        {open ? "Hide" : "View"} payload
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border border-purple-500/15 bg-purple-500/5 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-purple-500/10">
            <span className="text-[10px] font-medium text-purple-500/60 font-mono">webhook_payload</span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors px-1.5 py-0.5 rounded"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground/80 overflow-x-auto max-h-48 leading-relaxed whitespace-pre">
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ ev, programId }: { ev: TriggerEvent; programId: string }) {
  const hasPayload =
    ev.source === "webhook" &&
    ev.payload !== null &&
    ev.payload !== undefined &&
    typeof ev.payload === "object" &&
    Object.keys(ev.payload as object).length > 0;

  return (
    <div className="px-4 py-3 text-sm hover:bg-accent/20 transition-colors">
      <div className="flex items-center gap-3">
        {/* Source badge */}
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold font-mono ${SOURCE_COLORS[ev.source] ?? "bg-muted text-muted-foreground"}`}
        >
          {SOURCE_LABELS[ev.source] ?? ev.source}
        </span>

        {/* Status badge */}
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLES[ev.status] ?? "bg-muted text-muted-foreground"}`}
        >
          <span className={`h-1 w-1 rounded-full ${STATUS_DOT[ev.status] ?? "bg-muted-foreground"}`} />
          {ev.status}
        </span>

        {/* Message */}
        <p className="flex-1 truncate text-xs text-muted-foreground/70">
          {ev.message ?? (ev.status === "dispatched" ? "Run created" : "")}
        </p>

        {/* Run link */}
        {ev.run_id && (
          <Link
            href={`/programs/${programId}/runs/${ev.run_id}`}
            className="shrink-0 font-mono text-[10px] text-primary/70 hover:text-primary transition-colors"
            title="View run"
          >
            run →
          </Link>
        )}

        {/* Timestamp */}
        <span
          className="shrink-0 text-[11px] text-muted-foreground/40 font-mono tabular-nums"
          title={new Date(ev.fired_at).toLocaleString()}
        >
          {timeAgo(ev.fired_at)}
        </span>
      </div>

      {/* Payload inspector (webhook events only) */}
      {hasPayload && <PayloadInspector payload={ev.payload} />}
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  events: TriggerEvent[];
  programId: string;
}

export function TriggerEventLog({ events, programId }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Recent activity</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          last 50
        </span>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <p className="text-sm font-medium">No trigger activity yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Events will appear here the first time a trigger fires.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border/60">
          {events.map((ev) => (
            <EventRow key={ev.id} ev={ev} programId={programId} />
          ))}
        </div>
      )}
    </section>
  );
}
