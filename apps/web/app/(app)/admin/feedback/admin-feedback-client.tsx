"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type FeedbackStatus = "new" | "planned" | "in_progress" | "done" | "declined";
type FeedbackType = "bug" | "idea" | "other";

type FeedbackItem = {
  id: string;
  user_email: string;
  type: FeedbackType;
  message: string;
  page_path: string | null;
  status: FeedbackStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

const TYPE_BADGE: Record<FeedbackType, string> = {
  bug: "bg-red-500/10 text-red-700",
  idea: "bg-violet-500/10 text-violet-700",
  other: "bg-secondary text-muted-foreground",
};

const TYPE_LABEL: Record<FeedbackType, string> = {
  bug: "Bug",
  idea: "Idea",
  other: "Other",
};

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  declined: "Declined",
};

const STATUS_BADGE: Record<FeedbackStatus, string> = {
  new: "bg-blue-500/15 text-blue-700",
  planned: "bg-amber-500/15 text-amber-700",
  in_progress: "bg-violet-500/15 text-violet-700",
  done: "bg-green-500/15 text-green-700",
  declined: "bg-secondary text-muted-foreground",
};

const STATUS_FILTERS: Array<"all" | FeedbackStatus> = ["all", "new", "planned", "in_progress", "done", "declined"];

function formatRelative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function AdminFeedbackClient() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [filter, setFilter] = useState<"all" | FeedbackStatus>("new");
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchItems() {
    const res = await fetch("/api/admin/feedback");
    if (!res.ok) return;
    const data = (await res.json()) as { feedback: FeedbackItem[] };
    setItems(data.feedback);
    setLoading(false);
  }

  useEffect(() => {
    void fetchItems();
  }, []);

  useEffect(() => {
    setNotes(selected?.admin_notes ?? "");
  }, [selected?.id, selected?.admin_notes]);

  async function updateSelected(patch: { status?: FeedbackStatus; admin_notes?: string }) {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/admin/feedback/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const { feedback: updated } = (await res.json()) as { feedback: Pick<FeedbackItem, "id" | "status" | "admin_notes" | "updated_at"> };
      setSelected((f) => f ? { ...f, ...updated } : f);
      setItems((fs) => fs.map((f) => f.id === selected.id ? { ...f, ...updated } : f));
    }
    setSaving(false);
  }

  const filtered = items.filter((f) => filter === "all" || f.status === filter);
  const counts = {
    all: items.length,
    new: items.filter((f) => f.status === "new").length,
    planned: items.filter((f) => f.status === "planned").length,
    in_progress: items.filter((f) => f.status === "in_progress").length,
    done: items.filter((f) => f.status === "done").length,
    declined: items.filter((f) => f.status === "declined").length,
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Feedback list */}
      <div className="flex w-96 shrink-0 flex-col rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Feedback</h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {f === "all" ? "All" : STATUS_LABEL[f]} ({counts[f]})
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing here.</p>
          ) : filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className={cn(
                "w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent",
                selected?.id === item.id && "bg-accent",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm">{item.message}</p>
                <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", STATUS_BADGE[item.status])}>
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", TYPE_BADGE[item.type])}>
                  {TYPE_LABEL[item.type]}
                </span>
                <span className="text-[11px] text-muted-foreground">{item.user_email}</span>
                <span className="text-[11px] text-muted-foreground">· {formatRelative(item.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex flex-1 flex-col rounded-2xl border border-border bg-card overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a piece of feedback to view it.
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", TYPE_BADGE[selected.type])}>
                  {TYPE_LABEL[selected.type]}
                </span>
                <p className="mt-2 text-xs text-muted-foreground">
                  {selected.user_email} · {formatRelative(selected.created_at)}
                  {selected.page_path && <> · from <span className="font-mono">{selected.page_path}</span></>}
                </p>
              </div>
              <select
                value={selected.status}
                onChange={(e) => void updateSelected({ status: e.target.value as FeedbackStatus })}
                disabled={saving}
                className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary disabled:opacity-50"
              >
                {(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>

            <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-secondary/50 p-4 text-sm">
              {selected.message}
            </p>

            <div className="mt-4 flex flex-1 flex-col">
              <label className="mb-1.5 text-xs font-semibold text-muted-foreground">Internal notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes for the team — not visible to the user…"
                rows={4}
                className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => void updateSelected({ admin_notes: notes })}
                disabled={saving || notes === (selected.admin_notes ?? "")}
                className="mt-2 self-end rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save notes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
