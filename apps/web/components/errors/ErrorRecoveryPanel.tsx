"use client";

import { useState, useCallback } from "react";
import type { DLQEntry, ErrorCategory, ErrorAnalysisResult } from "@/lib/errors/error-analysis";

// ─── Category display ────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  ErrorCategory,
  { label: string; color: string; bg: string; icon: string }
> = {
  connector_auth: {
    label: "Auth Error",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: "🔐",
  },
  schema_validation: {
    label: "Schema Error",
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
    icon: "📋",
  },
  rate_limit: {
    label: "Rate Limited",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    icon: "⚡",
  },
  timeout: {
    label: "Timeout",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    icon: "⏱",
  },
  data_format_mismatch: {
    label: "Data Format",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    icon: "📊",
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
    label: "Unknown",
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

// ─── JSON Patch diff viewer ──────────────────────────────────────────────────

function PatchDiff({ patches }: { patches: Array<{ op: string; path: string; value?: unknown }> }) {
  if (!patches.length) return null;
  return (
    <div className="rounded-md border border-border bg-muted/40 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
          Proposed Changes
        </p>
      </div>
      <div className="divide-y divide-border/50">
        {patches.map((p, i) => (
          <div key={i} className="px-3 py-2 font-mono text-[11px]">
            <span className={p.op === "add" ? "text-green-400" : p.op === "remove" ? "text-red-400" : "text-blue-400"}>
              {p.op}
            </span>
            {" "}
            <span className="text-muted-foreground">{p.path}</span>
            {p.value != null && (
              <>
                {" → "}
                <span className="text-foreground">
                  {typeof p.value === "string" ? `"${p.value}"` : JSON.stringify(p.value)}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Recovery Panel ─────────────────────────────────────────────────────

interface ErrorRecoveryPanelProps {
  programId: string;
  runId: string;
  dlqEntry: DLQEntry;
  onReRun?: (programId: string) => void;
}

export function ErrorRecoveryPanel({
  programId,
  runId,
  dlqEntry,
  onReRun,
}: ErrorRecoveryPanelProps) {
  const [analysis, setAnalysis] = useState<ErrorAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/errors/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error_id: dlqEntry.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Analysis failed (${res.status})`);
      }
      const data = (await res.json()) as { analysis: ErrorAnalysisResult };
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [programId, dlqEntry.id]);

  const applyAndReRun = useCallback(async () => {
    if (!analysis?.fix_suggestion?.patch?.length) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/programs/${programId}/errors/fix`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error_id: dlqEntry.id,
          patch: analysis.fix_suggestion.patch,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Apply failed (${res.status})`);
      }
      setApplied(true);
      // Trigger re-run
      setRerunning(true);
      onReRun?.(programId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply fix");
    } finally {
      setApplying(false);
    }
  }, [analysis, programId, dlqEntry.id, onReRun]);

  const category = classifyErrorSync(dlqEntry.error_message);
  const meta = CATEGORY_META[category] ?? CATEGORY_META.unknown;

  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-destructive/10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-destructive/15">
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3.5 h-3.5 text-destructive"
            >
              <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1ZM8 9.5a.75.75 0 0 0 0-1.5.75.75 0 0 0 0 1.5ZM7.25 6.75a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-1.5 0v-1.5Z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">
              Error Recovery
            </p>
            <p className="text-[10px] text-muted-foreground">
              {meta.icon} {meta.label} · Node {dlqEntry.node_id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!analysis && !loading && !applied && (
            <button
              onClick={fetchAnalysis}
              className="rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              1 · Analyze
            </button>
          )}
          {applied && (
            <span className="rounded-md bg-green-500/15 px-2.5 py-1 text-[10px] font-semibold text-green-500">
              ✓ Fixed
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        {/* Error message */}
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">
            Error
          </p>
          <p className="text-[11px] text-destructive whitespace-pre-wrap break-words font-mono leading-relaxed">
            {dlqEntry.error_message}
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 py-2">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-xs text-muted-foreground">
              Analyzing root cause & generating fix…
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-xs text-red-400">{error}</p>
            <button
              onClick={() => { setError(null); fetchAnalysis(); }}
              className="mt-2 text-[10px] font-semibold text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Analysis results */}
        {analysis && !loading && (
          <>
            {/* Root cause */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                2 · Root Cause
              </p>
              <div className="flex items-center gap-2">
                <CategoryBadge category={analysis.error_category} />
                <span className="text-[10px] text-muted-foreground font-mono">
                  {Math.round(analysis.confidence * 100)}% confident
                </span>
              </div>
              <p className="text-xs leading-relaxed">
                {analysis.root_cause}
              </p>
            </div>

            {/* AI Fix suggestion */}
            {analysis.fix_suggestion && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  3 · AI Fix
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {analysis.fix_suggestion.description}
                </p>
                <PatchDiff patches={analysis.fix_suggestion.patch} />
                <button
                  onClick={applyAndReRun}
                  disabled={applying || applied}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    applied
                      ? "bg-green-500/15 text-green-500 cursor-default"
                      : applying
                        ? "bg-muted text-muted-foreground cursor-wait"
                        : "bg-primary/15 text-primary hover:bg-primary/25"
                  }`}
                >
                  {applied ? (
                    <>
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                      </svg>
                      Applied
                    </>
                  ) : applying ? (
                    <>
                      <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      Applying…
                    </>
                  ) : rerunning ? (
                    "Re-Running…"
                  ) : (
                    <>
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 13.5 1h-11Zm4.354 7.146a.75.75 0 1 1-1.06 1.06l-2-2a.75.75 0 0 1 0-1.06l2-2a.75.75 0 1 1 1.06 1.06L6.56 8l1.294 1.146Zm3.354 0a.75.75 0 1 0-1.06 1.06L11.44 8l-1.294 1.146a.75.75 0 1 0 1.06 1.06l2-2a.75.75 0 0 0 0-1.06l-2-2Z" />
                      </svg>
                      Apply &amp; Re-Run
                    </>
                  )}
                </button>
              </div>
            )}

            {!analysis.fix_suggestion && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-[11px] text-amber-400">
                  This error cannot be auto-fixed via a schema patch. Manual intervention may be required.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sync classifier (for display in panel header) ───────────────────────────

function classifyErrorSync(errorMessage: string): ErrorCategory {
  const patterns: Array<{ test: RegExp; cat: ErrorCategory }> = [
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
  for (const { test, cat } of patterns) {
    if (test.test(errorMessage)) return cat;
  }
  return "unknown";
}
