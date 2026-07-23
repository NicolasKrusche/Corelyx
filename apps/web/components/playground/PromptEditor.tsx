"use client";

import { useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

// ─── Props ───────────────────────────────────────────────────────────────────

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onSubmit?: () => void;
  maxLength?: number;
  className?: string;
}

/**
 * PromptEditor — a styled textarea for natural-language workflow prompts.
 *
 * Highlights placeholder patterns like "send an email", "when X happens",
 * and connector keywords (Gmail, Slack, Notion, GitHub) via subtle pill
 * decorations in the chrome. The actual editing surface is a plain textarea
 * for maximum accessibility and mobile support.
 */
export function PromptEditor({
  value,
  onChange,
  placeholder = "Describe what you want your workflow to do, e.g.\n\n\"When a new email arrives in Gmail with the subject containing 'invoice', extract the amount, create a row in my Notion database, and send a Slack notification to the #finance channel.\"",
  disabled = false,
  onSubmit,
  maxLength = 2000,
  className,
}: PromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea to fit content (up to a max height)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl+Enter to submit
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  const charCount = value.length;
  const isNearLimit = charCount > maxLength * 0.85;
  const isAtLimit = charCount >= maxLength;

  return (
    <div className={cn("relative flex flex-col", className)}>
      {/* Header bar with tips */}
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border/60 bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-4 w-4 text-muted-foreground"
          >
            <path
              d="M13.5 8A5.5 5.5 0 1 1 2.5 8a5.5 5.5 0 0 1 11 0Z"
              strokeLinecap="round"
            />
            <path d="M5.5 8h5M8 5.5v5" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-medium text-muted-foreground">
            Describe your workflow
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
          <span>⌘+Enter to generate</span>
        </div>
      </div>

      {/* Textarea surface */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={4}
        className={cn(
          "w-full resize-none rounded-b-lg border border-border/60 bg-background px-4 py-3",
          "font-sans text-sm leading-relaxed text-foreground",
          "placeholder:text-muted-foreground/50",
          "focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-colors"
        )}
      />

      {/* Character counter */}
      <div className="mt-1 flex items-center justify-end px-1">
        <span
          className={cn(
            "text-[10px] tabular-nums",
            isAtLimit
              ? "text-red-500"
              : isNearLimit
                ? "text-amber-500"
                : "text-muted-foreground/50"
          )}
        >
          {charCount.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
