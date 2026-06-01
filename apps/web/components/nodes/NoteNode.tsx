"use client";

import React, { useState, useCallback, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { NoteConfig } from "@flowos/schema";
import { useOptionalEditorDispatch } from "@/lib/editor/state";

// ─── Color palette ────────────────────────────────────────────────────────────

const COLOR_STYLES: Record<NoteConfig["color"], { bg: string; border: string; text: string; placeholder: string }> = {
  yellow: {
    bg: "bg-yellow-50 dark:bg-yellow-950/60",
    border: "border-yellow-300 dark:border-yellow-700",
    text: "text-yellow-900 dark:text-yellow-100",
    placeholder: "placeholder-yellow-400/60 dark:placeholder-yellow-600/60",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/60",
    border: "border-blue-300 dark:border-blue-700",
    text: "text-blue-900 dark:text-blue-100",
    placeholder: "placeholder-blue-400/60 dark:placeholder-blue-600/60",
  },
  pink: {
    bg: "bg-pink-50 dark:bg-pink-950/60",
    border: "border-pink-300 dark:border-pink-700",
    text: "text-pink-900 dark:text-pink-100",
    placeholder: "placeholder-pink-400/60 dark:placeholder-pink-600/60",
  },
  green: {
    bg: "bg-green-50 dark:bg-green-950/60",
    border: "border-green-300 dark:border-green-700",
    text: "text-green-900 dark:text-green-100",
    placeholder: "placeholder-green-400/60 dark:placeholder-green-600/60",
  },
};

const COLORS: NoteConfig["color"][] = ["yellow", "blue", "pink", "green"];

// ─── NoteNode data interface ───────────────────────────────────────────────────

interface NoteNodeData {
  label: string;
  config: NoteConfig;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NoteNode({ id, data, selected }: NodeProps) {
  const dispatch = useOptionalEditorDispatch();
  const nodeData = data as unknown as NoteNodeData;
  const config = React.useMemo(
    () => nodeData.config ?? { content: "", color: "yellow" as const },
    [nodeData.config]
  );
  const styles = COLOR_STYLES[config.color] ?? COLOR_STYLES.yellow;

  const [content, setContent] = useState(config.content ?? "");
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Sync external content changes (e.g. undo/redo, version restore)
  useEffect(() => {
    setContent(config.content ?? "");
  }, [config.content]);

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setContent(val);
    },
    []
  );

  // Persist content to schema on blur (debounced blur approach)
  const handleContentBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (!dispatch) return;
      dispatch({
        type: "UPDATE_NODE_CONFIG",
        nodeId: id,
        config: { ...config, content: e.target.value },
      });
    },
    [dispatch, id, config]
  );

  const handleColorChange = useCallback(
    (color: NoteConfig["color"]) => {
      setShowColorPicker(false);
      if (!dispatch) return;
      dispatch({
        type: "UPDATE_NODE_CONFIG",
        nodeId: id,
        config: { ...config, color },
      });
    },
    [dispatch, id, config]
  );

  return (
    <div
      className={cn(
        "relative flex min-w-[160px] min-h-[80px] w-full h-full flex-col rounded-lg border shadow-sm",
        styles.bg,
        styles.border,
        selected && "ring-2 ring-offset-1 ring-current/40",
      )}
    >
      {/* Toolbar — only visible when selected */}
      {selected && dispatch && (
        <div className="absolute -top-7 left-0 flex items-center gap-1 z-10">
          <button
            type="button"
            onClick={() => setShowColorPicker((v) => !v)}
            className={cn(
              "h-5 px-2 rounded text-[10px] font-medium border shadow-sm",
              styles.bg,
              styles.border,
              styles.text,
              "hover:opacity-80 transition-opacity",
            )}
          >
            Color
          </button>
          {showColorPicker && (
            <div className="flex items-center gap-1 bg-popover border border-border rounded px-1.5 py-1 shadow-md">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => handleColorChange(c)}
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-transform hover:scale-110",
                    c === "yellow" && "bg-yellow-300 border-yellow-500",
                    c === "blue" && "bg-blue-300 border-blue-500",
                    c === "pink" && "bg-pink-300 border-pink-500",
                    c === "green" && "bg-green-300 border-green-500",
                    c === config.color && "ring-2 ring-offset-1 ring-foreground/40",
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className={cn("note-drag-handle flex h-6 shrink-0 cursor-grab items-center justify-between px-2.5 pt-1 active:cursor-grabbing", styles.text)}>
        <span className="text-[10px] font-semibold opacity-45">Drag note</span>
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 opacity-35">
          <circle cx="5" cy="5" r="1" />
          <circle cx="11" cy="5" r="1" />
          <circle cx="5" cy="11" r="1" />
          <circle cx="11" cy="11" r="1" />
        </svg>
      </div>

      {/* Editable content */}
      <textarea
        value={content}
        readOnly={!dispatch}
        onChange={handleContentChange}
        onBlur={handleContentBlur}
        placeholder="Add a note…"
        className={cn(
          // nodrag  — don't start a node-drag on mousedown inside textarea
          // nowheel — tell React Flow NOT to intercept wheel events here, so
          //           scrolling the text content works instead of zooming canvas
          "nodrag nowheel w-full min-h-0 flex-1 resize-none overflow-y-auto bg-transparent",
          "px-3 pb-2.5 pt-1 text-[13px] leading-relaxed",
          "border-none outline-none focus:outline-none",
          "rounded-lg",
          styles.text,
          styles.placeholder,
        )}
        // Prevent React Flow from treating keypresses as canvas shortcuts
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
