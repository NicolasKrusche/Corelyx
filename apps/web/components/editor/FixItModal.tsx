"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FixSuggestion, JsonPatchOp, ValidationErrorInput } from "@/lib/genesis/fixit";

// ─── Props ───────────────────────────────────────────────────────────────────

interface FixItModalProps {
  /** Validation errors from preflight. */
  errors: ValidationErrorInput[];
  /** AI-generated fix suggestions (may be loading). */
  suggestions: FixSuggestion[];
  /** Whether suggestions are still being generated. */
  loading: boolean;
  /** Called with all patches when the user clicks "Apply All". */
  onApply: (patches: JsonPatchOp[]) => void;
  /** Close the modal. */
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function confidenceColor(score: number): string {
  if (score >= 0.8) return "text-emerald-600";
  if (score >= 0.5) return "text-amber-600";
  return "text-red-500";
}

function confidenceLabel(score: number): string {
  if (score >= 0.8) return "High";
  if (score >= 0.5) return "Medium";
  return "Low";
}

/** Format a JSON Patch op for display. */
function formatPatchOp(op: JsonPatchOp): string {
  const { op: operation, path, value, from } = op;
  if (operation === "remove") return `${operation} ${path}`;
  if (operation === "move") return `${operation} ${path} ← ${from ?? "?"}`;
  return `${operation} ${path} = ${JSON.stringify(value)}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PatchDiff({ patches }: { patches: JsonPatchOp[] }) {
  return (
    <div className="rounded-md bg-muted/50 p-3 font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
      {patches.map((op, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-2",
            op.op === "remove" && "text-red-500",
            op.op === "add" && "text-emerald-600",
            op.op === "replace" && "text-amber-600"
          )}
        >
          <span className="shrink-0 text-muted-foreground">{i + 1}.</span>
          <span className="break-all">{formatPatchOp(op)}</span>
        </div>
      ))}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onApply,
}: {
  suggestion: FixSuggestion;
  onApply: (patches: JsonPatchOp[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug">{suggestion.description}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            suggestion.confidence >= 0.8 && "bg-emerald-500/10 text-emerald-600",
            suggestion.confidence >= 0.5 &&
              suggestion.confidence < 0.8 &&
              "bg-amber-500/10 text-amber-600",
            suggestion.confidence < 0.5 && "bg-red-500/10 text-red-500"
          )}
        >
          {confidenceLabel(suggestion.confidence)} ({Math.round(suggestion.confidence * 100)}%)
        </span>
      </div>

      {/* Addresses */}
      {suggestion.addresses_errors.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Fixes: {suggestion.addresses_errors.join(", ")}
        </p>
      )}

      {/* Expandable patch diff */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {expanded ? "Hide" : "Show"} JSON Patch ({suggestion.patch.length} operation{suggestion.patch.length !== 1 ? "s" : ""})
      </button>

      {expanded && <PatchDiff patches={suggestion.patch} />}

      {/* Apply button */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onApply(suggestion.patch)}
        >
          Apply Fix
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function FixItModal({
  errors,
  suggestions,
  loading,
  onApply,
  onClose,
}: FixItModalProps) {
  const [applied, setApplied] = useState(false);

  const handleApplyAll = () => {
    const allPatches = suggestions.flatMap((s) => s.patch);
    if (allPatches.length > 0) {
      onApply(allPatches);
      setApplied(true);
    }
  };

  const handleApplyIndividual = (patches: JsonPatchOp[]) => {
    onApply(patches);
    setApplied(true);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pre-Flight Fix-It Assistant</DialogTitle>
        </DialogHeader>

        {/* Error count */}
        <div className="text-sm text-muted-foreground">
          {errors.length} validation error{errors.length !== 1 ? "s" : ""} detected
        </div>

        {/* Errors list */}
        <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
          {errors.map((err, i) => (
            <div
              key={err.node_id ?? err.edge_id ?? i}
              className="rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-mono text-destructive">
                  {err.code}
                </span>
                <span className="text-sm">{err.message}</span>
              </div>
              {err.fix_suggestion && (
                <p className="mt-1 ml-8 text-xs text-muted-foreground italic">
                  Hint: {err.fix_suggestion}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Suggestions section */}
        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-medium">AI-Generated Fixes</h3>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Generating fix suggestions...
            </div>
          )}

          {!loading && suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No fix suggestions available. Try resolving errors manually.
            </p>
          )}

          {!loading &&
            suggestions.map((suggestion, i) => (
              <SuggestionCard
                key={i}
                suggestion={suggestion}
                onApply={handleApplyIndividual}
              />
            ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {applied ? "Done" : "Cancel"}
          </Button>
          {!applied && suggestions.length > 0 && (
            <Button onClick={handleApplyAll} disabled={loading}>
              Apply All ({suggestions.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
