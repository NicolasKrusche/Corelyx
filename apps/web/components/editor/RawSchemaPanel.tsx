"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProgramSchema } from "@flowos/schema";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
import { PanelResizeHandle } from "@/components/editor/PanelResizeHandle";

interface RawSchemaPanelProps {
  schema: ProgramSchema;
  onApply: (schema: ProgramSchema) => void;
  onClose: () => void;
}

export function RawSchemaPanel({ schema, onApply, onClose }: RawSchemaPanelProps) {
  const [text, setText] = useState(() => JSON.stringify(schema, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const userEditingRef = useRef(false);

  // Sync from external schema changes only when the user isn't actively editing
  useEffect(() => {
    if (!userEditingRef.current) {
      setText(JSON.stringify(schema, null, 2));
    }
  }, [schema]);

  function handleApply() {
    setError(null);
    try {
      const parsed = JSON.parse(text) as ProgramSchema;
      userEditingRef.current = false;
      onApply(parsed);
    } catch (err) {
      setError(friendlyErrorMessage((err as Error).message, "This JSON could not be applied. Check the formatting and try again."));
    }
  }

  function handleFormat() {
    try {
      const parsed = JSON.parse(text);
      setText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (err) {
      setError(friendlyErrorMessage((err as Error).message, "This does not look like valid JSON. Check the formatting and try again."));
    }
  }

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <aside
      className={cn(
        "fixed left-0 bottom-0 z-20 w-[420px]",
        "bg-background border-r border-border shadow-lg",
        "flex flex-col overflow-hidden",
      )}
      style={{ top: 56 }}
    >
      <PanelResizeHandle edge="right" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            className="h-3.5 w-3.5 text-muted-foreground"
          >
            <path
              d="M5 3L2 8l3 5M11 3l3 5-3 5M9.5 2.5l-3 11"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-xs font-semibold">Raw Schema</span>
          <span className="text-[10px] text-muted-foreground">read / write JSON</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleFormat}
            className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border hover:bg-accent transition-colors"
          >
            Format
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border hover:bg-accent transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close raw schema panel"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* JSON editor */}
      <textarea
        value={text}
        onChange={(e) => {
          userEditingRef.current = true;
          setText(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            handleApply();
          }
        }}
        className="flex-1 resize-none font-mono text-xs bg-background text-foreground p-3 outline-none overflow-auto leading-relaxed"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        aria-label="Raw schema JSON"
      />

      {/* Footer */}
      <div className="border-t border-border px-3 py-2.5 shrink-0 space-y-1.5">
        {error && (
          <p className="text-[10px] text-red-600 leading-snug">{error}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            <kbd className="font-mono">⌘↵</kbd> to apply — canvas reflects changes immediately
          </p>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
          >
            Apply
          </button>
        </div>
      </div>
    </aside>
  );
}
