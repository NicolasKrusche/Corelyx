"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DIFFICULTY_EMOJI,
  DIFFICULTY_LABEL,
} from "@/lib/templates/template-data";

type TemplatePreviewData = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  estimated_runtime: string;
  required_connections: string[];
  tags: string[];
  genesis_prompt?: string;
  program_json?: Record<string, unknown> | null;
};

type NodeData = {
  id: string;
  type: string;
  label: string;
  description?: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
};

type TemplatePreviewProps = {
  template: TemplatePreviewData | null;
  open: boolean;
  onClose: () => void;
};

const NODE_TYPE_ICONS: Record<string, string> = {
  trigger: "⚡",
  connection: "🔌",
  step: "🔧",
  agent: "🤖",
};

const NODE_TYPE_LABELS: Record<string, string> = {
  trigger: "Trigger",
  connection: "Connector",
  step: "Logic Step",
  agent: "AI Agent",
};

export function TemplatePreview({ template, open, onClose }: TemplatePreviewProps) {
  const router = useRouter();
  const [using, setUsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !template) return null;

  // Extract nodes and edges from program_json for preview
  const programJson = template.program_json as Record<string, unknown> | null;
  const nodes = (programJson?.nodes ?? []) as NodeData[];
  const edges = (programJson?.edges ?? []) as { from: string; to: string }[];

  // Build a simple linear flow visualization
  const flowSteps = nodes.map((node, idx) => ({
    ...node,
    icon: NODE_TYPE_ICONS[node.type] ?? "📦",
    typeLabel: NODE_TYPE_LABELS[node.type] ?? node.type,
    isLast: idx === nodes.length - 1,
  }));

  async function handleUseTemplate() {
    setUsing(true);
    setError(null);

    // Early return if template is null (shouldn't happen due to guard above)
    const tplId = template?.id;
    if (!tplId) {
      setUsing(false);
      return;
    }

    try {
      // Try the "use" endpoint first (for Genesis pre-fill)
      const useRes = await fetch(`/api/templates/${tplId}/use`, {
        method: "POST",
      });

      if (useRes.ok) {
        const data = await useRes.json();
        if (data.redirect_url) {
          router.push(data.redirect_url);
          return;
        }
        if (data.program?.id) {
          router.push(`/programs/${data.program.id}`);
          return;
        }
      }

      // Fall back to the fork endpoint
      const forkRes = await fetch(`/api/templates/${tplId}/fork`, {
        method: "POST",
      });

      if (!forkRes.ok) {
        const errData = await forkRes.json().catch(() => ({}));
        setError(errData.error || "Failed to use template. Please try again.");
        setUsing(false);
        return;
      }

      const forkData = await forkRes.json();
      router.push(`/programs/${forkData.program.id}`);
    } catch {
      setError("Network error. Please try again.");
      setUsing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 p-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-semibold">{template.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={template.difficulty === "easy" ? "success" : template.difficulty === "medium" ? "warning" : "destructive"}>
                {DIFFICULTY_EMOJI[template.difficulty as keyof typeof DIFFICULTY_EMOJI]}{" "}
                {DIFFICULTY_LABEL[template.difficulty as keyof typeof DIFFICULTY_LABEL]}
              </Badge>
              <span className="text-xs text-muted-foreground">⏱ {template.estimated_runtime}</span>
              <span className="text-xs text-muted-foreground">📂 {template.category}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Description */}
          <p className="text-sm text-muted-foreground">{template.description}</p>

          {/* Connectors */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">Required Connectors</h3>
            <div className="flex flex-wrap gap-1.5">
              {template.required_connections.map((conn) => (
                <Badge key={conn} variant="secondary">
                  {conn}
                </Badge>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {template.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Workflow Preview */}
          {flowSteps.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Workflow Structure</h3>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-col gap-2">
                  {flowSteps.map((step, idx) => (
                    <div key={step.id} className="flex items-center gap-3">
                      {/* Step indicator */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-sm">
                        {idx + 1}
                      </div>

                      {/* Step content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{step.icon}</span>
                          <span className="text-sm font-medium truncate">{step.label}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {step.typeLabel}
                          </Badge>
                        </div>
                        {step.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {step.description}
                          </p>
                        )}
                      </div>

                      {/* Arrow */}
                      {!step.isLast && (
                        <div className="text-muted-foreground">↓</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Connection flow diagram */}
                <div className="mt-4 pt-3 border-t">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Data Flow</h4>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {nodes.map((node, idx) => (
                      <span key={node.id} className="flex items-center">
                        <span className="font-mono">{node.label.slice(0, 20)}</span>
                        {idx < nodes.length - 1 && <span className="mx-1">→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Genesis Prompt Preview */}
          {template.genesis_prompt && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Genesis Prompt</h3>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground font-mono line-clamp-3">
                  {template.genesis_prompt}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t bg-background/95 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Click &quot;Use Template&quot; to create a new program from this template.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleUseTemplate} disabled={using}>
                {using ? "Creating…" : "Use Template"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
