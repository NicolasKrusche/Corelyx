"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type Difficulty,
  DIFFICULTY_EMOJI,
  DIFFICULTY_LABEL,
} from "@/lib/templates/template-data";

export type { Difficulty };

type Template = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  estimated_runtime: string;
  required_connections: string[];
  tags: string[];
};

type TemplateCardProps = {
  template: Template;
  variant?: "grid" | "list";
  onPreview?: () => void;
};

const DIFFICULTY_STYLES: Record<Difficulty, "success" | "warning" | "destructive"> = {
  easy: "success",
  medium: "warning",
  hard: "destructive",
};

const CONNECTION_ICONS: Record<string, string> = {
  gmail: "📧",
  slack: "💬",
  github: "🐙",
  notion: "📝",
  sheets: "📊",
  http: "🌐",
  crm: "📋",
  invoice: "🧾",
  social: "📱",
  api: "🔗",
  linear: "📋",
  typeform: "📋",
  stripe: "💳",
  shopify: "🛒",
  hubspot: "📋",
  webhook: "🔗",
  rss: "📡",
  calendar: "📅",
  email: "📧",
};

export function TemplateCard({ template, variant = "grid", onPreview }: TemplateCardProps) {
  const router = useRouter();
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFork() {
    setForking(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${template.id}/fork`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to use template. Please try again.");
        setForking(false);
        return;
      }
      const data = await res.json();
      router.push(`/programs/${data.program.id}`);
    } catch {
      setError("Network error. Please try again.");
      setForking(false);
    }
  }

  // List variant - horizontal layout
  if (variant === "list") {
    return (
      <Card className="group relative flex flex-row items-center transition-shadow hover:shadow-md">
        <CardContent className="flex-1 p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {template.required_connections.slice(0, 3).map((conn) => (
                <span key={conn} className="text-lg" title={conn}>
                  {CONNECTION_ICONS[conn.toLowerCase()] ?? "⚙️"}
                </span>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold truncate">{template.name}</h3>
                <Badge variant={DIFFICULTY_STYLES[template.difficulty]} className="shrink-0">
                  {DIFFICULTY_EMOJI[template.difficulty]} {DIFFICULTY_LABEL[template.difficulty]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{template.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">⏱ {template.estimated_runtime}</span>
              <Button variant="ghost" size="sm" onClick={onPreview}>
                Preview
              </Button>
              <Button size="sm" onClick={handleFork} disabled={forking}>
                {forking ? "Cloning…" : "Use Template"}
              </Button>
            </div>
          </div>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  // Grid variant - card layout (default)
  return (
    <Card className="group relative flex flex-col transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{template.name}</CardTitle>
          <Badge variant={DIFFICULTY_STYLES[template.difficulty]}>
            {DIFFICULTY_EMOJI[template.difficulty]} {DIFFICULTY_LABEL[template.difficulty]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        <p className="text-sm text-muted-foreground">{template.description}</p>

        <div className="flex flex-wrap gap-1.5">
          {template.required_connections.map((conn) => (
            <span
              key={conn}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              <span>{CONNECTION_ICONS[conn.toLowerCase()] ?? "⚙️"}</span>
              {conn}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>⏱ {template.estimated_runtime}</span>
          <span className="capitalize">📂 {template.category}</span>
        </div>
      </CardContent>

      <CardFooter className="border-t pt-3">
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {template.tags.slice(0, 3).join(" · ")}
          </span>
          <div className="flex gap-2">
            {onPreview && (
              <Button variant="outline" size="sm" onClick={onPreview}>
                Preview
              </Button>
            )}
            <Button size="sm" onClick={handleFork} disabled={forking}>
              {forking ? "Cloning…" : "Use Template"}
            </Button>
          </div>
        </div>
        {error && (
          <p className="mt-2 w-full text-xs text-destructive">{error}</p>
        )}
      </CardFooter>
    </Card>
  );
}
