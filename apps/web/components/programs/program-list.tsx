"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Folder, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeleteProgramButton } from "@/components/programs/delete-program-button";

export type ProgramListItem = {
  id: string;
  name: string;
  description: string | null;
  execution_mode: string;
  is_active: boolean;
  schema_version: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  folder_id: string | null;
};

export type FolderItem = {
  id: string;
  name: string;
  color: string | null;
};

export type ProgramStats = Record<string, { total: number; failed: number; runSeries?: number[]; providers?: string[] }>;

const PROVIDER_COLORS: Record<string, string> = {
  gmail: "bg-red-500",
  sheets: "bg-emerald-500",
  slack: "bg-violet-600",
  notion: "bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900",
  calendar: "bg-blue-500",
  airtable: "bg-amber-500",
  hubspot: "bg-orange-500",
  docs: "bg-blue-600",
  github: "bg-neutral-800 dark:bg-neutral-200 dark:text-neutral-900",
  drive: "bg-green-600",
  asana: "bg-rose-500",
  outlook: "bg-sky-600",
  typeform: "bg-neutral-700",
};

function providerInitial(provider: string) {
  return provider.slice(0, 1).toUpperCase();
}

function sparklinePoints(values: number[]) {
  const max = Math.max(...values, 1);
  return values
    .map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 48},${15 - (value / max) * 13}`)
    .join(" ");
}

function RunSparkline({ values }: { values: number[] }) {
  return (
    <svg viewBox="0 0 48 16" aria-label={`Runs by day: ${values.join(", ")}`} className="h-4 w-12 overflow-visible">
      <polyline
        points={sparklinePoints(values)}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        className="text-muted-foreground/60"
      />
    </svg>
  );
}

function ConnectionBadges({ providers }: { providers: string[] }) {
  const visible = providers.slice(0, 3);
  return (
    <div className="flex min-w-14 shrink-0 items-center">
      {visible.map((provider, index) => (
        <span
          key={provider}
          title={provider}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md border border-background text-[10px] font-black text-white shadow-sm",
            index > 0 && "-ml-1.5",
            PROVIDER_COLORS[provider] ?? "bg-primary"
          )}
        >
          {providerInitial(provider)}
        </span>
      ))}
      {providers.length > visible.length && (
        <span className="-ml-1.5 flex h-6 min-w-6 items-center justify-center rounded-md border border-background bg-muted px-1 text-[9px] font-bold text-muted-foreground shadow-sm">
          +{providers.length - visible.length}
        </span>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const RECENTISH = 7 * 24 * 60 * 60 * 1000;

export function ProgramList({
  workspaceId,
  initialPrograms,
  initialFolders,
  stats,
  canManage,
  searchQuery = "",
}: {
  workspaceId: string;
  initialPrograms: ProgramListItem[];
  initialFolders: FolderItem[];
  stats: ProgramStats;
  canManage: boolean;
  searchQuery?: string;
}) {
  const [programs, setPrograms] = useState(initialPrograms);
  const [folders, setFolders] = useState(initialFolders);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<"all" | "attention" | "edited" | "run" | "inactive">("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [movingProgramId, setMovingProgramId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filter tab counts
  const now = Date.now();
  const recentCutoff = new Date(now - RECENTISH).toISOString();
  const counts = {
    attention: programs.filter((p) => (stats[p.id]?.failed ?? 0) > 0).length,
    edited: programs.filter((p) => p.updated_at > recentCutoff).length,
    run: programs.filter((p) => p.last_run_at && p.last_run_at > recentCutoff).length,
    inactive: programs.filter((p) => !p.is_active).length,
    all: programs.length,
  };

  // Apply search + filter
  const visible = programs.filter((p) => {
    if (searchQuery) {
      const hay = [p.name, p.description, p.execution_mode].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(searchQuery.toLowerCase())) return false;
    }
    if (activeFilter === "attention") return (stats[p.id]?.failed ?? 0) > 0;
    if (activeFilter === "edited") return p.updated_at > recentCutoff;
    if (activeFilter === "run") return p.last_run_at != null && p.last_run_at > recentCutoff;
    if (activeFilter === "inactive") return !p.is_active;
    return true;
  });

  // Group by folder
  const byFolder = new Map<string | null, ProgramListItem[]>();
  byFolder.set(null, []);
  for (const f of folders) byFolder.set(f.id, []);
  for (const p of visible) {
    const key = p.folder_id && byFolder.has(p.folder_id) ? p.folder_id : null;
    byFolder.get(key)!.push(p);
  }

  function toggleCollapse(id: string) {
    setCollapsed((c) => {
      const next = new Set(c);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name || busy) return;
    setBusy(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json().catch(() => null)) as { folder?: FolderItem } | null;
    if (res.ok && data?.folder) {
      setFolders((fs) => [...fs, data.folder!]);
      setNewFolderName("");
      setShowNewFolder(false);
    }
    setBusy(false);
  }

  async function renameFolder(id: string) {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    const res = await fetch(`/api/workspaces/${workspaceId}/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) setFolders((fs) => fs.map((f) => f.id === id ? { ...f, name } : f));
    setRenamingId(null);
  }

  async function deleteFolder(id: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/folders/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFolders((fs) => fs.filter((f) => f.id !== id));
      setPrograms((ps) => ps.map((p) => p.folder_id === id ? { ...p, folder_id: null } : p));
    }
  }

  async function moveProgram(programId: string, folderId: string | null) {
    const res = await fetch(`/api/programs/${programId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folderId }),
    });
    if (res.ok) setPrograms((ps) => ps.map((p) => p.id === programId ? { ...p, folder_id: folderId } : p));
    setMovingProgramId(null);
  }

  function ProgramRow({ p }: { p: ProgramListItem }) {
    const s = stats[p.id] ?? { total: 0, failed: 0, runSeries: [], providers: [] };
    const hasFailed = s.failed > 0;
    const bar = hasFailed
      ? "bg-red-500/60 group-hover:bg-red-500"
      : p.is_active
      ? "bg-green-500/60 group-hover:bg-green-500"
      : "bg-muted-foreground/20";

    return (
      <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/30">
        <div className={cn("h-8 w-1 shrink-0 rounded-full transition-colors", bar)} />

        <ConnectionBadges providers={s.providers ?? []} />

        <Link href={`/programs/${p.id}`} className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{p.name}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/60">
            v{p.schema_version} · {p.execution_mode}
          </p>
        </Link>

        <div className="hidden lg:block w-24 shrink-0 text-[11px] text-muted-foreground/70">
          {p.last_run_at ? timeAgo(p.last_run_at) : <span className="italic text-muted-foreground/40">never</span>}
        </div>

        <div className="hidden xl:flex w-20 shrink-0 items-center gap-2 text-[10px] text-muted-foreground/70">
          <RunSparkline values={s.runSeries ?? []} />
          <span>{s.runSeries?.reduce((total, value) => total + value, 0) ?? 0}</span>
        </div>

        <div className="hidden lg:flex w-24 shrink-0">
          {hasFailed ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
              {s.failed} failed
            </span>
          ) : p.is_active ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600">
              Healthy
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Inactive
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {movingProgramId === p.id ? (
            <select
              autoFocus
              defaultValue={p.folder_id ?? ""}
              onBlur={() => setMovingProgramId(null)}
              onChange={(e) => void moveProgram(p.id, e.target.value || null)}
              className="rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          ) : (
            folders.length > 0 && (
              <button
                type="button"
                onClick={() => setMovingProgramId(p.id)}
                title="Move to folder"
                className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground transition-colors"
              >
                <Folder className="h-3 w-3" />
              </button>
            )
          )}
          <DeleteProgramButton
            programId={p.id}
            programName={p.name}
            onDeleted={() => setPrograms((ps) => ps.filter((q) => q.id !== p.id))}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filter tabs + new folder button */}
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {counts.attention > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter(activeFilter === "attention" ? "all" : "attention")}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeFilter === "attention"
                  ? "bg-red-500/20 text-red-600"
                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Needs attention {counts.attention}
            </button>
          )}
          {(["edited", "run", "inactive", "all"] as const).map((f) => {
            const label = f === "edited" ? `Recently edited ${counts.edited}` : f === "run" ? `Recently run ${counts.run}` : f === "inactive" ? `Inactive ${counts.inactive}` : `All ${counts.all}`;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                  activeFilter === f
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowNewFolder((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" />
            New folder
          </button>
        )}
      </div>

      {/* Inline new folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-2 border-b border-border/40 bg-accent/10 px-4 py-2">
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createFolder();
              if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
            }}
            placeholder="Folder name…"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={busy || !newFolderName.trim()}
            onClick={() => void createFolder()}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Column headers */}
      {visible.length > 0 && (
        <div className="hidden lg:grid grid-cols-[56px_1fr_96px_80px_96px_32px] gap-3 border-b border-border/40 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
          <span />
          <span>Program</span>
          <span>Last run</span>
          <span>Runs / wk</span>
          <span>Status</span>
          <span />
        </div>
      )}

      {/* Folder sections */}
      {folders.map((folder) => {
        const folderPrograms = byFolder.get(folder.id) ?? [];
        const isCollapsed = collapsed.has(folder.id);
        const color = folder.color ?? "#6366f1";

        return (
          <div key={folder.id}>
            <div className="group flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-1.5 hover:bg-accent/20">
              <button
                type="button"
                onClick={() => toggleCollapse(folder.id)}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                  : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/40" />}
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                {renamingId === folder.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void renameFolder(folder.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => void renameFolder(folder.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 rounded border border-primary bg-background px-1.5 py-0.5 text-xs outline-none"
                  />
                ) : (
                  <span className="truncate text-xs font-semibold">{folder.name}</span>
                )}
                <span className="shrink-0 text-[10px] text-muted-foreground/40">{folderPrograms.length}</span>
              </button>

              {canManage && (
                <div className="hidden group-hover:flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name); }}
                    className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteFolder(folder.id)}
                    className="rounded p-1 text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <div className="divide-y divide-border/40">
                {folderPrograms.length === 0
                  ? <p className="px-10 py-3 text-xs italic text-muted-foreground/40">Empty folder.</p>
                  : folderPrograms.map((p) => <ProgramRow key={p.id} p={p} />)}
              </div>
            )}
          </div>
        );
      })}

      {/* Unfiled section */}
      {(() => {
        const unfiled = byFolder.get(null) ?? [];
        const showHeader = folders.length > 0;
        if (unfiled.length === 0 && !showHeader) return null;
        return (
          <div>
            {showHeader && (
              <div className="flex items-center gap-2 border-b border-border/40 bg-muted/10 px-3 py-1.5">
                <Folder className="h-3 w-3 text-muted-foreground/30" />
                <span className="text-xs font-semibold text-muted-foreground/50">Unfiled</span>
                <span className="text-[10px] text-muted-foreground/30">{unfiled.length}</span>
              </div>
            )}
            <div className="divide-y divide-border/40">
              {unfiled.map((p) => <ProgramRow key={p.id} p={p} />)}
            </div>
          </div>
        );
      })()}

      {visible.length === 0 && (
        <div className="p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {searchQuery || activeFilter !== "all" ? "No programs match." : "No programs yet."}
          </p>
        </div>
      )}
    </div>
  );
}
