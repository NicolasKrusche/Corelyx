"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────

type ErrorCategory =
  | "api_rate_limit"
  | "auth_expired"
  | "data_format_mismatch"
  | "timeout"
  | "schema_validation"
  | "connection_not_found"
  | "api_key_invalid"
  | "permission_denied"
  | "network_error"
  | "unknown";

type FixType = "auto_fix" | "manual_fix" | "reconnect";

interface FixSuggestion {
  type: FixType;
  title: string;
  description: string;
  action_url?: string;
  action_label?: string;
}

interface NodeAnalysis {
  node_id: string;
  node_label: string;
  node_type: string;
  error_category: ErrorCategory;
  error_message: string;
  root_cause: string;
  fix_suggestions: FixSuggestion[];
  confidence: number;
}

interface FailureAnalysis {
  run_id: string;
  overall_category: ErrorCategory;
  root_cause_summary: string;
  nodes: NodeAnalysis[];
  fix_suggestions: FixSuggestion[];
  analyzed_at: string;
}

// ─── Category Display ──────────────────────────────────────────────────────

const CATEGORY_META: Record<
  ErrorCategory,
  { label: string; color: string; bg: string; icon: string }
> = {
  api_rate_limit: {
    label: "Rate Limited",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    icon: "⚡",
  },
  auth_expired: {
    label: "Auth Expired",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: "🔐",
  },
  data_format_mismatch: {
    label: "Data Format",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    icon: "📊",
  },
  timeout: {
    label: "Timeout",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    icon: "⏱",
  },
  schema_validation: {
    label: "Schema Error",
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
    icon: "📋",
  },
  connection_not_found: {
    label: "Missing Connection",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    icon: "🔗",
  },
  api_key_invalid: {
    label: "Invalid API Key",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    icon: "🔑",
  },
  permission_denied: {
    label: "Permission Denied",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    icon: "🚫",
  },
  network_error: {
    label: "Network Error",
    color: "text-sky-400",
    bg: "bg-sky-500/10 border-sky-500/20",
    icon: "🌐",
  },
  unknown: {
    label: "Unknown Error",
    color: "text-muted-foreground",
    bg: "bg-muted/50 border-border",
    icon: "❓",
  },
};

function CategoryBadge({ category }: { category: ErrorCategory }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.color}`}
    >
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

// ─── Fix Suggestion Card ───────────────────────────────────────────────────

function FixCard({
  fix,
  onAutoFix,
}: {
  fix: FixSuggestion;
  onAutoFix?: (fix: FixSuggestion) => void;
}) {
  const isAuto = fix.type === "reconnect";

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{fix.title}</p>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            fix.type === "auto_fix"
              ? "bg-green-500/15 text-green-500"
              : fix.type === "reconnect"
                ? "bg-amber-500/15 text-amber-500"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {fix.type === "auto_fix"
            ? "Auto-Fix"
            : fix.type === "reconnect"
              ? "Reconnect"
              : "Manual"}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {fix.description}
      </p>
      <div className="flex items-center gap-2 pt-0.5">
        {isAuto && fix.action_url && (
          <button
            onClick={() => onAutoFix?.(fix)}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3 h-3"
            >
              <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm-.75 3.75a.75.75 0 0 0-1.5 0v3.5c0 .28.16.537.415.657l2.5 1.5a.75.75 0 1 0 .67-1.344L7.25 8.1V4.75Z" />
            </svg>
            {fix.action_label ?? "Auto-Fix"}
          </button>
        )}
        {!isAuto && fix.action_url && (
          <Link
            href={fix.action_url}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            {fix.action_label ?? "Fix Manually →"}
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function FailureAnalysisPanel({
  runId,
  runStatus,
  runErrorMessage,
}: {
  runId: string;
  runStatus: string;
  runErrorMessage?: string | null;
}) {
  const [analysis, setAnalysis] = useState<FailureAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const fetchAnalysis = useCallback(async () => {
    if (runStatus !== "failed") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Analysis failed (${res.status})`);
      }
      const data = (await res.json()) as { analysis: FailureAnalysis };
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [runId, runStatus]);

  // Auto-fetch on mount for failed runs
  useEffect(() => {
    if (runStatus === "failed" && !analysis && !loading) {
      fetchAnalysis();
    }
  }, [runStatus, analysis, loading, fetchAnalysis]);

  // Only show for failed runs
  if (runStatus !== "failed") return null;

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-500/[0.05] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-500/15">
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3.5 h-3.5 text-red-400"
            >
              <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1ZM8 9.5a.75.75 0 0 0 0-1.5.75.75 0 0 0 0 1.5ZM7.25 6.75a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-1.5 0v-1.5Z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-red-400">
              AI Failure Analysis
            </p>
            {analysis && (
              <p className="text-[10px] text-muted-foreground">
                {analysis.nodes.length} node{analysis.nodes.length !== 1 ? "s" : ""} analyzed ·{" "}
                {analysis.overall_category.replace(/_/g, " ")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!analysis && !loading && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                fetchAnalysis();
              }}
              className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
            >
              Analyze
            </span>
          )}
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-red-500/10 px-4 py-3 space-y-3">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-xs text-muted-foreground">
                Analyzing failure pattern…
              </p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <p className="text-xs text-red-400">{error}</p>
              <button
                onClick={fetchAnalysis}
                className="mt-2 text-[10px] font-semibold text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Analysis results */}
          {analysis && !loading && (
            <>
              {/* Root cause summary */}
              <div className="space-y-1.5">
                <CategoryBadge category={analysis.overall_category} />
                <p className="text-sm leading-relaxed">
                  {analysis.root_cause_summary}
                </p>
              </div>

              {/* Per-node analysis */}
              {analysis.nodes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                    Failed Nodes
                  </p>
                  {analysis.nodes.map((node) => (
                    <div
                      key={node.node_id}
                      className="rounded-lg border border-border p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CategoryBadge category={node.error_category} />
                          <span className="text-xs font-medium truncate">
                            {node.node_label}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            ({node.node_type})
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                          {Math.round(node.confidence * 100)}% confident
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {node.root_cause}
                      </p>
                      <pre className="text-[10px] text-red-400/70 font-mono whitespace-pre-wrap break-all leading-relaxed max-h-20 overflow-y-auto">
                        {node.error_message}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {/* Fix suggestions */}
              {analysis.fix_suggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                    Suggested Fixes
                  </p>
                  <div className="grid gap-2">
                    {analysis.fix_suggestions.map((fix, i) => (
                      <FixCard key={i} fix={fix} />
                    ))}
                  </div>
                </div>
              )}

              {/* Analyzed timestamp */}
              <p className="text-[9px] text-muted-foreground/30 pt-1">
                Analyzed at{" "}
                {new Date(analysis.analyzed_at).toLocaleString()}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
