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
};

type FilterStatus = "all" | "pending" | "approved" | "rejected";

export function AdminTemplatesClient() {
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      // Filter by status client-side since the API returns all templates
      let filtered = data.templates ?? [];
      if (filterStatus !== "all") {
        filtered = filtered.filter(
          (t: AdminTemplate) => t.status === filterStatus
        );
      }
      setTemplates(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  async function handleApprove(templateId: string) {
    setActionLoading(templateId);
    try {
      const res = await fetch(`/api/templates/${templateId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (res.ok) {
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === templateId ? { ...t, status: "approved" } : t
          )
        );
      }
    } catch {
      // Silently fail
    } finally {
      setActionLoading(null);
    }
  }

  function openRejectModal(templateId: string, templateName: string) {
    setRejectModal({ templateId, templateName });
    setRejectReason("");
  }

  async function handleReject() {
    if (!rejectModal) return;
    setActionLoading(rejectModal.templateId);
    try {
      const res = await fetch(`/api/templates/${rejectModal.templateId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          rejection_reason: rejectReason.trim() || undefined,
        }),
      });
      if (res.ok) {
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === rejectModal.templateId
              ? { ...t, status: "rejected", rejection_reason: rejectReason.trim() || null }
              : t
          )
        );
      }
    } catch {
      // Silently fail
    } finally {
      setActionLoading(null);
      setRejectModal(null);
      setRejectReason("");
    }
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
                  by {tpl.created_by.slice(0, 8)}… •{" "}
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

                {/* Genesis prompt preview */}
                {tpl.description && (
                  <div className="rounded-md bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground line-clamp-2 font-mono">
                      {tpl.description}
                    </p>
                  </div>
                )}

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
