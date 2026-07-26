"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DIFFICULTY_EMOJI,
  DIFFICULTY_LABEL,
  type Difficulty,
} from "@/lib/templates/template-data";

type MyTemplate = {
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
  created_at: string;
  updated_at: string;
  fork_count: number;
};

type FilterStatus = "all" | "pending" | "approved" | "rejected";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" }
> = {
  pending: { label: "Pending Review", variant: "warning" },
  approved: { label: "Published", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

export function MyTemplates() {
  const router = useRouter();
  const [templates, setTemplates] = useState<MyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);

    fetch(`/api/templates/my?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load your templates");
        return r.json();
      })
      .then((data) => {
        setTemplates(data.templates ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [filterStatus]);

  async function handleDelete(templateId: string) {
    if (!confirm("Are you sure you want to delete this template?")) return;
    setDeletingId(templateId);
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setDeletingId(null);
    }
  }

  const statusFilters: { value: FilterStatus; label: string; count?: number }[] = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Published" },
    { value: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">My Templates</h2>
          <p className="text-sm text-muted-foreground">
            Templates you&apos;ve created. Published templates appear in the marketplace.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/templates")}
        >
          Browse Marketplace
        </Button>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            {filterStatus === "all"
              ? "You haven't created any templates yet."
              : `No ${filterStatus} templates.`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use &quot;Save as Template&quot; from any run to create your first template.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                      STATUS_CONFIG[tpl.status]?.variant ?? "secondary"
                    }
                  >
                    {STATUS_CONFIG[tpl.status]?.label ?? tpl.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {tpl.description || "No description"}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {(tpl.required_connections || [])
                    .slice(0, 3)
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

                <p className="text-xs text-muted-foreground">
                  Created{" "}
                  {new Date(tpl.created_at).toLocaleDateString()}
                </p>
              </CardContent>

              <div className="border-t px-4 py-3 flex items-center justify-between">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/templates`)}
                  >
                    View
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(tpl.id)}
                  disabled={deletingId === tpl.id}
                >
                  {deletingId === tpl.id ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Stats */}
      {!loading && templates.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {templates.length} template{templates.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
