"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ValidationResult } from "@/lib/validation";
import type { LayoutDirection } from "@/lib/schema/layout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditorToolbarProps {
  programId: string;
  programName: string;
  isDirty: boolean;
  isSaving: boolean;
  isValidating: boolean;
  isRunning: boolean;
  canUndo: boolean;
  canRedo: boolean;
  validationResult: ValidationResult | null;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onValidate: () => void | Promise<void>;
  onRun: () => void;
  activeRunId: string | null;
  onStop: () => void;
  onRename: (name: string) => void;
  onBack: () => void;
  showPalette: boolean;
  onTogglePalette: () => void;
  onHistory: () => void;
  onAiEdit: () => void;
  /** Re-arrange all nodes with the deterministic auto-layout in the given direction. */
  onAutoLayout: (direction: LayoutDirection) => void;
  /** The user's last-used layout direction, shown as the active option in the menu. */
  layoutDirection: LayoutDirection;
  /** Present only when the trigger is a webhook — shows the Test button. */
  onTestWebhook?: () => void;
  /** Raw schema editor — only present when the user has the dev toggle enabled. */
  showRawSchema?: boolean;
  onToggleRawSchema?: () => void;
  /** Step debugger — only shown when enableAdvancedEditor is true. */
  showDebugger?: boolean;
  onToggleDebugger?: () => void;
}

// ─── Icons (inline SVG, no icon library dep) ─────────────────────────────────

function UndoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
      <path d="M3 6H10a4 4 0 010 8H6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 6L6 3M3 6l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
      <path d="M13 6H6a4 4 0 000 8h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 6L10 3M13 6l-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
      <path d="M12 13H4a1 1 0 01-1-1V4a1 1 0 011-1h7l2 2v7a1 1 0 01-1 1z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 13V9H6v4M6 3v3h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RunIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M4 2.5l9 5.5-9 5.5V2.5z" />
    </svg>
  );
}

function ValidateIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M5 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
      <rect x="2" y="6" width="4" height="4" rx="1" />
      <rect x="10" y="2" width="4" height="4" rx="1" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <path d="M6 8h2M8 8V4h2M8 8v4h2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CaretIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3 w-3 opacity-60">
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Separator ────────────────────────────────────────────────────────────────

function Sep() {
  return <div className="h-5 w-px bg-border mx-1" />;
}

// ─── EditorToolbar ────────────────────────────────────────────────────────────

export function EditorToolbar({
  programId,
  programName,
  isDirty,
  isSaving,
  isValidating,
  isRunning,
  canUndo,
  canRedo,
  validationResult,
  onUndo,
  onRedo,
  onSave,
  onValidate,
  onRun,
  activeRunId,
  onStop,
  onRename,
  onBack,
  showPalette,
  onTogglePalette,
  onHistory,
  onAiEdit,
  onAutoLayout,
  layoutDirection,
  onTestWebhook,
  showRawSchema,
  onToggleRawSchema,
  showDebugger,
  onToggleDebugger,
}: EditorToolbarProps) {
  const hasErrors = validationResult && !validationResult.valid;
  const isValid = validationResult?.valid === true;
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(programName);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!isRenaming) setDraftName(programName);
  }, [isRenaming, programName]);

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  function handleBack() {
    if (isDirty) {
      setShowLeaveConfirm(true);
    } else {
      onBack();
    }
  }

  function commitRename() {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    const nextName = draftName.trim() || "Untitled program";
    setDraftName(nextName);
    setIsRenaming(false);
    onRename(nextName);
  }

  function cancelRename() {
    skipBlurCommitRef.current = true;
    setDraftName(programName);
    setIsRenaming(false);
  }

  return (
    <>
    <ConfirmDialog
      open={showLeaveConfirm}
      title="Unsaved changes"
      description="You have unsaved changes. Leave without saving?"
      confirmLabel="Leave"
      cancelLabel="Stay"
      variant="default"
      onConfirm={() => { setShowLeaveConfirm(false); onBack(); }}
      onCancel={() => setShowLeaveConfirm(false)}
    />
    <header className="fixed top-0 left-0 right-0 z-40 h-14 flex items-center gap-2 px-3 bg-background border-b border-border shadow-sm">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="gap-1 text-muted-foreground hover:text-foreground shrink-0"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
          <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Button>

      <Sep />

      {/* Program name + save status */}
      <div className="flex items-center gap-2 min-w-0">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") cancelRename();
            }}
            className="h-8 max-w-[260px] rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground outline-none ring-2 ring-transparent focus:ring-ring"
            aria-label="Program name"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsRenaming(true)}
            onDoubleClick={() => setIsRenaming(true)}
            className="max-w-[220px] truncate rounded px-1 text-left text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Rename program"
          >
            {programName}
          </button>
        )}
        <span
          className={cn(
            "text-[10px] font-medium shrink-0",
            isSaving && "text-muted-foreground",
            !isSaving && isDirty && "text-amber-600 dark:text-amber-400",
            !isSaving && !isDirty && "text-green-600 dark:text-green-400"
          )}
        >
          {isSaving ? "Saving…" : isDirty ? "Unsaved" : "Saved"}
        </span>
      </div>

      <Sep />

      {/* Add node palette toggle */}
      <Button
        variant={showPalette ? "default" : "outline"}
        size="sm"
        onClick={onTogglePalette}
        className="gap-1.5"
        title="Add node (toggle palette)"
        data-tour="editor-add-node"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
          <path d="M8 3v10M3 8h10" strokeLinecap="round" />
        </svg>
        Add node
      </Button>

      <Sep />

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onUndo}
          disabled={!canUndo}
          className="h-7 w-7"
          title="Undo (Cmd+Z)"
          aria-label="Undo"
        >
          <UndoIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRedo}
          disabled={!canRedo}
          className="h-7 w-7"
          title="Redo (Cmd+Shift+Z)"
          aria-label="Redo"
        >
          <RedoIcon />
        </Button>
      </div>

      {/* History */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onHistory}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        title="Version history"
      >
        <HistoryIcon />
        History
      </Button>

      {/* Auto-layout — re-arrange nodes; choose horizontal or vertical */}
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLayoutMenuOpen((open) => !open)}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          title="Auto-arrange the nodes"
          aria-haspopup="menu"
          aria-expanded={layoutMenuOpen}
        >
          <LayoutIcon />
          Auto-layout
          <CaretIcon />
        </Button>
        {layoutMenuOpen && (
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setLayoutMenuOpen(false)} />
            <div
              role="menu"
              className="absolute top-full left-0 mt-1 z-50 min-w-[168px] rounded-md border border-border bg-popover p-1 shadow-md"
            >
              {(["horizontal", "vertical"] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLayoutMenuOpen(false);
                    onAutoLayout(dir);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                    layoutDirection === dir ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {dir === "horizontal" ? "Horizontal" : "Vertical"}
                  {layoutDirection === dir && (
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                      <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit with AI */}
      <Button
        variant="outline"
        size="sm"
        onClick={onAiEdit}
        className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60"
        title="Edit this program with AI"
        data-tour="editor-ai-edit"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
          <path d="M8 2l1.5 3L13 6.5 9.5 8 8 11.5 6.5 8 3 6.5 6.5 5z" strokeLinejoin="round" />
          <path d="M12 10l.75 1.5L14 12l-1.25.5L12 14l-.75-1.5L10 12l1.25-.5z" strokeLinejoin="round" />
        </svg>
        Edit with AI
      </Button>

      {/* Raw schema editor toggle — only visible when user has developer mode on */}
      {onToggleRawSchema && (
        <Button
          variant={showRawSchema ? "default" : "outline"}
          size="sm"
          onClick={onToggleRawSchema}
          className="gap-1 font-mono text-xs px-2.5"
          title="Toggle raw schema editor"
        >
          {"{ }"}
        </Button>
      )}

      {/* Spacer pushes remaining buttons to the right */}
      <div className="flex-1" />

      {/* Validate */}
      <Button
        variant="outline"
        size="sm"
        onClick={onValidate}
        disabled={isValidating}
        className="gap-1.5"
        title="Check the workflow before running it"
        data-tour="editor-validate"
      >
        <ValidateIcon />
        {isValidating ? "Validating..." : "Validate"}
        {validationResult && (
          <span
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
              hasErrors
                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
            )}
          >
            {hasErrors ? validationResult.errors.length : "✓"}
          </span>
        )}
      </Button>

      {/* Save */}
      <Button
        variant="outline"
        size="sm"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        className="gap-1.5"
        title="Save (Cmd+S)"
        data-tour="editor-save"
      >
        <SaveIcon />
        {isSaving ? "Saving…" : "Save"}
      </Button>

      {/* Run with payload — always available for debugging */}
      {onTestWebhook && (
        <Button
          variant="outline"
          size="sm"
          onClick={onTestWebhook}
          disabled={isRunning}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          title="Run with a custom JSON payload for debugging"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5">
            <path d="M2 8h9M8 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="13" cy="8" r="1.5" fill="currentColor" stroke="none" />
          </svg>
          Run with payload
        </Button>
      )}

      {/* Stop — only visible while a run is active */}
      {activeRunId && (
        <Button
          size="sm"
          variant="outline"
          onClick={onStop}
          className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
          title="Stop the current run"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
            <rect x="3" y="3" width="10" height="10" rx="1.5" />
          </svg>
          Stop
        </Button>
      )}

      {/* Run */}
      <div className="relative group">
        <Button
          size="sm"
          onClick={onRun}
          disabled={isRunning}
          className={cn(
            "gap-1.5",
            isValid
              ? "bg-green-600 hover:bg-green-700 text-white"
              : hasErrors
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-green-600 hover:bg-green-700 text-white"
          )}
          title={hasErrors ? "Run will show validation issues if the workflow is not executable" : "Run program"}
          data-tour="editor-run"
        >
          <RunIcon />
          {isRunning ? "Starting…" : "Run"}
        </Button>
        {hasErrors && (
          <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
            <div className="rounded-md bg-popover border border-border shadow-md px-3 py-2 text-xs text-foreground whitespace-nowrap">
              Run will show {validationResult?.errors.length} blocking issue{validationResult?.errors.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>
    </header>
    </>
  );
}
