"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { friendlyResponseMessage } from "@/lib/friendly-errors";
import { KnowledgeCanvas, type CanvasLink } from "./knowledge-canvas";

type Doc = {
  id: string;
  title: string;
  content: string;
  source_type: string | null;
  source_name: string | null;
  embedding_status: string | null;
  canvas_x: number | null;
  canvas_y: number | null;
  created_at: string;
  updated_at: string | null;
};

type SearchHit = { title: string; excerpt: string; similarity?: number; linked?: boolean };
type SearchResult = { results: SearchHit[]; searched: number; method: "semantic" | "keyword" };

const ACCEPTED_FILES = ".pdf,.md,.markdown,.txt,.csv,.json,.html,.htm";

// ─── Small presentational helpers ─────────────────────────────────────────────

function RelativeDate({ iso }: { iso: string }) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return <span>Today</span>;
  if (days === 1) return <span>Yesterday</span>;
  if (days < 30) return <span>{days}d ago</span>;
  return <span>{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>;
}

function wordCount(text: string): string {
  const n = (text.match(/\S+/g) ?? []).length;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k words`;
  return `${n} word${n === 1 ? "" : "s"}`;
}

/** How this doc is retrieved: semantically indexed, or keyword-only fallback. */
function IndexChip({ status }: { status: string | null }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
        <Zap className="h-2.5 w-2.5" /> Indexed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
        Index failed
      </span>
    );
  }
  // skipped (no embedding key) or pending — keyword retrieval still works.
  return (
    <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/50">
      Keyword only
    </span>
  );
}

// ─── Retrieval preview ────────────────────────────────────────────────────────

function RetrievalPreview() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/knowledge/search?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(friendlyResponseMessage(data, "Search failed. Please try again."));
        setResult(null);
        return;
      }
      setResult(data as SearchResult);
    } catch {
      setError("We couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border glass-panel">
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3.5">
        <Search className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Test retrieval</p>
        <p className="hidden text-xs text-muted-foreground sm:block">
          — see exactly what your agents will find
        </p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
            placeholder="Ask like an agent would… e.g. how do we handle refunds?"
            className="w-full rounded-xl border border-border/60 bg-background/60 px-3.5 py-2 text-sm outline-none transition-colors focus:border-primary/40"
          />
          <Button onClick={() => void run()} disabled={busy || query.trim().length === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ${
                  result.method === "semantic"
                    ? "bg-primary/10 text-primary ring-primary/20"
                    : "bg-muted/60 text-muted-foreground ring-border/50"
                }`}
              >
                {result.method === "semantic" ? <Sparkles className="h-2.5 w-2.5" /> : null}
                {result.method === "semantic" ? "Semantic search" : "Keyword search"}
              </span>
              <span>
                {result.results.length === 0
                  ? "No matches"
                  : `${result.results.length} match${result.results.length === 1 ? "" : "es"}`}
              </span>
            </div>

            {result.results.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
                Nothing relevant found. An agent asking this would fall back to its general knowledge —
                consider adding a doc that covers it.
              </p>
            ) : (
              result.results.map((hit, i) => (
                <div key={i} className="rounded-xl border border-border/50 bg-background/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold">{hit.title}</p>
                    {hit.linked ? (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        ↳ via reference
                      </span>
                    ) : (
                      typeof hit.similarity === "number" && (
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {Math.round(hit.similarity * 100)}% match
                        </span>
                      )
                    )}
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {hit.excerpt}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Composer (write or upload) ───────────────────────────────────────────────

function Composer({
  onSaved,
  onClose,
}: {
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"write" | "upload">("write");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<Array<{ name: string; status: "uploading" | "done" | "error"; message?: string }>>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function saveText() {
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
      await onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setUploads(files.map((f) => ({ name: f.name, status: "uploading" as const })));
      let anySucceeded = false;
      for (const [i, file] of files.entries()) {
        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/agents/knowledge/upload", { method: "POST", body: form });
          const data = await res.json().catch(() => null);
          setUploads((prev) =>
            prev.map((u, j) =>
              j === i
                ? res.ok
                  ? { ...u, status: "done" }
                  : { ...u, status: "error", message: friendlyResponseMessage(data, "Upload failed.") }
                : u
            )
          );
          if (res.ok) anySucceeded = true;
        } catch {
          setUploads((prev) =>
            prev.map((u, j) => (j === i ? { ...u, status: "error", message: "Network error." } : u))
          );
        }
      }
      if (anySucceeded) await onSaved();
    },
    [onSaved]
  );

  return (
    <div className="rounded-2xl border glass-panel">
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-0.5">
          {(
            [
              { id: "write", label: "Write", icon: <Pencil className="h-3 w-3" /> },
              { id: "upload", label: "Upload files", icon: <Upload className="h-3 w-3" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 px-5 py-4">
        {mode === "write" ? (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (e.g. Brand voice, Refund policy)"
              className="w-full rounded-xl border border-border/60 bg-background/60 px-3.5 py-2 text-sm outline-none transition-colors focus:border-primary/40"
            />
            <Textarea
              className="min-h-[160px] resize-none text-sm"
              placeholder="Paste or write the content the agent should know…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <Button onClick={() => void saveText()} disabled={busy || content.trim().length === 0}>
                {busy ? "Saving…" : "Save knowledge"}
              </Button>
              {content.trim() && (
                <span className="text-[11px] text-muted-foreground">{wordCount(content)}</span>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void uploadFiles(Array.from(e.dataTransfer.files));
              }}
              onClick={() => fileInput.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragOver
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/60 hover:border-primary/30 hover:bg-muted/20"
              }`}
            >
              <FileUp className="h-7 w-7 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium">
                Drop files here, or <span className="text-primary">browse</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, Markdown, text, CSV, JSON, HTML — up to 8 MB each
              </p>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={ACCEPTED_FILES}
                className="hidden"
                onChange={(e) => {
                  void uploadFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>

            {uploads.length > 0 && (
              <ul className="space-y-1.5">
                {uploads.map((u, i) => (
                  <li key={`${u.name}-${i}`} className="flex items-center gap-2 text-xs">
                    {u.status === "uploading" && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {u.status === "done" && <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                    {u.status === "error" && <X className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                    <span className="truncate font-medium">{u.name}</span>
                    {u.message && <span className="truncate text-destructive">{u.message}</span>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

// ─── Doc detail / edit dialog ─────────────────────────────────────────────────

function DocDialog({
  doc,
  onClose,
  onSaved,
  onDelete,
}: {
  doc: Doc;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function save() {
    if (busy || content.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/knowledge/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || "Untitled", content: content.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not save changes."));
        return;
      }
      await onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-50 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/50 px-6 py-4">
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary/40"
                placeholder="Title"
              />
            ) : (
              <p className="truncate text-base font-semibold">{doc.title}</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <IndexChip status={doc.embedding_status} />
              <span>
                {doc.source_type === "file" ? (doc.source_name ?? "Uploaded file") : "Written here"}
              </span>
              <span>·</span>
              <span>{wordCount(doc.content)}</span>
              <span>·</span>
              <RelativeDate iso={doc.created_at} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {editing ? (
            <Textarea
              className="min-h-[300px] w-full resize-none text-sm"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {doc.content}
            </p>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-6 py-3.5">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={busy}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setTitle(doc.title);
                    setContent(doc.content);
                    setError(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button onClick={() => void save()} disabled={busy || content.trim().length === 0}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

/**
 * Manage the workspace knowledge base agents retrieve from (RAG v2). Write or
 * upload docs; they're chunked + embedded for semantic retrieval via
 * corelyx.search_knowledge. The "Test retrieval" panel runs the exact search
 * agents use, so users can verify what their agents will see.
 */
export function KnowledgeManager() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [links, setLinks] = useState<CanvasLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/knowledge");
      const data = res.ok ? await res.json() : { knowledge: [], links: [] };
      setDocs((data.knowledge ?? []) as Doc[]);
      setLinks((data.links ?? []) as CanvasLink[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    setConfirmDeleteId(null);
    setOpenDoc(null);
    setError(null);
    const res = await fetch(`/api/agents/knowledge/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(friendlyResponseMessage(data, "Could not delete."));
      return;
    }
    await load();
  }

  const indexedCount = useMemo(
    () => docs.filter((d) => d.embedding_status === "ready").length,
    [docs]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </span>
            <h1 className="text-xl font-bold tracking-tight">Knowledge</h1>
            {docs.length > 0 && (
              <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-border/50">
                {docs.length} doc{docs.length === 1 ? "" : "s"}
                {indexedCount > 0 ? ` · ${indexedCount} indexed` : ""}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Give your agents context about your world — docs, playbooks, brand voice, who&apos;s who.
            Agents search this to ground their work instead of guessing.
          </p>
        </div>
        {!composing && (
          <Button onClick={() => setComposing(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add knowledge
          </Button>
        )}
      </div>

      {/* ── Composer ───────────────────────────────────── */}
      {composing && <Composer onSaved={load} onClose={() => setComposing(false)} />}

      {/* ── Retrieval preview ──────────────────────────── */}
      {docs.length > 0 && <RetrievalPreview />}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ── Docs ───────────────────────────────────────── */}
      {loading ? null : docs.length === 0 && !composing ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpen className="h-6 w-6 text-primary" />
          </span>
          <p className="mt-4 text-base font-semibold">No knowledge yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Write a doc or upload files (PDF, Markdown, text) and your agents will pull from them
            when they work.
          </p>
          <Button className="mt-5" onClick={() => setComposing(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add your first doc
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Drag orbs to arrange them. Drag from an orb&apos;s edge to another to draw a reference.
            Click an orb to open it; select a link and press Delete to remove it.
          </p>
          <KnowledgeCanvas
            docs={docs}
            links={links}
            onOpenDoc={(id) => setOpenDoc(docs.find((d) => d.id === id) ?? null)}
            canEdit
          />
        </div>
      )}

      {/* ── Detail / edit dialog ───────────────────────── */}
      {openDoc && (
        <DocDialog
          doc={openDoc}
          onClose={() => setOpenDoc(null)}
          onSaved={load}
          onDelete={() => setConfirmDeleteId(openDoc.id)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this doc?"
        description="Agents will no longer be able to retrieve it. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteId && void remove(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
