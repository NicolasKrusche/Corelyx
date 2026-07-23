"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProgramSchema } from "@flowos/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TestCase {
  id: string;
  name: string;
  prompt: string;
  expected_schema: ProgramSchema | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface TestCaseListProps {
  /** Callback when a test case is loaded (prompt + optional schema). */
  onLoad: (prompt: string, schema: ProgramSchema | null) => void;
  /** Callback when a test case is deleted. */
  onDelete?: (id: string) => void;
  className?: string;
}

/**
 * TestCaseList — saved test cases with load/run/delete actions.
 *
 * Fetches from GET /api/playground/test-cases and displays them in a
 * scrollable list. Each row shows the name, prompt preview, tags, and
 * action buttons.
 */
export function TestCaseList({ onLoad, onDelete, className }: TestCaseListProps) {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch test cases on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchTestCases() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/playground/test-cases");
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? "Failed to load test cases");
        }
        const json = (await res.json()) as { test_cases: TestCase[] };
        if (!cancelled) setTestCases(json.test_cases);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load test cases");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void fetchTestCases();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch("/api/playground/test-cases", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? "Failed to delete");
        }
        setTestCases((prev) => prev.filter((tc) => tc.id !== id));
        onDelete?.(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete test case");
      } finally {
        setDeletingId(null);
      }
    },
    [onDelete]
  );

  const handleLoad = useCallback(
    (tc: TestCase) => {
      onLoad(tc.prompt, tc.expected_schema);
    },
    [onLoad]
  );

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Saved Test Cases
        </h3>
        <span className="text-[10px] text-muted-foreground/50">
          {testCases.length}
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          Loading…
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {!isLoading && !error && testCases.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 py-8">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="mb-2 h-8 w-8 text-muted-foreground/30"
          >
            <path
              d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-xs text-muted-foreground/50">No saved test cases yet</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/30">
            Generate a workflow and save it as a test case
          </p>
        </div>
      )}

      {!isLoading && !error && testCases.length > 0 && (
        <div className="space-y-1.5">
          {testCases.map((tc) => (
            <div
              key={tc.id}
              className="group flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground/80 truncate">
                  {tc.name}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/60 truncate">
                  {tc.prompt}
                </p>
                {tc.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground/70"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-0.5 text-[9px] text-muted-foreground/30">
                  {relativeTime(tc.created_at)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => handleLoad(tc)}
                  className="rounded px-1.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                  title="Load this test case"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(tc.id)}
                  disabled={deletingId === tc.id}
                  className="rounded px-1.5 py-1 text-[10px] text-red-500/70 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  title="Delete this test case"
                >
                  {deletingId === tc.id ? "…" : "×"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
