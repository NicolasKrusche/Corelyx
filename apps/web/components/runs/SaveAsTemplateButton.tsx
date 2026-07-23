"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SaveAsTemplateButtonProps {
  runId: string;
  programName: string;
}

export function SaveAsTemplateButton({
  runId,
  programName,
}: SaveAsTemplateButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(programName);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [difficulty, setDifficulty] = useState("medium");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return;
    setState("loading");
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/runs/${runId}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), category, difficulty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Failed to save template");
        setState("error");
        return;
      }
      setState("done");
      setTimeout(() => {
        setOpen(false);
        setState("idle");
        setName("");
        setDescription("");
      }, 1500);
    } catch {
      setErrorMsg("Network error");
      setState("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
          "border border-border bg-background hover:bg-accent transition-colors"
        )}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
          <path d="M2 2h8l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2z" strokeLinejoin="round" />
          <path d="M10 2v4h4" strokeLinejoin="round" />
          <path d="M6 9v4M4 11h4" strokeLinecap="round" />
        </svg>
        Save as Template
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border border-border shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Save as Template</h2>

            {state === "done" ? (
              <p className="text-sm text-green-600 dark:text-green-400">
                Template saved successfully!
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name *</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="My workflow template"
                      className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of what this template does"
                      rows={2}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                      >
                        <option value="general">General</option>
                        <option value="devops">DevOps</option>
                        <option value="marketing">Marketing</option>
                        <option value="sales">Sales</option>
                        <option value="data">Data</option>
                        <option value="support">Support</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Difficulty</label>
                      <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <p className="text-xs text-destructive">{errorMsg}</p>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setState("idle");
                  setErrorMsg(null);
                }}
                className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              >
                {state === "done" ? "Close" : "Cancel"}
              </button>
              {state !== "done" && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!name.trim() || state === "loading"}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {state === "loading" ? "Saving…" : "Save Template"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
