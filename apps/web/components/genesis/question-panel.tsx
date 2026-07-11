"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { GenesisClarification } from "@/components/genesis/genesis-job-provider";
import { AiIdentityBadge } from "@/components/ai-transparency";

/**
 * Genesis V2 clarifying-questions panel. Presentational: the caller owns the
 * answer submission (building page and editor wire different state). Each
 * question is anchored to a node on the canvas via its pin; this panel is
 * where the user types the answer.
 */
export function GenesisQuestionPanel({
  clarifications,
  nodeLabels,
  busyNodeId,
  onAnswer,
  onDismiss,
  error,
}: {
  clarifications: GenesisClarification[];
  nodeLabels: Map<string, string>;
  busyNodeId: string | null;
  onAnswer: (nodeId: string, answer: string) => void;
  onDismiss?: () => void;
  error?: string | null;
}) {
  if (clarifications.length === 0) return null;

  return (
    <div className="pointer-events-auto w-96 max-w-[calc(100vw-2rem)] rounded-xl border glass-card bg-background/95 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AiIdentityBadge label="Genesis AI" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {clarifications.length === 1
              ? "1 question about this workflow"
              : `${clarifications.length} questions about this workflow`}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss questions"
            className="rounded-md px-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto p-3">
        {clarifications.map((clarification) => (
          <QuestionCard
            key={clarification.node_id}
            clarification={clarification}
            nodeLabel={nodeLabels.get(clarification.node_id) ?? clarification.node_id}
            busy={busyNodeId === clarification.node_id}
            disabled={busyNodeId !== null}
            onAnswer={onAnswer}
          />
        ))}
      </div>
      {error && <p className="px-4 pb-3 text-xs text-destructive">{error}</p>}
      <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        The workflow already works with sensible defaults — answering just tunes it. Questions expire after 48&nbsp;hours.
      </p>
    </div>
  );
}

function QuestionCard({
  clarification,
  nodeLabel,
  busy,
  disabled,
  onAnswer,
}: {
  clarification: GenesisClarification;
  nodeLabel: string;
  busy: boolean;
  disabled: boolean;
  onAnswer: (nodeId: string, answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");

  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950">
          ?
        </span>
        <p className="truncate text-xs font-semibold">{nodeLabel}</p>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{clarification.question}</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = answer.trim();
          if (trimmed && !disabled) onAnswer(clarification.node_id, trimmed);
        }}
      >
        <input
          type="text"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Your answer…"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-amber-400/60 disabled:opacity-50"
        />
        <Button type="submit" size="sm" disabled={disabled || answer.trim().length === 0}>
          {busy ? "Applying…" : "Apply"}
        </Button>
      </form>
    </div>
  );
}
