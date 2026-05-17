import Link from "next/link";

export type TriggerEvent = {
  id: string;
  trigger_id: string | null;
  run_id: string | null;
  fired_at: string;
  source: string;
  status: "dispatched" | "skipped" | "failed";
  message: string | null;
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
            <div
              key={ev.id}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent/20 transition-colors"
            >
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
          ))}
        </div>
      )}
    </section>
  );
}
