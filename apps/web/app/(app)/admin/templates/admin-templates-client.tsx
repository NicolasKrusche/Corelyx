"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DIFFICULTY_EMOJI,
  DIFFICULTY_LABEL,
  type Difficulty,
} from "@/lib/templates/template-data";

type ProgramJson = {
  nodes?: Array<{ id?: string; type?: string; data?: Record<string, unknown> }>;
  edges?: Array<unknown>;
};

type AdminTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  estimated_runtime: string;
  required_connections: string[];
  tags: string[];
  thumbnail_url: string | null;
  is_public: boolean;
  status: string;
  rejection_reason: string | null;
  created_by: string;
  created_at: string;
  fork_count: number;
  // Both are returned by GET /api/templates and were previously declared
  // nowhere, so the review UI rendered the description twice under a "Genesis
  // prompt preview" label and never showed the workflow at all.
  genesis_prompt: string | null;
  program_json: ProgramJson | null;
  // Attached by GET /api/templates for admin callers only.
  creator_name?: string | null;
  creator_username?: string | null;
};

/** Who submitted this, falling back to a short id when the profile has no name. */
function creatorLabel(tpl: AdminTemplate): string {
  if (tpl.creator_name?.trim()) {
    return tpl.creator_username?.trim()
      ? `${tpl.creator_name.trim()} (@${tpl.creator_username.trim()})`
      : tpl.creator_name.trim();
  }
  if (tpl.creator_username?.trim()) return `@${tpl.creator_username.trim()}`;
  return `${tpl.created_by.slice(0, 8)}…`;
}

/** Node types + counts, so a reviewer can see what a template actually does. */
function summarizeProgram(program: ProgramJson | null): {
  nodeCount: number;
  edgeCount: number;
  types: Array<{ type: string; count: number }>;
} {
  const nodes = Array.isArray(program?.nodes) ? program.nodes : [];
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const type = typeof node?.type === "string" && node.type ? node.type : "unknown";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return {
    nodeCount: nodes.length,
    edgeCount: Array.isArray(program?.edges) ? program.edges.length : 0,
    types: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}

type FilterStatus = "all" | "pending" | "approved" | "rejected";

export function AdminTemplatesClient() {
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    templateId: string;
    templateName: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);

    try {
      const res = await fetch(`/api/templates?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
      const data = await res.json();
      // The API applies ?status server-side; no client-side re-filter needed.
      setTemplates(data.templates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  /**
   * Both review actions previously swallowed every failure — `catch {}` with no
   * error state, and an `if (res.ok)` with no else. A 403 or 500 left the card
   * unchanged with no message, which is indistinguishable from the click not
   * registering. Surface it instead.
   */
  async function submitReview(
    templateId: string,
    body: { action: "approve" | "reject"; rejection_reason?: string }
  ): Promise<boolean> {
    setActionError(null);
    setActionLoading(templateId);
    try {
      const res = await fetch(`/api/templates/${templateId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res
          .json()
          .then((d: { error?: string }) => d.error)
          .catch(() => null);
        setActionError(
          `Failed to ${body.action} template (${res.status})${detail ? `: ${detail}` : ""}`
        );
        return false;
      }
      return true;
    } catch (err) {
      setActionError(
        `Failed to ${body.action} template: ${err instanceof Error ? err.message : "network error"}`
      );
      return false;
    } finally {
      setActionLoading(null);
    }
  }

  async function handleApprove(templateId: string) {
    const ok = await submitReview(templateId, { action: "approve" });
    if (!ok) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, status: "approved" } : t))
    );
  }

  function openRejectModal(templateId: string, templateName: string) {
    setRejectModal({ templateId, templateName });
    setRejectReason("");
  }

  async function handleReject() {
    if (!rejectModal) return;
    const { templateId } = rejectModal;
    const reason = rejectReason.trim();
    const ok = await submitReview(templateId, {
      action: "reject",
      rejection_reason: reason || undefined,
    });
    // Keep the modal open on failure so the typed reason is not lost.
    if (!ok) return;
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === templateId
          ? { ...t, status: "rejected", rejection_reason: reason || null }
          : t
      )
    );
    setRejectModal(null);
    setRejectReason("");
  }

  const statusFilters: { value: FilterStatus; label: string }[] = [
    { value: "pending", label: "Pending Review" },
    { value: "all", label: "All" },
    { value: "approved", label: "Published" },
    { value: "rejected", label: "Rejected" },
  ];

  const pendingCount = templates.filter((t) => t.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Template Review Queue</h1>
          <p className="text-sm text-muted-foreground">
            Review and approve user-submitted templates for the marketplace.
          </p>
        </div>
        {filterStatus === "pending" && pendingCount > 0 && (
          <Badge variant="warning">
            {pendingCount} pending
          </Badge>
        )}
      </div>

      {/* Status Filters */}
      <div className="flex gap-1.5">
        {statusFilters.map((sf) => (
          <button
            key={sf.value}
            onClick={() => setFilterStatus(sf.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === sf.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 text-xs underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg border bg-muted/50"
            />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            {filterStatus === "pending"
              ? "No templates pending review. 🎉"
              : "No templates found."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((tpl) => (
            <Card
              key={tpl.id}
              className="group relative flex flex-col transition-shadow hover:shadow-md"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">
                    {tpl.name}
                  </CardTitle>
                  <Badge
                    variant={
                      tpl.status === "pending"
                        ? "warning"
                        : tpl.status === "approved"
                          ? "success"
                          : "destructive"
                    }
                  >
                    {tpl.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  by <span className="text-foreground/80">{creatorLabel(tpl)}</span> •{" "}
                  {new Date(tpl.created_at).toLocaleDateString()}
                </p>
              </CardHeader>

              <CardContent className="flex-1 space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {tpl.description || "No description"}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {(tpl.required_connections || [])
                    .slice(0, 4)
                    .map((conn) => (
                      <Badge key={conn} variant="secondary" className="text-xs">
                        {conn}
                      </Badge>
                    ))}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {DIFFICULTY_EMOJI[tpl.difficulty as Difficulty] ?? "🟢"}{" "}
                    {DIFFICULTY_LABEL[tpl.difficulty as Difficulty] ?? tpl.difficulty}
                  </span>
                  <span>📂 {tpl.category}</span>
                  {tpl.fork_count > 0 && (
                    <span>🍴 {tpl.fork_count} forks</span>
                  )}
                </div>

                {/* What this template actually does — the point of a review
                    queue. Previously this block re-rendered `description` under
                    a "Genesis prompt preview" label, so a reviewer approved
                    workflows having never seen one. */}
                {(() => {
                  const summary = summarizeProgram(tpl.program_json);
                  const isOpen = expandedId === tpl.id;
                  return (
                    <div className="rounded-md border border-border/60 bg-muted/20">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : tpl.id)}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
                      >
                        <span className="text-xs font-medium">
                          {summary.nodeCount > 0
                            ? `Workflow — ${summary.nodeCount} node${summary.nodeCount === 1 ? "" : "s"}, ${summary.edgeCount} edge${summary.edgeCount === 1 ? "" : "s"}`
                            : "Workflow — empty or missing"}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {isOpen ? "Hide" : "Inspect"}
                        </span>
                      </button>

                      {summary.types.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-2.5 pb-2">
                          {summary.types.map(({ type, count }) => (
                            <Badge key={type} variant="outline" className="text-[10px]">
                              {type}
                              {count > 1 ? ` ×${count}` : ""}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {isOpen && (
                        <div className="space-y-2 border-t border-border/60 px-2.5 py-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Genesis prompt
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                              {tpl.genesis_prompt?.trim() || "— none —"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              program_json
                            </p>
                            <pre className="mt-0.5 max-h-64 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px] leading-relaxed">
                              {JSON.stringify(tpl.program_json ?? {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {tpl.status === "rejected" && tpl.rejection_reason && (
                  <div className="rounded-md bg-destructive/5 border border-destructive/20 p-2">
                    <p className="text-xs font-medium text-destructive">
                      Rejection reason:
                    </p>
                    <p className="text-xs text-destructive/80">
                      {tpl.rejection_reason}
                    </p>
                  </div>
                )}
              </CardContent>

              {/* Action buttons */}
              {tpl.status === "pending" && (
                <div className="border-t px-4 py-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(tpl.id)}
                    disabled={actionLoading === tpl.id}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {actionLoading === tpl.id ? "…" : "✓ Approve"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => openRejectModal(tpl.id, tpl.name)}
                    disabled={actionLoading === tpl.id}
                  >
                    ✕ Reject
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border border-border shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Reject Template</h2>
            <p className="text-sm text-muted-foreground">
              Rejecting{" "}
              <span className="font-medium text-foreground">
                {rejectModal.templateName}
              </span>
              . Optionally provide a reason to help the creator understand.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={actionLoading === rejectModal.templateId}
              >
                {actionLoading === rejectModal.templateId
                  ? "Rejecting…"
                  : "Reject Template"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
