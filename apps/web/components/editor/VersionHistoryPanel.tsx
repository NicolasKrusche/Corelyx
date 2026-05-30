"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProgramSchema } from "@flowos/schema";
import { diffSchemas, getVersionSnapshot } from "@/lib/editor/diff";
import { VersionDiffOverlay } from "@/components/editor/VersionDiffOverlay";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
import { PanelResizeHandle } from "@/components/editor/PanelResizeHandle";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VersionRow {
  id: string;
  version: number;
  change_summary: string | null;
  created_at: string;
}

export interface VersionHistoryPanelProps {
  programId: string;
  currentVersion: number;
  onRollback: (schema: ProgramSchema) => void;
  onClose: () => void;
  /** When provided, enables the "Compare" diff button per version row. */
  currentSchema?: ProgramSchema;
  enableAdvancedEditor?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a relative-time string such as "2 hours ago" or "just now". */
function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

// ─── VersionHistoryPanel ──────────────────────────────────────────────────────

export function VersionHistoryPanel({
  programId,
  currentVersion,
  onRollback,
  onClose,
  currentSchema,
  enableAdvancedEditor = false,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [diffVersion, setDiffVersion] = useState<number | null>(null);

  // ── Fetch version list on mount ───────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchVersions() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/programs/${programId}/versions`);
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? "");
        }
        const json = (await res.json()) as { versions: VersionRow[] };
        if (!cancelled) setVersions(json.versions);
      } catch (err) {
        if (!cancelled)
          setError(friendlyErrorMessage(err instanceof Error ? err.message : null, "We could not load version history. Please try again."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchVersions();
    return () => {
      cancelled = true;
    };
  }, [programId]);

  // ── Rollback handler ──────────────────────────────────────────────────────

  const handleRestore = useCallback(
    async (version: number) => {
      setRestoringVersion(version);
      setError(null);
      try {
        const res = await fetch(`/api/programs/${programId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? "");
        }
        const json = (await res.json()) as {
          schema: ProgramSchema;
          program: { schema_version: number };
        };
        onRollback(json.schema);
        // Refresh the version list to show the new rollback snapshot
        const listRes = await fetch(`/api/programs/${programId}/versions`);
        if (listRes.ok) {
          const listJson = (await listRes.json()) as { versions: VersionRow[] };
          setVersions(listJson.versions);
        }
      } catch (err) {
        setError(friendlyErrorMessage(err instanceof Error ? err.message : null, "We could not restore that version. Please try again."));
      } finally {
        setRestoringVersion(null);
      }
    },
    [programId, onRollback]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "absolute top-0 right-0 h-full w-[360px] z-30",
        "bg-background border-l border-border shadow-xl",
        "flex flex-col"
      )}
    >
      <PanelResizeHandle edge="left" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ClockIcon />
          <span className="text-sm font-semibold text-foreground">Version History</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="Close version history"
        >
          <CloseIcon />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {!isLoading && error && (
          <div className="px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => {
                setError(null);
                setIsLoading(true);
                void fetch(`/api/programs/${programId}/versions`)
                  .then((r) => r.json() as Promise<{ versions: VersionRow[] }>)
                  .then(({ versions: v }) => setVersions(v))
                  .catch((err: unknown) =>
                    setError(friendlyErrorMessage(err instanceof Error ? err.message : null, "We could not load version history. Please try again."))
                  )
                  .finally(() => setIsLoading(false));
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && versions.length === 0 && (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No versions saved yet.
          </div>
        )}

        {!isLoading && !error && versions.length > 0 && (
          <ul className="divide-y divide-border">
            {versions.map((v) => {
              // The versions list is fetched from the DB ordered by version DESC,
              // so versions[0] is always the latest saved snapshot. Use that as
              // the source of truth rather than the schema-embedded version_history
              // (which uses a separate numbering system and goes stale after rollbacks).
              const isCurrent = v.version === versions[0].version;
              const isGenesis = v.version === 0;
              const isRestoring = restoringVersion === v.version;

              return (
                <li
                  key={v.id}
                  className={cn(
                    "flex items-start justify-between gap-3 px-4 py-3",
                    isCurrent && "bg-muted/50"
                  )}
                >
                  {/* Left: version info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isGenesis ? (
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                          v0 — Genesis (original)
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-foreground">
                          v{v.version}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 rounded px-1.5 py-0.5 shrink-0">
                          current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {v.change_summary ?? "No description"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {relativeTime(v.created_at)}
                    </p>
                  </div>

                  {/* Right: action buttons */}
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <Button
                      variant={isGenesis ? "outline" : "ghost"}
                      size="sm"
                      disabled={isCurrent || isRestoring}
                      onClick={() => void handleRestore(v.version)}
                      className={cn(
                        "text-xs",
                        isGenesis &&
                          "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                      )}
                    >
                      {isRestoring
                        ? "Restoring…"
                        : isGenesis
                        ? "↩ Reset to genesis"
                        : "Restore"}
                    </Button>
                    {enableAdvancedEditor && currentSchema && !isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDiffVersion(diffVersion === v.version ? null : v.version)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {diffVersion === v.version ? "Hide diff" : "Compare"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Version diff overlay */}
      {enableAdvancedEditor && currentSchema && diffVersion !== null && (() => {
        const snapshot = getVersionSnapshot(currentSchema, diffVersion);
        if (!snapshot) return null;
        const diff = diffSchemas(snapshot, { nodes: currentSchema.nodes, edges: currentSchema.edges });
        const vRow = versions.find((v) => v.version === diffVersion);
        const label = vRow ? `v${diffVersion}` : `v${diffVersion}`;
        return (
          <VersionDiffOverlay
            diff={diff}
            baseVersionLabel={label}
            onClose={() => setDiffVersion(null)}
          />
        );
      })()}

      {/* Footer error (after initial load) */}
      {restoringVersion === null && error && versions.length > 0 && (
        <div className="px-4 py-2 border-t border-border shrink-0">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

// ─── Inline icons ─────────────────────────────────────────────────────────────

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-3.5 w-3.5 text-muted-foreground"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className="h-3.5 w-3.5"
    >
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}
