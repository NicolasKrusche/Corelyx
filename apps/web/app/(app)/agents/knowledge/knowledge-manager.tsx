"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { friendlyResponseMessage } from "@/lib/friendly-errors";

type Doc = { id: string; title: string; content: string; created_at: string };

/**
 * Manage the workspace knowledge base agents retrieve from (RAG v1). Add docs,
 * playbooks, brand voice, customer notes — agents call corelyx.search_knowledge
 * to ground their output in this instead of being generic.
 */
export function KnowledgeManager() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/agents/knowledge");
      const data = res.ok ? await res.json() : { knowledge: [] };
      setDocs((data.knowledge ?? []) as Doc[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    if (busy || content.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not save."));
        return;
      }
      setTitle("");
      setContent("");
      setAdding(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/knowledge/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not delete."));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </span>
            <h1 className="text-xl font-bold tracking-tight">Knowledge</h1>
          </div>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Give your agents context about your world — docs, playbooks, brand voice, who&apos;s who.
            Agents search this to ground their work instead of guessing.
          </p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)} disabled={busy}>
            <Plus className="mr-1.5 h-4 w-4" /> Add knowledge
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-3 rounded-2xl border bg-card/80 p-4 shadow-sm">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Brand voice, Refund policy)"
            className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary/40"
          />
          <Textarea
            className="min-h-[160px] resize-none text-sm"
            placeholder="Paste the content the agent should know…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button onClick={() => void add()} disabled={busy || content.trim().length === 0}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? null : docs.length === 0 && !adding ? (
        <div className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No knowledge yet. Add docs your agents should know.
        </div>
      ) : (
        <div className="space-y-2.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-4 rounded-2xl border border-border/80 bg-card/80 px-5 py-4 shadow-sm">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{d.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.content}</p>
              </div>
              <button
                onClick={() => void remove(d.id)}
                disabled={busy}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
