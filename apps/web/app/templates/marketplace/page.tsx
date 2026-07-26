"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TemplateCard, type Difficulty } from "@/components/templates/TemplateCard";
import { TemplateDetailModal } from "@/components/templates/TemplateDetailModal";
import {
  CURATED_TEMPLATES,
  TEMPLATE_CATEGORIES,
  CATEGORY_LABELS,
  DIFFICULTY_LABEL,
} from "@/lib/templates/template-data";

type ApiTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  estimated_runtime: string;
  required_connections: string[];
  tags: string[];
  genesis_prompt: string;
  program_json: Record<string, unknown> | null;
  thumbnail_url: string | null;
  is_public: boolean;
  created_at: string;
  fork_count?: number;
};

const DIFFICULTY_FILTERS = ["all", "easy", "medium", "hard"] as const;

type SortOption = "newest" | "oldest" | "name" | "popular";

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest First",
  oldest: "Oldest First",
  name: "Name A–Z",
  popular: "Most Popular",
};

type ViewMode = "grid" | "list";

export default function TemplateMarketplacePage() {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeDifficulty, setActiveDifficulty] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedTemplate, setSelectedTemplate] = useState<ApiTemplate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeCategory !== "all") params.set("category", activeCategory);
    if (search.trim()) params.set("search", search.trim());

    setLoading(true);
    fetch(`/api/templates?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load templates");
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
  }, [activeCategory, search]);

  // Merge curated templates with DB templates (deduplicate by id)
  const allTemplates = useMemo(() => {
    const curatedMap = new Map(CURATED_TEMPLATES.map((t) => [t.id, t]));
    const dbTemplates: ApiTemplate[] = [];

    for (const tpl of templates) {
      if (curatedMap.has(tpl.id)) {
        curatedMap.delete(tpl.id); // DB takes precedence
      }
      dbTemplates.push(tpl);
    }

    const enrichedCurated = [...curatedMap.values()].map((t) => ({
      ...t,
      difficulty: t.difficulty,
      genesis_prompt: "",
      program_json: null,
      thumbnail_url: null,
      is_public: true,
      created_at: new Date().toISOString(),
      fork_count: 0,
    }));

    return [...enrichedCurated, ...dbTemplates];
  }, [templates]);

  // Apply filters + sort
  const filteredTemplates = useMemo(() => {
    let result = allTemplates;
    if (activeDifficulty !== "all") {
      result = result.filter((t) => t.difficulty === activeDifficulty);
    }

    const sorted = [...result];
    switch (sortBy) {
      case "newest":
        sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "popular":
        sorted.sort((a, b) => (b.fork_count ?? 0) - (a.fork_count ?? 0));
        break;
    }

    return sorted;
  }, [allTemplates, activeDifficulty, sortBy]);

  const handlePreview = useCallback((template: ApiTemplate) => {
    setSelectedTemplate(template);
    setDetailOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setTimeout(() => setSelectedTemplate(null), 200);
  }, []);

  // Unique connectors across all templates for display
  const allConnectors = useMemo(() => {
    const connectorSet = new Set<string>();
    for (const tpl of filteredTemplates) {
      for (const conn of tpl.required_connections) {
        connectorSet.add(conn);
      }
    }
    return [...connectorSet].sort();
  }, [filteredTemplates]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Template Marketplace</h1>
          <p className="text-muted-foreground">
            Browse curated workflow templates — preview, customize, and deploy in one click.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/library">
            <Button variant="outline" size="sm">
              ← Back to Gallery
            </Button>
          </Link>
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("grid")}
          >
            <span className="mr-1">⊞</span> Grid
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <span className="mr-1">☰</span> List
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search templates by name, description, or connector…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty + Sort Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {DIFFICULTY_FILTERS.map((diff) => (
            <button
              key={diff}
              onClick={() => setActiveDifficulty(diff)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeDifficulty === diff
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {diff === "all"
                ? "All Levels"
                : `${diff === "easy" ? "🟢" : diff === "medium" ? "🟡" : "🔴"} ${DIFFICULTY_LABEL[diff as Difficulty]}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Connector Tags */}
      {allConnectors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">Connectors:</span>
          {allConnectors.slice(0, 12).map((conn) => (
            <Badge key={conn} variant="secondary" className="text-xs">
              {conn}
            </Badge>
          ))}
          {allConnectors.length > 12 && (
            <Badge variant="outline" className="text-xs">
              +{allConnectors.length - 12} more
            </Badge>
          )}
        </div>
      )}

      {/* Results */}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div
          className={`gap-4 ${
            viewMode === "grid" ? "grid md:grid-cols-2 lg:grid-cols-3" : "flex flex-col"
          }`}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={`animate-pulse rounded-lg border bg-muted/50 ${
                viewMode === "grid" ? "h-48" : "h-24"
              }`}
            />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-muted-foreground">No templates found matching your filters.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={{
                id: tpl.id,
                name: tpl.name,
                description: tpl.description,
                category: tpl.category,
                difficulty: (tpl.difficulty as Difficulty) || "easy",
                estimated_runtime: tpl.estimated_runtime || "~ 2 Min",
                required_connections: tpl.required_connections || [],
                tags: tpl.tags || [],
              }}
              onPreview={() => handlePreview(tpl)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredTemplates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={{
                id: tpl.id,
                name: tpl.name,
                description: tpl.description,
                category: tpl.category,
                difficulty: (tpl.difficulty as Difficulty) || "easy",
                estimated_runtime: tpl.estimated_runtime || "~ 2 Min",
                required_connections: tpl.required_connections || [],
                tags: tpl.tags || [],
              }}
              variant="list"
              onPreview={() => handlePreview(tpl)}
            />
          ))}
        </div>
      )}

      {/* Stats */}
      {!loading && filteredTemplates.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {filteredTemplates.length} template
          {filteredTemplates.length !== 1 ? "s" : ""} available
        </p>
      )}

      {/* Detail Modal */}
      <TemplateDetailModal
        template={selectedTemplate}
        open={detailOpen}
        onClose={handleCloseDetail}
      />
    </div>
  );
}
