"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DIFFICULTY_EMOJI,
  DIFFICULTY_LABEL,
  type Difficulty,
} from "@/lib/templates/template-data";

type NodeData = {
  id: string;
  type: string;
  label: string;
  description?: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
};

type TemplateDetailData = {
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
  thumbnail_url?: string | null;
};

type TemplateDetailModalProps = {
  template: TemplateDetailData | null;
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

export function TemplateDetailModal({
  template,
  open,
  onClose,
}: TemplateDetailModalProps) {
  const router = useRouter();
  const [using, setUsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "genesis">("preview");

  if (!open || !template) return null;

  // Capture in local variable for TypeScript narrowing in closures
  const tpl = template;

  const programJson = tpl.program_json as Record<string, unknown> | null;
  const nodes = (programJson?.nodes ?? []) as NodeData[];
  const edges = (programJson?.edges ?? []) as { from: string; to: string }[];

  const flowSteps = nodes.map((node, idx) => ({
    ...node,
    icon: NODE_TYPE_ICONS[node.type] ?? "📦",
    typeLabel: NODE_TYPE_LABELS[node.type] ?? node.type,
    isLast: idx === nodes.length - 1,
  }));

  async function handleUseTemplate() {
    setUsing(true);
    setError(null);

    try {
      const useRes = await fetch(`/api/templates/${tpl.id}/use`, {
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

      // Fall back to fork
      const forkRes = await fetch(`/api/templates/${tpl.id}/fork`, {
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

  async function handleGenerateWithAI() {
    if (!tpl.genesis_prompt) return;
    setGenerating(true);
    setError(null);

    try {
      // Redirect to the new program page with the genesis prompt pre-filled
      router.push(
        `/programs/new?prompt=${encodeURIComponent(tpl.genesis_prompt)}`
      );
    } catch {
      setError("Failed to start AI generation.");
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle>{template.name}</DialogTitle>
              <DialogDescription className="mt-1">
                {template.description}
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge
              variant={
                template.difficulty === "easy"
                  ? "success"
                  : template.difficulty === "medium"
                    ? "warning"
                    : "destructive"
              }
            >
              {DIFFICULTY_EMOJI[template.difficulty as Difficulty]}{" "}
              {DIFFICULTY_LABEL[template.difficulty as Difficulty]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              ⏱ {template.estimated_runtime}
            </span>
            <span className="text-xs text-muted-foreground">
              📂 {template.category}
            </span>
          </div>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setActiveTab("preview")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "preview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📋 Workflow Preview
          </button>
          {template.genesis_prompt && (
            <button
              onClick={() => setActiveTab("genesis")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "genesis"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🤖 AI Generation Prompt
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* Connectors */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              Required Connectors
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {template.required_connections.map((conn) => (
                <Badge key={conn} variant="secondary">
                  {conn}
                </Badge>
              ))}
            </div>
          </div>

          {/* Tags */}
          {template.tags && template.tags.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {template.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Workflow Preview Tab */}
          {activeTab === "preview" && flowSteps.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                Workflow Structure ({nodes.length} nodes, {edges.length}{" "}
                connections)
              </h3>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-col gap-2">
                  {flowSteps.map((step, idx) => (
                    <div key={step.id} className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-sm">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{step.icon}</span>
                          <span className="text-sm font-medium truncate">
                            {step.label}
                          </span>
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
                      {!step.isLast && (
                        <div className="text-muted-foreground">↓</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Data flow diagram */}
                <div className="mt-4 pt-3 border-t">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    Data Flow
                  </h4>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {nodes.map((node, idx) => (
                      <span key={node.id} className="flex items-center">
                        <span className="font-mono">
                          {node.label.slice(0, 20)}
                        </span>
                        {idx < nodes.length - 1 && (
                          <span className="mx-1">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Genesis Prompt Tab */}
          {activeTab === "genesis" && template.genesis_prompt && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                AI Generation Prompt
              </h3>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground font-mono whitespace-pre-wrap">
                  {template.genesis_prompt}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                This prompt can be used to generate a fresh workflow via Genesis
                AI. The AI will create a new program based on this description
                using your connected accounts.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <p className="text-xs text-muted-foreground flex-1">
            Use the pre-built schema or let AI generate a fresh version.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {template.genesis_prompt && (
              <Button
                variant="outline"
                onClick={handleGenerateWithAI}
                disabled={generating}
              >
                {generating ? "Starting…" : "🤖 Generate with AI"}
              </Button>
            )}
            <Button onClick={handleUseTemplate} disabled={using}>
              {using ? "Creating…" : "Use Template"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
