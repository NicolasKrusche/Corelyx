"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PanelResizeHandle } from "@/components/editor/PanelResizeHandle";

export type AiEditMode = "personal" | "platform";

interface AiEditPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  hasApiKeys: boolean;
  mode: AiEditMode;
  onModeChange: (mode: AiEditMode) => void;
  /** Display cost in credits for the platform key path. */
  platformRateCredits: number;
  /** Genesis V2 (dev-gated): show the patch-edit toggle. */
  v2Available?: boolean;
  useV2?: boolean;
  onV2Change?: (value: boolean) => void;
}

export function AiEditPanel({
  prompt,
  onPromptChange,
  onSubmit,
  onClose,
  loading,
  error,
  hasApiKeys,
  mode,
  onModeChange,
  platformRateCredits,
  v2Available = false,
  useV2 = false,
  onV2Change,
}: AiEditPanelProps) {
  const canSubmitPersonal = hasApiKeys && mode === "personal";
  const canSubmitPlatform = mode === "platform";
  const canSubmit = canSubmitPersonal || canSubmitPlatform;

  return (
    <aside
      className={cn(
        "fixed left-0 bottom-0 z-20 w-72",
        "bg-background border-r border-border shadow-lg",
        "flex flex-col overflow-hidden",
      )}
      style={{ top: 56 }}
    >
      <PanelResizeHandle edge="right" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 text-primary">
            <path d="M8 2l1.5 3L13 6.5 9.5 8 8 11.5 6.5 8 3 6.5 6.5 5z" strokeLinejoin="round" />
            <path d="M12 10l.75 1.5L14 12l-1.25.5L12 14l-.75-1.5L10 12l1.25-.5z" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold">Edit with AI</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close AI edit panel"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto">
        {loading ? (
          /* Loading state — replaces body content while AI is working */
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-8 text-center">
            <div className="relative">
              <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">Editing your workflow…</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[180px]">
                AI is reworking the graph. This may take a moment.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Mode selector */}
            <div className="flex rounded-lg border border-border overflow-hidden text-[11px] font-medium">
              <button
                type="button"
                disabled={!hasApiKeys}
                onClick={() => onModeChange("personal")}
                className={cn(
                  "flex-1 py-1.5 transition-colors",
                  mode === "personal"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground",
                  !hasApiKeys && "opacity-40 cursor-not-allowed"
                )}
              >
                My API key
              </button>
              <button
                type="button"
                onClick={() => onModeChange("platform")}
                className={cn(
                  "flex-1 py-1.5 border-l border-border transition-colors",
                  mode === "platform"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                Corelyx AI
              </button>
            </div>

            {mode === "personal" && !hasApiKeys && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                No API key found.{" "}
                <Link href="/api-keys" className="underline font-medium">
                  Add one
                </Link>{" "}
                or switch to Corelyx AI below.
              </p>
            )}

            {mode === "platform" && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Genesis AI usage is applied first. If none is available,{" "}
                <span className="font-medium text-foreground">{platformRateCredits.toLocaleString("en-US")} credits</span>{" "}
                will be deducted from your balance.
              </p>
            )}

            {mode === "personal" && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Runs against your own API key. This counts toward your Genesis AI usage.
              </p>
            )}

            {v2Available && (
              <button
                type="button"
                onClick={() => onV2Change?.(!useV2)}
                aria-pressed={useV2}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors",
                  useV2
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors",
                    useV2 ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                >
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full bg-white transition-transform",
                      useV2 ? "translate-x-3" : "translate-x-0"
                    )}
                  />
                </span>
                <span className="text-left leading-tight">
                  Genesis V2 <span className="opacity-60">· dev · patch edit with animated diff</span>
                </span>
              </button>
            )}

            <Textarea
              rows={6}
              className="text-sm resize-none"
              placeholder={`e.g. "Add a Slack notification after the Gmail node" or "Replace the cron trigger with a webhook"`}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              disabled={loading}
              maxLength={2000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !loading && prompt.trim() && canSubmit && prompt.length <= 2000) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />
            <p className={cn(
              "text-[10px] text-right tabular-nums",
              prompt.length > 1800 ? "text-amber-500" : "text-muted-foreground"
            )}>
              {prompt.length} / 2000
            </p>

            {error && (
              <p className="text-[11px] text-destructive">{error}</p>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-1.5">
        <Button
          onClick={onSubmit}
          disabled={loading || !prompt.trim() || !canSubmit || prompt.length > 2000}
          className={cn(
            "w-full gap-1.5",
            mode === "platform"
              ? "bg-primary hover:bg-primary/90 text-primary-foreground"
              : "bg-primary hover:bg-primary/90 text-primary-foreground"
          )}
          size="sm"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Editing…
            </>
          ) : mode === "platform" ? (
            "Apply edit"
          ) : (
            "Apply edit"
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">⌘↵ to apply</p>
      </div>
    </aside>
  );
}
