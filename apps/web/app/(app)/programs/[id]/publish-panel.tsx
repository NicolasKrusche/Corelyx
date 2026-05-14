"use client";

import { useState } from "react";
import { Lock, Rocket, Shield, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type PublishState = {
  is_public: boolean;
  tags: string[];
  fork_count: number;
  published_at: string | null;
  public_author_name: string | null;
};

export function PublishPanel({
  programId,
  initialState,
  hasSuccessfulRun,
}: {
  programId: string;
  initialState: PublishState;
  hasSuccessfulRun: boolean;
}) {
  const [state, setState] = useState<PublishState>(initialState);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(initialState.tags);
  const [authorInput, setAuthorInput] = useState(initialState.public_author_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function normalizedTags(nextTags = tags): string[] {
    return nextTags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
  }

  function addTag(raw: string) {
    const next = raw.trim().toLowerCase();
    if (!next) return;
    if (tags.includes(next) || tags.length >= 5) return;
    setTags([...tags, next]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((item) => item !== tag));
  }

  async function handleToggle(publish: boolean) {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const body: Record<string, unknown> = {
      publish,
      tags: normalizedTags(),
      public_author_name: authorInput.trim() || null,
    };

    try {
      const res = await fetch(`/api/programs/${programId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { program?: PublishState; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      if (data.program) setState(data.program);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Network error - please try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings() {
    await handleToggle(state.is_public);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Publish to Browse</h2>
            {state.is_public ? (
              <Badge variant="success" className="text-xs">Published</Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                Private
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Share this program with the community. Your API keys are never included.
          </p>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4">
        {!hasSuccessfulRun && !state.is_public && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            This program needs at least one successful run before it can be published.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">
              Tags <span className="text-xs font-normal text-muted-foreground">comma-separated · max 5 · 32 chars each</span>
            </label>
            <div className="mt-2 flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1">
              {normalizedTags().map((tag) => (
                <span key={tag} className="inline-flex h-6 items-center gap-1 rounded bg-muted px-2 text-xs text-foreground">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.includes(",")) {
                    value.split(",").forEach(addTag);
                  } else {
                    setTagInput(value);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag(tagInput);
                  }
                }}
                onBlur={() => addTag(tagInput)}
                placeholder={tags.length === 0 ? "Add tag..." : ""}
                className="h-7 min-w-24 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Help others discover this workflow.</p>
          </div>

          <div>
            <label className="text-sm font-medium">
              Display name <span className="text-xs font-normal text-muted-foreground">optional</span>
            </label>
            <Input
              placeholder="Your name or handle"
              value={authorInput}
              onChange={(e) => setAuthorInput(e.target.value)}
              className="mt-2 h-10 text-sm"
              maxLength={64}
            />
            <p className="mt-2 text-xs text-muted-foreground">Shown as the program author on Browse.</p>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        {success && (
          <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
            {state.is_public ? "Published. Your program is now visible in Browse." : "Unpublished."}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border bg-muted/25 px-5 py-4">
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4 text-emerald-600" />
          Credentials and connection secrets stay in your workspace.
        </p>
        {state.is_public ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleSaveSettings} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleToggle(false)} disabled={saving}>
              {saving ? "Saving..." : "Unpublish"}
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => handleToggle(true)} disabled={saving || !hasSuccessfulRun}>
            <Rocket className="h-4 w-4" />
            {saving ? "Publishing..." : "Publish program"}
          </Button>
        )}
      </div>
    </section>
  );
}
