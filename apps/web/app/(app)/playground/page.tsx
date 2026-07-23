"use client";

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProgramSchema } from "@flowos/schema";
import { PromptEditor } from "@/components/playground/PromptEditor";
import { SchemaPreview } from "@/components/playground/SchemaPreview";
import { DiffViewer } from "@/components/playground/DiffViewer";
import { TestCaseList } from "@/components/playground/TestCaseList";

// ─── Iteration entry ─────────────────────────────────────────────────────────

interface Iteration {
  prompt: string;
  schema: ProgramSchema;
  reasoning: string;
  timestamp: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────

/**
 * Genesis Playground — interactive prompt testing interface.
 *
 * Split view: Prompt input (left) → Generated schema preview (right)
 * with iteration history and diff view between versions.
 */
export default function PlaygroundPage() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Iteration history
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [selectedIteration, setSelectedIteration] = useState<number>(-1);

  // Save test case state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveTags, setSaveTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Sidebar tab
  const [sidebarTab, setSidebarTab] = useState<"schema" | "diff" | "cases">(
    "schema"
  );

  // Current schema = latest iteration or selected iteration
  const currentSchema = useMemo(() => {
    if (iterations.length === 0) return null;
    if (selectedIteration >= 0 && selectedIteration < iterations.length) {
      return iterations[selectedIteration].schema;
    }
    return iterations[iterations.length - 1].schema;
  }, [iterations, selectedIteration]);

  const previousSchema = useMemo(() => {
    if (iterations.length < 2) return null;
    const idx =
      selectedIteration >= 0 ? selectedIteration : iterations.length - 1;
    if (idx <= 0) return null;
    return iterations[idx - 1].schema;
  }, [iterations, selectedIteration]);

  const currentIteration = useMemo(() => {
    if (iterations.length === 0) return null;
    if (selectedIteration >= 0 && selectedIteration < iterations.length) {
      return iterations[selectedIteration];
    }
    return iterations[iterations.length - 1];
  }, [iterations, selectedIteration]);

  // ── Generate handler ─────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setError(null);
    setIsGenerating(true);

    try {
      const isRefinement = iterations.length > 0;
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
      };
      if (isRefinement && currentSchema) {
        body.existing_schema = currentSchema;
      }

      const res = await fetch("/api/playground/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(json.error ?? "Generation failed");
      }

      const data = (await res.json()) as {
        schema: ProgramSchema;
        reasoning: string;
      };

      const iteration: Iteration = {
        prompt: prompt.trim(),
        schema: data.schema,
        reasoning: data.reasoning,
        timestamp: new Date().toISOString(),
      };

      setIterations((prev) => [...prev, iteration]);
      setSelectedIteration(-1); // select latest
      setPrompt(""); // clear for next refinement
      setSidebarTab("schema");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect. Check your internet and try again."
      );
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, isGenerating, iterations, currentSchema]);

  // ── Load test case ──────────────────────────────────────────────────────
  const handleLoadTestCase = useCallback(
    (testCasePrompt: string, schema: ProgramSchema | null) => {
      setPrompt(testCasePrompt);
      if (schema) {
        const iteration: Iteration = {
          prompt: testCasePrompt,
          schema,
          reasoning: "Loaded from test case",
          timestamp: new Date().toISOString(),
        };
        setIterations((prev) => [...prev, iteration]);
        setSelectedIteration(-1);
      }
    },
    []
  );

  // ── Save test case ──────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!currentSchema || !saveName.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/playground/test-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          prompt: iterations[0]?.prompt ?? "",
          expected_schema: currentSchema,
          tags: saveTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Failed to save");
      }
      setShowSaveDialog(false);
      setSaveName("");
      setSaveTags("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save test case");
    } finally {
      setIsSaving(false);
    }
  }, [currentSchema, saveName, saveTags, iterations]);

  // ── Reset ──────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setIterations([]);
    setSelectedIteration(-1);
    setPrompt("");
    setError(null);
    setShowSaveDialog(false);
  }, []);

  return (
    <div className="mx-auto max-w-7xl">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-5 w-5 text-primary"
            >
              <path
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Genesis Playground
            </h1>
            <p className="text-sm text-muted-foreground">
              Test prompts and preview generated workflows interactively
            </p>
          </div>
        </div>
      </div>

      {/* Main split view */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left: Prompt input + history ──────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <PromptEditor
            value={prompt}
            onChange={setPrompt}
            disabled={isGenerating}
            onSubmit={handleGenerate}
            placeholder={
              iterations.length === 0
                ? 'Describe what you want your workflow to do, e.g.\n\n"When a new email arrives in Gmail with the subject containing \'invoice\', extract the amount, create a row in my Notion database, and send a Slack notification to the #finance channel."'
                : "Describe what you want to change about the workflow…"
            }
          />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {isGenerating ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="opacity-25"
                    />
                    <path
                      d="M12 2a10 10 0 0 1 10 10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="h-4 w-4"
                  >
                    <path
                      d="M13.5 8A5.5 5.5 0 1 1 2.5 8a5.5 5.5 0 0 1 11 0Z"
                      strokeLinecap="round"
                    />
                    <path d="M5.5 8h5M8 5.5v5" strokeLinecap="round" />
                  </svg>
                  {iterations.length === 0 ? "Generate" : "Re-generate"}
                </>
              )}
            </button>

            {iterations.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSaveDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="h-3.5 w-3.5"
                  >
                    <path
                      d="M12.5 13.5h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H10l3 3v7a1 1 0 0 1-1 1Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9.5 2.5v3h3M5.5 9.5h5M5.5 12h3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Save as test case
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="h-3.5 w-3.5"
                  >
                    <path
                      d="M2 8a6 6 0 1 1 1.76 4.24"
                      strokeLinecap="round"
                    />
                    <path d="M2 12.5V8h4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Reset
                </button>
              </>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Iteration history */}
          {iterations.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
                Iteration History ({iterations.length})
              </h3>
              <div className="space-y-1.5">
                {iterations.map((iter, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedIteration(i)}
                    className={cn(
                      "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                      (selectedIteration === -1
                        ? i === iterations.length - 1
                        : i === selectedIteration)
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 bg-muted/20 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground/80">
                        #{i + 1}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {relativeTime(iter.timestamp)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/60 truncate">
                      {iter.prompt}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/40 truncate">
                      {iter.schema.nodes.length} nodes · {iter.schema.edges.length}{" "}
                      edges
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Schema preview / diff / test cases ─────────────────── */}
        <div className="flex flex-col gap-4">
          {/* Tab bar */}
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/20 p-1">
            {(
              [
                { key: "schema", label: "Schema Preview" },
                { key: "diff", label: "Diff View" },
                { key: "cases", label: "Test Cases" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSidebarTab(key)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sidebarTab === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-[400px]">
            {sidebarTab === "schema" && (
              <SchemaPreview schema={currentSchema} className="h-full" />
            )}

            {sidebarTab === "diff" && currentSchema && previousSchema ? (
              <DiffViewer
                before={previousSchema}
                after={currentSchema}
                className="h-full"
              />
            ) : sidebarTab === "diff" ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground/60">
                    Generate at least two iterations to see a diff
                  </p>
                </div>
              </div>
            ) : null}

            {sidebarTab === "cases" && (
              <TestCaseList onLoad={handleLoadTestCase} className="h-full" />
            )}
          </div>

          {/* AI reasoning display */}
          {currentIteration && sidebarTab === "schema" && (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                AI Reasoning
              </p>
              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                {currentIteration.reasoning}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Save test case dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground">
              Save as Test Case
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Save this prompt and generated schema for reuse.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="tc-name"
                  className="block text-xs font-medium text-muted-foreground mb-1"
                >
                  Name
                </label>
                <input
                  id="tc-name"
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Email to Notion pipeline"
                  className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/25"
                />
              </div>

              <div>
                <label
                  htmlFor="tc-tags"
                  className="block text-xs font-medium text-muted-foreground mb-1"
                >
                  Tags (comma-separated)
                </label>
                <input
                  id="tc-tags"
                  type="text"
                  value={saveTags}
                  onChange={(e) => setSaveTags(e.target.value)}
                  placeholder="e.g. email, notion, slack"
                  className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/25"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!saveName.trim() || isSaving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Act transparency notice */}
      <div className="mt-8 rounded-lg border border-border/40 bg-muted/10 px-4 py-3">
        <p className="text-[10px] text-muted-foreground/50">
          AI-generated content. Iteration history is preserved for transparency
          (EU AI Act Art. 50). Use the Playground to test and refine prompts
          before deploying workflows.
        </p>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
