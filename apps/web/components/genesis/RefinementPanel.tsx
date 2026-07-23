"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AiIdentityBadge } from "@/components/ai-transparency";
import {
  type RefinementSession,
  MAX_REFINEMENT_ITERATIONS,
  QUICK_ACTIONS,
  getQuickActionFeedback,
  buildRefinementRequestBody,
  processRefinementResult,
  remainingIterations,
  summarizeAllChanges,
  persistRefinementHistory,
} from "@/lib/genesis/refinement";
import type { ProgramSchema } from "@flowos/schema";

// ─── Props ───────────────────────────────────────────────────────────────────

interface RefinementPanelProps {
  /** Current refinement session (null until first refinement). */
  session: RefinementSession | null;
  /** Callback to update the session after a refinement round. */
  onUpdateSession: (session: RefinementSession) => void;
  /** Callback when user decides to apply the current schema and exit. */
  onApply: (schema: ProgramSchema) => void;
  /** Callback to dismiss the panel entirely. */
  onDismiss: () => void;
  /** Whether a refinement request is currently in flight. */
  busy: boolean;
  /** Set busy state. */
  setBusy: (busy: boolean) => void;
  /** Error message from the last refinement attempt. */
  error: string | null;
  /** Set error state. */
  setError: (error: string | null) => void;
  /** The latest result schema from the refinement API. */
  latestResultSchema: ProgramSchema | null;
  /** Set the latest result schema. */
  setLatestResultSchema: (schema: ProgramSchema | null) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RefinementPanel({
  session,
  onUpdateSession,
  onApply,
  onDismiss,
  busy,
  setBusy,
  error,
  setError,
  latestResultSchema,
  setLatestResultSchema,
}: RefinementPanelProps) {
  const [feedback, setFeedback] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const currentIteration = session?.iterations.length ?? 0;
  const remaining = session ? remainingIterations(session) : MAX_REFINEMENT_ITERATIONS;
  const hasResult = latestResultSchema !== null;
  const pendingDiff = useMemo(() => {
    if (!session || !latestResultSchema) return null;
    // Compute a lightweight diff summary for the preview
    return computeQuickDiff(session.currentSchema, latestResultSchema);
  }, [session, latestResultSchema]);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setError(null);
      setBusy(true);

      try {
        if (!session) {
          // Should not happen — panel is only shown after generation
          setError("No refinement session. Please generate a workflow first.");
          return;
        }

        const body = buildRefinementRequestBody(session, text.trim());
        const res = await fetch("/api/genesis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          const msg =
            (errBody as { message?: string })?.message ??
            "Refinement failed. Please try again.";
          setError(msg);
          return;
        }

        const data = (await res.json()) as { schema?: ProgramSchema };
        if (!data.schema) {
          setError("No schema returned. Please try again.");
          return;
        }

        const { session: updatedSession, result } = processRefinementResult(
          session,
          text.trim(),
          data.schema
        );

        onUpdateSession(updatedSession);
        setLatestResultSchema(data.schema);
        setShowDiff(true);
        setFeedback("");

        // Persist transparency record after each round
        persistRefinementHistory(updatedSession);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not connect. Check your internet and try again."
        );
      } finally {
        setBusy(false);
      }
    },
    [session, busy, setError, setBusy, onUpdateSession, setLatestResultSchema]
  );

  const handleQuickAction = useCallback(
    (actionId: string) => {
      const feedbackText = getQuickActionFeedback(actionId);
      if (feedbackText) {
        setFeedback(feedbackText);
        // Auto-submit after a brief delay so the user sees the text
        setTimeout(() => handleSubmit(feedbackText), 50);
      }
    },
    [handleSubmit]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(feedback);
      }
    },
    [feedback, handleSubmit]
  );

  const historySummaries = useMemo(
    () => (session ? summarizeAllChanges(session) : []),
    [session]
  );

  if (!session && !hasResult) return null;

  return (
    <div className="pointer-events-auto w-96 max-w-[calc(100vw-2rem)] rounded-xl border glass-card bg-background/95 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AiIdentityBadge label="Genesis AI" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {currentIteration === 0
              ? "Workflow generiert"
              : `Refinement ${currentIteration}/${MAX_REFINEMENT_ITERATIONS}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {session && session.iterations.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              title="Verlauf anzeigen"
            >
              {showHistory ? "▲" : "▼"} Verlauf
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close refinement panel"
            className="rounded-md px-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            ×
          </button>
        </div>
      </div>

      {/* History (collapsible) */}
      {showHistory && historySummaries.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-b border-border/60 px-4 py-2">
          {historySummaries.map((summary, i) => (
            <div
              key={i}
              className="flex gap-2 py-1 text-xs text-muted-foreground"
            >
              <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>{summary}</span>
            </div>
          ))}
        </div>
      )}

      {/* Diff preview (when available) */}
      {showDiff && pendingDiff && (
        <DiffPreview
          diff={pendingDiff}
          onAccept={() => {
            if (latestResultSchema) {
              onApply(latestResultSchema);
            }
          }}
          onEdit={() => setShowDiff(false)}
        />
      )}

      {/* Iteration progress */}
      {remaining > 0 && !showDiff && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: MAX_REFINEMENT_ITERATIONS }, (_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 rounded-full ${
                    i < currentIteration
                      ? "bg-primary"
                      : i === currentIteration
                        ? "bg-primary/50"
                        : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {remaining} {remaining === 1 ? "Runde" : "Runden"} übrig
            </span>
          </div>
        </div>
      )}

      {/* Quick actions */}
      {!showDiff && remaining > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2 pb-1">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleQuickAction(action.id)}
              disabled={busy}
              className="rounded-md border border-border/60 bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Chat input */}
      {!showDiff && remaining > 0 && (
        <form
          className="px-4 pb-3 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(feedback);
          }}
        >
          <div className="flex gap-2">
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Was möchtest du ändern?"
              disabled={busy}
              rows={2}
              className="flex-1 resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/25 disabled:opacity-50"
            />
            <Button
              type="submit"
              size="sm"
              disabled={busy || !feedback.trim()}
              className="shrink-0 self-end"
            >
              {busy ? "..." : "Refine"}
            </Button>
          </div>
        </form>
      )}

      {/* Error display */}
      {error && (
        <div className="border-t border-border/60 px-4 py-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Apply / limit reached footer */}
      {(!showDiff || remaining === 0) && (
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            {remaining === 0 && currentIteration > 0
              ? "Maximale Iterationen erreicht"
              : "Drücke Enter zum Senden"}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onDismiss}
            >
              Abbrechen
            </Button>
            {latestResultSchema && (
              <Button
                size="sm"
                onClick={() => onApply(latestResultSchema)}
              >
                Anwenden
              </Button>
            )}
          </div>
        </div>
      )}

      {/* AI Act Art. 50 notice */}
      <p className="border-t border-border/60 px-4 py-2 text-[10px] text-muted-foreground/70">
        KI-generiert. Refinement-Verlauf wird für Transparenz gespeichert (EU AI Act Art. 50).
      </p>
    </div>
  );
}

// ─── Diff preview sub-component ──────────────────────────────────────────────

function DiffPreview({
  diff,
  onAccept,
  onEdit,
}: {
  diff: QuickDiffSummary;
  onAccept: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="border-b border-border/60 px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        Änderungsvorschau
      </p>
      <div className="max-h-32 space-y-1 overflow-y-auto">
        {diff.items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                item.kind === "add"
                  ? "bg-emerald-500/15 text-emerald-600"
                  : item.kind === "remove"
                    ? "bg-red-500/15 text-red-600"
                    : "bg-amber-500/15 text-amber-600"
              }`}
            >
              {item.kind === "add" ? "+" : item.kind === "remove" ? "−" : "~"}
            </span>
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
        {diff.items.length === 0 && (
          <p className="text-xs text-muted-foreground/70">
            {diff.summary ?? "Keine strukturellen Änderungen"}
          </p>
        )}
      </div>
      {diff.summary && diff.items.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground/80">
          {diff.summary}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={onAccept}>
          Änderungen anwenden
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit}>
          Weiter anpassen
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface QuickDiffItem {
  kind: "add" | "remove" | "update";
  label: string;
}

interface QuickDiffSummary {
  items: QuickDiffItem[];
  summary: string | null;
}

/**
 * Compute a lightweight diff summary for the preview panel. Uses the
 * existing diffSchemas logic but formats it for the UI.
 */
function computeQuickDiff(
  before: ProgramSchema,
  after: ProgramSchema
): QuickDiffSummary {
  const beforeNodeIds = new Set(before.nodes.map((n) => n.id));
  const afterNodeIds = new Set(after.nodes.map((n) => n.id));
  const beforeEdgeIds = new Set(before.edges.map((e) => e.id));
  const afterEdgeIds = new Set(after.edges.map((e) => e.id));

  const items: QuickDiffItem[] = [];

  // Nodes
  for (const node of after.nodes) {
    const beforeNode = before.nodes.find((n) => n.id === node.id);
    if (!beforeNode) {
      items.push({
        kind: "add",
        label: `Node hinzugefügt: ${node.label ?? node.id}`,
      });
    } else if (JSON.stringify(beforeNode) !== JSON.stringify(node)) {
      items.push({
        kind: "update",
        label: `Node aktualisiert: ${node.label ?? node.id}`,
      });
    }
  }
  for (const node of before.nodes) {
    if (!afterNodeIds.has(node.id)) {
      items.push({
        kind: "remove",
        label: `Node entfernt: ${node.label ?? node.id}`,
      });
    }
  }

  // Edges
  for (const edge of after.edges) {
    if (!beforeEdgeIds.has(edge.id)) {
      items.push({
        kind: "add",
        label: `Verbindung hinzugefügt: ${edge.from} → ${edge.to}`,
      });
    }
  }
  for (const edge of before.edges) {
    if (!afterEdgeIds.has(edge.id)) {
      items.push({
        kind: "remove",
        label: `Verbindung entfernt: ${edge.from} → ${edge.to}`,
      });
    }
  }

  // Build summary
  const added = items.filter((i) => i.kind === "add").length;
  const updated = items.filter((i) => i.kind === "update").length;
  const removed = items.filter((i) => i.kind === "remove").length;
  const parts: string[] = [];
  if (added) parts.push(`${added} hinzugefügt`);
  if (updated) parts.push(`${updated} aktualisiert`);
  if (removed) parts.push(`${removed} entfernt`);
  const summary = parts.length > 0 ? parts.join(", ") : null;

  return { items, summary };
}
