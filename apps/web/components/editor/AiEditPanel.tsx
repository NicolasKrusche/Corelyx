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

        <Textarea
          rows={6}
          className="text-sm resize-none"
          placeholder={`e.g. "Add a Slack notification after the Gmail node" or "Replace the cron trigger with a webhook"`}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !loading && prompt.trim() && canSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />

        {error && (
          <p className="text-[11px] text-destructive">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-1.5">
        <Button
          onClick={onSubmit}
          disabled={loading || !prompt.trim() || !canSubmit}
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
