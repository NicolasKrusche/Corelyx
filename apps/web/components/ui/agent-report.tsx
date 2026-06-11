"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type AgentReportMetric = {
  label: string;
  value: string | number;
  /** Optional emphasis colour. */
  tone?: "default" | "good" | "warn" | "bad";
};

export type AgentReportData = {
  metrics?: AgentReportMetric[];
};

const TONE_CLASS: Record<NonNullable<AgentReportMetric["tone"]>, string> = {
  default: "text-foreground",
  good: "text-emerald-500",
  warn: "text-amber-500",
  bad: "text-destructive",
};

const OUTCOME_META: Record<string, { label: string; cls: string }> = {
  success: { label: "Success", cls: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400" },
  partial: { label: "Partial", cls: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400" },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive ring-destructive/20" },
};

function parseOutcome(data: unknown): { label: string; cls: string } | null {
  if (!data || typeof data !== "object") return null;
  const o = (data as { outcome?: unknown }).outcome;
  return typeof o === "string" && o in OUTCOME_META ? OUTCOME_META[o] : null;
}

function parseMetrics(data: unknown): AgentReportMetric[] {
  if (!data || typeof data !== "object") return [];
  const raw = (data as { metrics?: unknown }).metrics;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      label: typeof m.label === "string" ? m.label : "",
      value:
        typeof m.value === "string" || typeof m.value === "number" ? m.value : String(m.value ?? ""),
      tone: (["default", "good", "warn", "bad"] as const).includes(m.tone as never)
        ? (m.tone as AgentReportMetric["tone"])
        : "default",
    }))
    .filter((m) => m.label || m.value !== "")
    .slice(0, 8);
}

/** Renders one agent report: optional metric cards + GFM markdown body. */
export function AgentReport({
  title,
  body,
  dryRun,
  data,
}: {
  title: string;
  body: string;
  dryRun?: boolean;
  data?: unknown;
}) {
  const metrics = parseMetrics(data);
  const outcome = parseOutcome(data);

  return (
    <div className="rounded-2xl border glass-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
        {outcome && (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${outcome.cls}`}>
            {outcome.label}
          </span>
        )}
        {dryRun && <Badge variant="secondary" className="text-[10px]">preview</Badge>}
      </div>

      {metrics.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {metrics.map((m, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-background/40 p-3">
              <p className={`text-xl font-semibold tabular-nums ${TONE_CLASS[m.tone ?? "default"]}`}>{m.value}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="text-sm leading-relaxed text-foreground/90">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
            h2: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-semibold first:mt-0">{children}</h3>,
            h3: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h4>,
            p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
            li: ({ children }) => <li className="marker:text-muted-foreground">{children}</li>,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                {children}
              </a>
            ),
            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
            code: ({ children }) => (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
            ),
            hr: () => <hr className="my-4 border-border/60" />,
            blockquote: ({ children }) => (
              <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
            ),
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full border-collapse text-xs">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
            th: ({ children }) => (
              <th className="border-b border-border/60 px-3 py-2 text-left font-semibold">{children}</th>
            ),
            td: ({ children }) => (
              <td className="border-b border-border/40 px-3 py-2 align-top">{children}</td>
            ),
          }}
        >
          {body}
        </ReactMarkdown>
      </div>

      <p className="mt-4 border-t border-border/40 pt-2 text-[10px] italic text-muted-foreground/70">
        ⚠ AI-generated report — may contain errors and is not professional advice.
        Verify important results before relying on them.
      </p>
    </div>
  );
}
