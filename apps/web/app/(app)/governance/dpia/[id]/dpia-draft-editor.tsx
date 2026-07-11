"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileDown,
  History,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import {
  MAX_DPIA_DRAFT_CHARACTERS,
  getDpiaCompletionBlockers,
  isDpiaDraftStale,
  type DpiaDraftRecord,
} from "@/lib/compliance/dpia-drafts";
import { cn } from "@/lib/utils";

type PendingAction = "generate" | "save" | "complete" | "reopen" | null;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}

export function DpiaDraftEditor({
  programId,
  programName,
  schemaVersion,
  programUpdatedAt,
  currentUserId,
  canEdit,
  initialDrafts,
  initialTotalCount,
}: {
  programId: string;
  programName: string;
  schemaVersion: number | null;
  programUpdatedAt: string | null;
  currentUserId: string;
  canEdit: boolean;
  initialDrafts: DpiaDraftRecord[];
  initialTotalCount: number;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [selectedId, setSelectedId] = useState(initialDrafts[0]?.id ?? null);
  const selected = drafts.find((draft) => draft.id === selectedId) ?? null;
  const [content, setContent] = useState(selected?.content ?? "");
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const dirty = Boolean(selected && content !== selected.content);
  const stale = useMemo(
    () =>
      selected
        ? isDpiaDraftStale(selected, {
            schemaVersion,
            updatedAt: programUpdatedAt,
          })
        : false,
    [programUpdatedAt, schemaVersion, selected]
  );
  const completionBlockers = useMemo(
    () => getDpiaCompletionBlockers(content),
    [content]
  );

  function selectDraft(draft: DpiaDraftRecord) {
    if (dirty && !window.confirm("Discard your unsaved changes and open this revision?")) return;
    setSelectedId(draft.id);
    setContent(draft.content);
    setError(null);
  }

  async function createRevision(action: Exclude<PendingAction, null>) {
    if (pending) return;
    if (
      action !== "save" &&
      dirty &&
      !window.confirm("Create this revision and discard the unsaved changes in the editor?")
    ) {
      return;
    }
    if (
      action === "complete" &&
      !window.confirm(
        "Mark this DPIA review completed? This records you and the current time on a new, auditable status revision."
      )
    ) {
      return;
    }

    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/programs/${programId}/dpia-drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "generate"
            ? { action: "generate" }
            : action === "save"
              ? { action: "save", basedOnDraftId: selectedId, content }
              : { action, basedOnDraftId: selectedId }
        ),
      });
      const payload = (await response.json().catch(() => null)) as
        | { draft?: DpiaDraftRecord; error?: string }
        | null;
      if (!response.ok || !payload?.draft) {
        throw new Error(payload?.error || "The DPIA draft could not be saved.");
      }

      setDrafts((current) => [payload.draft!, ...current]);
      setTotalCount((current) => current + 1);
      setSelectedId(payload.draft.id);
      setContent(payload.draft.content);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The DPIA draft could not be saved.");
    } finally {
      setPending(null);
    }
  }

  async function loadOlderRevisions() {
    if (loadingOlder || drafts.length >= totalCount) return;
    setLoadingOlder(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/programs/${programId}/dpia-drafts?offset=${drafts.length}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => null)) as
        | { drafts?: DpiaDraftRecord[]; total?: number; error?: string }
        | null;
      if (!response.ok || !payload?.drafts) {
        throw new Error(payload?.error || "Older DPIA revisions could not be loaded.");
      }
      setDrafts((current) => {
        const known = new Set(current.map((draft) => draft.id));
        return [...current, ...payload.drafts!.filter((draft) => !known.has(draft.id))];
      });
      if (typeof payload.total === "number") setTotalCount(payload.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Older DPIA revisions could not be loaded.");
    } finally {
      setLoadingOlder(false);
    }
  }

  if (!selected) {
    return (
      <section className="rounded-xl border glass-panel p-8 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-4 text-lg font-semibold">No saved DPIA draft for this workflow</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Generate a working paper from {programName}&apos;s current purpose, data flow,
          providers, risks, and governance settings. The result will be saved only to this
          workflow and can then be reviewed and edited.
        </p>
        {canEdit ? (
          <button
            type="button"
            onClick={() => void createRevision("generate")}
            disabled={pending !== null}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending === "generate" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate and save first draft
          </button>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            An editor must create the first draft. You have read-only access.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
      </section>
    );
  }

  const downloadBase = `/api/programs/${programId}/compliance/export?draftId=${encodeURIComponent(
    selected.id
  )}&format=`;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0 rounded-xl border glass-panel">
        <div className="border-b border-border/50 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  {selected.review_status === "completed" ? "Review completed" : "Saved draft"}
                </span>
                {stale && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    Workflow changed since this revision
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {selected.source_kind === "generated"
                  ? "Generated"
                  : selected.source_kind === "edited"
                    ? "Edited and saved"
                    : selected.review_status === "completed"
                      ? "Marked completed"
                      : "Reopened for review"} on {formatTimestamp(selected.created_at)}
                {selected.reviewed_at
                  ? ` · Review recorded by ${
                      selected.reviewed_by === currentUserId
                        ? "you"
                        : selected.reviewed_by
                          ? `user ${selected.reviewed_by.slice(0, 8)}`
                          : "a deleted account"
                    } on ${formatTimestamp(selected.reviewed_at)}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`${downloadBase}dpia-md`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5" />
                Markdown
              </a>
              <a
                href={`${downloadBase}dpia-pdf`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
              >
                <FileDown className="h-3.5 w-3.5" />
                PDF
              </a>
              <a
                href={`${downloadBase}dpia-docx`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
              >
                <FileDown className="h-3.5 w-3.5" />
                Word
              </a>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
            This is an AI-assisted working paper generated from workflow evidence, not a completed
            legal assessment. Review the facts, risks, mitigations, and approvals with your privacy
            owner or DPO. Edits are saved as new revisions so earlier evidence remains available.
          </div>
          <label className="mt-4 block">
            <span className="text-xs font-semibold">Draft content</span>
            <textarea
              aria-label="DPIA draft content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              readOnly={!canEdit}
              maxLength={MAX_DPIA_DRAFT_CHARACTERS}
              spellCheck
              className={cn(
                "mt-2 min-h-[640px] w-full resize-y rounded-lg border border-input bg-background px-4 py-3 font-mono text-xs leading-6 outline-none focus:border-primary",
                !canEdit && "cursor-default opacity-90"
              )}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              {content.length.toLocaleString("en")} / {MAX_DPIA_DRAFT_CHARACTERS.toLocaleString("en")} characters
              {dirty ? " · Unsaved changes" : " · All changes saved"}
            </p>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void createRevision("generate")}
                  disabled={pending !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {pending === "generate" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Regenerate from workflow
                </button>
                <button
                  type="button"
                  onClick={() => void createRevision("save")}
                  disabled={!dirty || content.trim().length < 50 || pending !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {pending === "save" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save as new revision
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void createRevision(
                      selected.review_status === "completed" ? "reopen" : "complete"
                    )
                  }
                  disabled={
                    dirty ||
                    pending !== null ||
                    selected.id !== drafts[0]?.id ||
                    (selected.review_status !== "completed" &&
                      (stale || completionBlockers.length > 0))
                  }
                  title={
                    selected.id !== drafts[0]?.id
                      ? "Open or edit this revision into a new latest revision first."
                      : selected.review_status !== "completed" && stale
                        ? "Regenerate from the current workflow before completing review."
                        : undefined
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {pending === "complete" || pending === "reopen" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {selected.review_status === "completed"
                    ? "Reopen review"
                    : "Mark review completed"}
                </button>
              </div>
            )}
          </div>
          {canEdit && selected.review_status !== "completed" && completionBlockers.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:text-amber-200">
              <p className="font-semibold">Before marking this review completed:</p>
              <ul className="mt-1 list-disc pl-4">
                {completionBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
        </div>
      </section>

      <aside className="h-fit rounded-xl border glass-panel">
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Revision history</h2>
        </div>
        <div className="max-h-[720px] space-y-1 overflow-auto p-2">
          {drafts.map((draft, index) => {
            const revisionNumber = totalCount - index;
            return (
              <button
                key={draft.id}
                type="button"
                onClick={() => selectDraft(draft)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                  draft.id === selected.id
                    ? "border-primary/40 bg-primary/10"
                    : "border-transparent hover:border-border hover:bg-accent/50"
                )}
              >
                <span className="block text-xs font-semibold">Revision {revisionNumber}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {draft.source_kind === "generated"
                    ? "Generated"
                    : draft.source_kind === "edited"
                      ? "Edited"
                      : draft.review_status === "completed"
                        ? "Marked completed"
                        : "Reopened"} ·{" "}
                  {formatTimestamp(draft.created_at)}
                </span>
              </button>
            );
          })}
          {drafts.length < totalCount && (
            <button
              type="button"
              onClick={() => void loadOlderRevisions()}
              disabled={loadingOlder}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-60"
            >
              {loadingOlder && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Load older revisions ({totalCount - drafts.length})
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
