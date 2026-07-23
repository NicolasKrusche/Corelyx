"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { TemplateCard, type Difficulty } from "@/components/templates/TemplateCard";
import { OnboardingQuiz } from "@/components/templates/OnboardingQuiz";
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
  thumbnail_url: string | null;
  is_public: boolean;
  created_at: string;
};

const DIFFICULTY_FILTERS = ["all", "easy", "medium", "hard"] as const;

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeDifficulty, setActiveDifficulty] = useState<string>("all");
  const [showQuiz, setShowQuiz] = useState(true);

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
    }));

    return [...enrichedCurated, ...dbTemplates];
  }, [templates]);

  // Apply difficulty filter
  const filteredTemplates = useMemo(() => {
    if (activeDifficulty === "all") return allTemplates;
    return allTemplates.filter((t) => t.difficulty === activeDifficulty);
  }, [allTemplates, activeDifficulty]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-muted-foreground">
          Get started quickly with pre-built workflows — fork, customize, and run.
        </p>
      </div>

      {/* Onboarding Quiz */}
      {showQuiz && (
        <div className="relative">
          <OnboardingQuiz />
          <button
            onClick={() => setShowQuiz(false)}
            className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search + Category Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search templates…"
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

      {/* Difficulty Filter */}
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
            {diff === "all" ? "All Levels" : `${diff === "easy" ? "🟢" : diff === "medium" ? "🟡" : "🔴"} ${DIFFICULTY_LABEL[diff as Difficulty]}`}
          </button>
        ))}
      </div>

      {/* Results */}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg border bg-muted/50" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-muted-foreground">No templates found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((tpl) => {
            const enriched = {
              id: tpl.id,
              name: tpl.name,
              description: tpl.description,
              category: tpl.category,
              difficulty: (tpl.difficulty as Difficulty) || "easy",
              estimated_runtime: tpl.estimated_runtime || "~ 2 Min",
              required_connections: tpl.required_connections || [],
              tags: tpl.tags || [],
            };
            return <TemplateCard key={tpl.id} template={enriched} />;
          })}
        </div>
      )}

      {/* Stats */}
      {!loading && filteredTemplates.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""} available
        </p>
      )}
    </div>
  );
}
