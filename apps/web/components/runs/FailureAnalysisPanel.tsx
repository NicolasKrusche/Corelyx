"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { CATEGORY_LABEL } from "@/lib/runs/failure-analysis";
import type {
  ErrorCategory,
  FailureAnalysis,
  FixSuggestion,
} from "@/lib/runs/failure-analysis";
import { formatDateTimeShort } from "@/lib/format-datetime";

/**
 * Categories split into two groups by what the user has to do about them: ones
 * they can fix from settings, and ones that are the provider's problem and may
 * clear on their own. That is the only distinction worth a colour here — the
 * per-category palette this replaced gave ten equally-loud accents and made a
 * transient timeout look as alarming as a revoked key.
 */
const ACTIONABLE: ReadonlySet<ErrorCategory> = new Set([
  "auth_expired",
  "connection_not_found",
  "api_key_invalid",
  "permission_denied",
  "schema_validation",
]);

function CategoryTag({ category }: { category: ErrorCategory }) {
  const actionable = ACTIONABLE.has(category);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-xs ${
        actionable
          ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-border bg-muted/50 text-muted-foreground"
      }`}
    >
      {CATEGORY_LABEL[category] ?? CATEGORY_LABEL.unknown}
    </span>
  );
}

function FixRow({ fix }: { fix: FixSuggestion }) {
  return (
    <div className="border-t border-border py-2.5 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium">{fix.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
        {fix.description}
      </p>
      {fix.action_url && (
        <Link
          href={fix.action_url}
          className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
        >
          {fix.action_label ?? "Open settings"}
        </Link>
      )}
    </div>
  );
}

export function FailureAnalysisPanel({
  runId,
  runStatus,
}: {
  runId: string;
  runStatus: string;
}) {
  const [analysis, setAnalysis] = useState<FailureAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const autoFetchedRunRef = useRef<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    if (runStatus !== "failed") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/analyze`, { method: "POST" });
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

  // Auto-fetch once per run, and only once: gating on `!analysis` alone meant a
  // failed response left every condition true, so the effect re-fired itself
  // without backoff or cap against a route that has no rate limit. Retrying is
  // the "Try again" button's job — it calls fetchAnalysis directly, so this flag
  // never blocks it.
  useEffect(() => {
    if (runStatus !== "failed") return;
    if (autoFetchedRunRef.current === runId) return;
    autoFetchedRunRef.current = runId;
    fetchAnalysis();
  }, [runId, runStatus, fetchAnalysis]);

  if (runStatus !== "failed") return null;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">What went wrong</p>
          {analysis && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {analysis.nodes.length} failed{" "}
              {analysis.nodes.length === 1 ? "node" : "nodes"} ·{" "}
              {CATEGORY_LABEL[analysis.overall_category]?.toLowerCase() ??
                "unclassified"}
            </p>
          )}
        </div>
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        >
          <path
            fillRule="evenodd"
            d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-4">
          {loading && (
            <p className="text-sm text-muted-foreground">Checking the run…</p>
          )}

          {error && (
            <div className="text-sm">
              <p className="text-destructive">{error}</p>
              <button
                onClick={fetchAnalysis}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {analysis && !loading && (
            <>
              {/* With one failed node the card below already names it and its
                  category, so the summary would only repeat itself. */}
              {analysis.nodes.length !== 1 && (
                <p className="text-sm">{analysis.root_cause_summary}</p>
              )}

              {analysis.nodes.length > 0 && (
                <div className="space-y-2">
                  {analysis.nodes.map((node) => (
                    <div
                      key={node.node_id}
                      className="rounded-md border border-border p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {node.node_label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {node.node_type}
                        </span>
                        <CategoryTag category={node.error_category} />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {node.root_cause}
                      </p>
                      <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-xs text-destructive">
                        {node.error_message}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {analysis.fix_suggestions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    What to try
                  </p>
                  <div className="rounded-md border border-border px-3 py-2.5">
                    {analysis.fix_suggestions.map((fix, i) => (
                      <FixRow key={i} fix={fix} />
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Checked {formatDateTimeShort(analysis.analyzed_at)}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
