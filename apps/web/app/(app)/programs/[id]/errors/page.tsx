"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { DLQEntry } from "@/lib/errors/error-analysis";

// ─── Error category display ──────────────────────────────────────────────────

type ErrorCategory =
  | "connector_auth"
  | "schema_validation"
  | "rate_limit"
  | "timeout"
  | "data_format_mismatch"
  | "connection_not_found"
  | "api_key_invalid"
  | "permission_denied"
  | "network_error"
  | "unknown";

const CATEGORY_META: Record<ErrorCategory, { label: string; icon: string; color: string; bg: string }> = {
  connector_auth: { label: "Auth Error", icon: "🔐", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  schema_validation: { label: "Schema Error", icon: "📋", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
  rate_limit: { label: "Rate Limited", icon: "⚡", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  timeout: { label: "Timeout", icon: "⏱", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  data_format_mismatch: { label: "Data Format", icon: "📊", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  connection_not_found: { label: "Missing Connection", icon: "🔗", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  api_key_invalid: { label: "Invalid API Key", icon: "🔑", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  permission_denied: { label: "Permission Denied", icon: "🚫", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  network_error: { label: "Network Error", icon: "🌐", color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
  unknown: { label: "Unknown", icon: "❓", color: "text-muted-foreground", bg: "bg-muted/50 border-border" },
};

function classifyError(errorMessage: string): ErrorCategory {
  const tests: Array<{ test: RegExp; cat: ErrorCategory }> = [
    { test: /token.?expir|oauth.?error|unauthorized|401/i, cat: "connector_auth" },
    { test: /schema.?valid|invalid.?schema|validation.?fail/i, cat: "schema_validation" },
    { test: /rate.?limit|429|too.?many.?request|quota.?exceed/i, cat: "rate_limit" },
    { test: /timeout|timed.?out|deadline.?exceed|504/i, cat: "timeout" },
    { test: /unexpected.?token|json.?parse|type.?mismatch|format.?error|malform/i, cat: "data_format_mismatch" },
    { test: /connection.?not.?found|no.?connection|missing.?connection/i, cat: "connection_not_found" },
    { test: /api.?key.?not.?found|invalid.?api.?key|api.?key.*invalid/i, cat: "api_key_invalid" },
    { test: /permission.?denied|forbidden|403|access.?denied/i, cat: "permission_denied" },
    { test: /network.?error|econnrefused|econnreset|fetch.?fail|dns.?fail/i, cat: "network_error" },
  ];
  for (const { test, cat } of tests) {
    if (test.test(errorMessage)) return cat;
  }
  return "unknown";
}

function CategoryBadge({ category }: { category: ErrorCategory }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.color}`}>
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProgramErrorsPage() {
  const params = useParams();
  const programId = params.id as string;

  const [entries, setEntries] = useState<DLQEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDLQ() {
      try {
        const res = await fetch(`/api/programs/${programId}/errors`);
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data = (await res.json()) as { entries: DLQEntry[] };
        setEntries(data.entries ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load errors");
      } finally {
        setLoading(false);
      }
    }
    fetchDLQ();
  }, [programId]);

  // Group entries by error category
  const grouped = entries.reduce<Record<string, DLQEntry[]>>((acc, entry) => {
    const cat = classifyError(entry.error_message);
    acc[cat] = acc[cat] ?? [];
    acc[cat].push(entry);
    return acc;
  }, {});

  const categoryOrder: ErrorCategory[] = [
    "connector_auth",
    "api_key_invalid",
    "permission_denied",
    "rate_limit",
    "timeout",
    "schema_validation",
    "data_format_mismatch",
    "connection_not_found",
    "network_error",
    "unknown",
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href={`/programs/${programId}`} className="hover:text-foreground underline underline-offset-2">
          Program
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Error Analysis</span>
      </div>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-foreground">Error Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Failed executions from the Dead Letter Queue, grouped by error type.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-8 justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading errors…</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <div className="rounded-xl border border-border bg-muted/20 py-12 text-center space-y-2">
          <p className="text-2xl">✅</p>
          <p className="text-sm font-medium text-foreground">No errors in the Dead Letter Queue</p>
          <p className="text-xs text-muted-foreground">All recent runs completed successfully.</p>
        </div>
      )}

      {/* Error groups */}
      {!loading && entries.length > 0 && (
        <div className="space-y-4">
          {categoryOrder
            .filter((cat) => grouped[cat]?.length > 0)
            .map((cat) => {
              const catEntries = grouped[cat];
              const meta = CATEGORY_META[cat];
              return (
                <div key={cat} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2.5">
                      <CategoryBadge category={cat} />
                      <span className="text-sm font-semibold text-foreground">
                        {catEntries.length} error{catEntries.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Entries */}
                  <div className="divide-y divide-border/50">
                    {catEntries.map((entry) => {
                      const isExpanded = expandedId === entry.id;
                      return (
                        <div key={entry.id}>
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-mono text-muted-foreground shrink-0">
                                Node {entry.node_id}
                              </span>
                              <span className="text-xs text-muted-foreground truncate max-w-md">
                                {entry.error_message.slice(0, 120)}
                                {entry.error_message.length > 120 ? "…" : ""}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {new Date(entry.created_at).toLocaleString()}
                              </span>
                              <svg
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          </button>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                                  Error Message
                                </p>
                                <pre className="text-[11px] text-destructive font-mono whitespace-pre-wrap break-all leading-relaxed bg-muted/40 rounded-md p-3">
                                  {entry.error_message}
                                </pre>
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-xs">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-0.5">Run ID</p>
                                  <p className="font-mono text-muted-foreground truncate">{entry.run_id}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-0.5">Attempts</p>
                                  <p className="font-mono text-muted-foreground">{entry.attempt_count}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-0.5">Status</p>
                                  <p className="font-mono text-muted-foreground">{entry.status}</p>
                                </div>
                              </div>
                              <Link
                                href={`/programs/${programId}/runs/${entry.run_id}`}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                              >
                                View full run →
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
