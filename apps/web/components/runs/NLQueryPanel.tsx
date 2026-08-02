"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type QueryResult = Record<string, unknown> & {
  program_name?: string | null;
};

type QueryResponse = {
  query: string;
  generated_sql: string;
  columns: string[];
  results: QueryResult[];
  count: number;
  hint?: string;
};

type HistoryEntry = {
  query: string;
  sql: string;
  count: number;
  timestamp: number;
};

type Props = {
  /** Optional program ID to scope queries to */
  programId?: string;
  /** Optional: called when results arrive, e.g. to scroll the parent into view */
  onResults?: (count: number) => void;
};

const HISTORY_STORAGE_KEY = "corelyx-nl-query-history";
const MAX_HISTORY = 10;

const EXAMPLE_QUERIES = [
  "Show me failed runs from the last 7 days",
  "Most expensive runs",
  "Show top 10 runs",
  "Completed runs from today",
  "Runs triggered by webhook",
  "How many runs failed this week?",
  "Average tokens per run",
  "Runs by status",
];

const RESULT_COLUMNS: Array<{ key: string; label: string; className?: string }> = [
  { key: "program_name", label: "Program", className: "max-w-[160px] truncate" },
  { key: "status", label: "Status" },
  { key: "triggered_by", label: "Triggered by" },
  { key: "trigger_source", label: "Source" },
  { key: "created_at", label: "Created", className: "tabular-nums text-xs" },
  { key: "billed_cost_usd", label: "Cost ($)", className: "tabular-nums" },
  { key: "total_tokens", label: "Tokens", className: "tabular-nums" },
  { key: "error_message", label: "Error", className: "max-w-[200px] truncate text-red-400 text-xs" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

function exportToCsv(columns: string[], rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;

  const escapeCsv = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = columns.map(escapeCsv).join(",");
  const dataRows = rows.map((row) =>
    columns.map((col) => escapeCsv(row[col])).join(",")
  );

  const csv = [headers, ...dataRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `query-results-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NLQueryPanel({ programId, onResults }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QueryResponse | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const executeQuery = useCallback(
    async (q: string) => {
      const query = q.trim();
      if (!query) return;

      setLoading(true);
      setError(null);
      setData(null);
      setShowSql(false);
      setCopiedSql(false);

      try {
        // Use program-scoped endpoint if programId is provided, otherwise fallback
        const url = programId
          ? `/api/programs/${programId}/runs/query`
          : "/api/runs/query";

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Query failed (${res.status})`);
        }

        const result: QueryResponse = await res.json();
        setData(result);

        // Update history
        const newEntry: HistoryEntry = {
          query: result.query,
          sql: result.generated_sql,
          count: result.count,
          timestamp: Date.now(),
        };
        const updatedHistory = [newEntry, ...history.filter((h) => h.query !== newEntry.query)].slice(0, MAX_HISTORY);
        setHistory(updatedHistory);
        saveHistory(updatedHistory);

        onResults?.(result.count);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [history, onResults, programId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeQuery(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeQuery(input);
    }
  };

  const handleCopySql = async () => {
    if (!data?.generated_sql) return;
    try {
      await navigator.clipboard.writeText(data.generated_sql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // Fallback: select text for manual copy
      const el = document.getElementById("nl-query-sql-preview");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  const handleExportCsv = () => {
    if (!data || data.results.length === 0) return;
    const columns = data.columns.length > 0
      ? data.columns
      : Object.keys(data.results[0]);
    exportToCsv(columns, data.results);
  };

  const formatValue = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if ((key === "created_at" || key === "started_at" || key === "completed_at") && typeof value === "string") {
      try {
        return new Date(value).toLocaleString();
      } catch {
        return String(value);
      }
    }
    if ((key === "billed_cost_usd" || key === "estimated_cost_usd") && typeof value === "number") {
      return value < 0.01 ? "<$0.01" : `$${value.toFixed(4)}`;
    }
    if (key === "total_tokens" && typeof value === "number") {
      return value.toLocaleString();
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    return String(value);
  };

  const resultColumns = data?.columns && data.columns.length > 0
    ? data.columns.map((key) => ({
        key,
        label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        className: key === "error_message" ? "max-w-[200px] truncate text-red-400 text-xs" : undefined,
      }))
    : RESULT_COLUMNS;

  return (
    <div ref={panelRef} className="rounded-xl border glass-card overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-primary shrink-0">
          <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
        </svg>
        <span className="text-sm font-semibold">Ask about your runs</span>
        <span className="text-[10px] text-muted-foreground/50 ml-auto">Natural language</span>
      </div>

      {/* ── Input ── */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g. "Show failed runs from the last 7 days"'
          disabled={loading}
          className="flex-1 bg-transparent border border-border/60 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all",
            loading || !input.trim()
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:opacity-90"
          )}
        >
          {loading ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="32" strokeDashoffset="8" />
              </svg>
              Searching…
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 1 1-1.06 1.06l-3.04-3.04ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
              </svg>
              Query
            </>
          )}
        </button>
      </form>

      {/* ── Example queries ── */}
      {!data && !loading && !error && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-muted-foreground/50 mb-1.5">Try asking:</p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setInput(ex);
                  executeQuery(ex);
                }}
                className="rounded-md border border-border/40 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mx-4 mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-xs font-medium text-red-400">{error}</p>
        </div>
      )}

      {/* ── Results ── */}
      {data && (
        <div className="border-t border-border/60">
          {/* Stats row */}
          <div className="flex items-center gap-3 px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{data.count} result{data.count !== 1 ? "s" : ""}</span>
            {data.hint && <span className="text-muted-foreground/60">{data.hint}</span>}
            <div className="ml-auto flex items-center gap-2">
              {/* Copy SQL button */}
              <button
                type="button"
                onClick={handleCopySql}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors",
                  copiedSql
                    ? "border-green-500/30 bg-green-500/10 text-green-600"
                    : "border-border/40 hover:bg-muted/60"
                )}
              >
                {copiedSql ? (
                  <>
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                    </svg>
                    Copy SQL
                  </>
                )}
              </button>
              {/* Export CSV button */}
              {data.results.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2 py-0.5 text-[10px] font-medium hover:bg-muted/60 transition-colors"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
                    <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z" />
                  </svg>
                  Export CSV
                </button>
              )}
              {/* Toggle SQL preview */}
              <button
                type="button"
                onClick={() => setShowSql(!showSql)}
                className="rounded-md border border-border/40 px-2 py-0.5 text-[10px] font-medium hover:bg-muted/60 transition-colors"
              >
                {showSql ? "Hide" : "Show"} SQL
              </button>
            </div>
          </div>

          {/* SQL preview */}
          {showSql && (
            <div
              id="nl-query-sql-preview"
              className="mx-4 mb-2 rounded-lg bg-muted/40 px-4 py-2.5 text-[11px] font-mono text-muted-foreground/70 overflow-x-auto select-all cursor-text"
            >
              {data.generated_sql}
            </div>
          )}

          {/* Results table */}
          {data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60">
                    {resultColumns.map((col) => (
                      <th key={col.key} className="px-4 py-2 text-left font-semibold text-muted-foreground/60 whitespace-nowrap">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.results.map((row, i) => (
                    <tr key={(row.id as string) ?? i} className="hover:bg-muted/30 transition-colors">
                      {resultColumns.map((col) => (
                        <td key={col.key} className={cn("px-4 py-2 whitespace-nowrap", col.className)}>
                          <span className={cn(
                            col.key === "status" && "font-medium",
                            col.key === "status" && row[col.key] === "failed" && "text-red-400",
                            col.key === "status" && row[col.key] === "completed" && "text-green-400",
                            col.key === "status" && row[col.key] === "running" && "text-blue-400",
                          )}>
                            {formatValue(col.key, row[col.key])}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">
              No runs match your query.
            </div>
          )}
        </div>
      )}

      {/* ── Query history (last 10) ── */}
      {history.length > 0 && (
        <div className="border-t border-border/60 px-4 py-2.5">
          <p className="text-[10px] text-muted-foreground/40 mb-1">Recent queries</p>
          <div className="flex flex-wrap gap-1">
            {history.slice(0, 10).map((h, i) => (
              <button
                key={`${h.timestamp}-${i}`}
                type="button"
                onClick={() => {
                  setInput(h.query);
                  executeQuery(h.query);
                }}
                className="rounded-md border border-border/30 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground/60 hover:bg-muted/40 transition-colors"
                title={h.sql}
              >
                {h.query.length > 40 ? h.query.slice(0, 40) + "…" : h.query}
                <span className="ml-1 text-muted-foreground/30">({h.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
