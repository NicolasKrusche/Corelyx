"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  TEMPLATE_CATEGORIES,
  CATEGORY_LABELS,
  type Difficulty,
  DIFFICULTY_LABEL,
} from "@/lib/templates/template-data";

type SaveAsTemplateModalProps = {
  open: boolean;
  onClose: () => void;
  /** Program ID to save as template. If provided, the template is created from this program. */
  programId?: string;
  /** Pre-fill the template name. */
  initialName?: string;
  /** Pre-fill the template description. */
  initialDescription?: string;
  /** Called after the template is successfully created. */
  onSaved?: (templateId: string) => void;
};

type SaveState = "idle" | "saving" | "done" | "error";

export function SaveAsTemplateModal({
  open,
  onClose,
  programId,
  initialName = "",
  initialDescription = "",
  onSaved,
}: SaveAsTemplateModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState("general");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [isPublic, setIsPublic] = useState(true);
  const [state, setState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset form when modal opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setName(initialName);
        setDescription(initialDescription);
        setCategory("general");
        setDifficulty("medium");
        setIsPublic(true);
        setState("idle");
        setErrorMsg(null);
      }
      if (!isOpen) onClose();
    },
    [initialName, initialDescription, onClose]
  );

  async function handleSave() {
    if (!name.trim()) return;
    setState("saving");
    setErrorMsg(null);

    try {
      // If we have a programId, use the save-as-template-from-run endpoint
      // Otherwise, create a standalone template
      if (programId) {
        const res = await fetch(`/api/programs/${programId}/save-as-template`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            category,
            difficulty,
            is_public: isPublic,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.message || data.error || "Failed to save template");
          setState("error");
          return;
        }
        setState("done");
        onSaved?.(data.template_id);
      } else {
        // Create a standalone template without a program
        // This is used when the user wants to create a template manually
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            category,
            difficulty,
            is_public: isPublic,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.message || data.error || "Failed to save template");
          setState("error");
          return;
        }
        setState("done");
        onSaved?.(data.template_id);
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  }

  const categories = TEMPLATE_CATEGORIES.filter((c) => c !== "all");
  const difficulties: Difficulty[] = ["easy", "medium", "hard"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Create a reusable template from your workflow. Other users will be
            able to discover and use it.
          </DialogDescription>
        </DialogHeader>

        {state === "done" ? (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center dark:border-green-800 dark:bg-green-950">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                ✓ Template saved successfully!
              </p>
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                {isPublic
                  ? "Your template is now visible in the marketplace."
                  : "Your template is saved as a draft. Admins will review it before it goes public."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Name *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My workflow template"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what this template does"
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Difficulty
                </label>
                <div className="mt-1 flex gap-1.5">
                  {difficulties.map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setDifficulty(diff)}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                        difficulty === diff
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {DIFFICULTY_LABEL[diff]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground">
                Visibility
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isPublic
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  🌐 Public
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    !isPublic
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  🔒 Draft
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                {errorMsg}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {state === "done" ? "Close" : "Cancel"}
          </Button>
          {state !== "done" && (
            <Button
              onClick={handleSave}
              disabled={!name.trim() || state === "saving"}
            >
              {state === "saving" ? "Saving…" : "Save Template"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
