"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface AiEditPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  hasApiKeys: boolean;
}

export function AiEditPanel({
  prompt,
  onPromptChange,
  onSubmit,
  onClose,
  loading,
  error,
  hasApiKeys,
}: AiEditPanelProps) {
  return (
    <aside
      className={cn(
        "fixed left-0 bottom-0 z-20 w-72",
        "bg-background border-r border-border shadow-lg",
        "flex flex-col overflow-hidden",
      )}
      style={{ top: 56 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 text-purple-500">
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
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Describe the change you want. Genesis will update the program while preserving what stays the same. This counts toward your Genesis AI usage.
        </p>
        <Textarea
          rows={6}
          className="text-sm resize-none"
          placeholder={`e.g. "Add a Slack notification after the Gmail node" or "Replace the cron trigger with a webhook"`}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !loading && prompt.trim()) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        {!hasApiKeys && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            No API key found. Add one in{" "}
            <a href="/api-keys" className="underline font-medium">
              API Keys
            </a>{" "}
            before using Edit with AI.
          </p>
        )}
        {error && (
          <p className="text-[11px] text-destructive">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-1.5">
        <Button
          onClick={onSubmit}
          disabled={loading || !prompt.trim() || !hasApiKeys}
          className="w-full gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
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
          ) : (
            "Apply edit"
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">⌘↵ to apply</p>
      </div>
    </aside>
  );
}
