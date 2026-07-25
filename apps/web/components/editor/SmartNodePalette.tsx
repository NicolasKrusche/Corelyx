"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PROVIDER_ICON_URL } from "@/lib/provider-icons";
import { PanelResizeHandle } from "@/components/editor/PanelResizeHandle";
import type { Node as SchemaNode } from "@flowos/schema";
import {
  PALETTE_NODES,
  CATEGORY_META,
  compatibilityScore,
  type NodeCategory,
  type PaletteNodeEntry,
  type PortType,
} from "@/lib/editor/node-palette-data";
import type { NodeVariant } from "@/components/editor/NodePalettePanel";

// Re-use the variant type from NodePalettePanel so callers don't need to change
// their existing handleAddNode / handlePaletteDragStart callbacks.

// ─── Lucide icon mapping ─────────────────────────────────────────────────────
// We use a small subset of lucide-react icons that match our palette entries.
// Using dynamic imports to keep the bundle small; fall back to a generic icon.

import {
  Play,
  Clock,
  Globe,
  Zap,
  GitBranch,
  FolderSearch,
  BrainCircuit,
  Shuffle,
  Filter,
  GitFork,
  Repeat,
  Timer,
  AlignLeft,
  Braces,
  Unlink,
  ArrowUpDown,
  FileText,
  Mail,
  MessageSquare,
  BookOpen,
  Github,
  Table,
  CalendarDays,
  HardDrive,
  Database,
  Contact,
  ClipboardList,
  ListTodo,
  ShoppingBag,
  Video,
  Bug,
  Ticket,
  Cloud,
  CalendarCheck,
  Search,
  X,
  Sparkles,
  ArrowRight,
  Headphones,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Play,
  Clock,
  Globe,
  Zap,
  GitBranch,
  FolderSearch,
  BrainCircuit,
  Shuffle,
  Filter,
  GitFork,
  Repeat,
  Timer,
  AlignLeft,
  Braces,
  Unlink,
  ArrowUpDown,
  FileText,
  Mail,
  MessageSquare,
  BookOpen,
  Github,
  Table,
  CalendarDays,
  HardDrive,
  Database,
  Contact,
  ClipboardList,
  ListTodo,
  ShoppingBag,
  Video,
  Bug,
  Ticket,
  Cloud,
  CalendarCheck,
  Headphones,
  CreditCard,
};

function PaletteIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICON_MAP[icon];
  if (Icon) return <Icon className={className} />;
  // Fallback: first two letters of the icon name
  return (
    <span
      className={cn(
        "inline-flex h-3.5 w-3.5 items-center justify-center rounded text-[7px] font-bold bg-current/20",
        className,
      )}
    >
      {icon.slice(0, 2)}
    </span>
  );
}

// ─── Provider icon (reuses the same pattern as NodePalettePanel) ─────────────

function ProviderIcon({ provider }: { provider: string }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const iconUrl = PROVIDER_ICON_URL[provider];

  if (!iconUrl || imageFailed) {
    return (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded text-[7px] font-bold bg-current/20">
        {provider.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt=""
      className="h-4 w-4 object-contain"
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  );
}

// ─── Helper: derive output port types from a schema node ─────────────────────

function getNodeOutputTypes(node: SchemaNode): PortType[] {
  const type = node.type;
  const cfg = node.config as Record<string, unknown>;

  if (type === "trigger") {
    const hasData = cfg.trigger_type === "webhook" || cfg.trigger_type === "event" || cfg.trigger_type === "program_output";
    return hasData ? ["trigger", "data"] : ["trigger"];
  }

  if (type === "agent") return ["data", "text"];
  if (type === "note" || type === "group") return [];

  // step
  if (type === "step") {
    const logicType = cfg.logic_type as string | undefined;
    switch (logicType) {
      case "transform": return ["data"];
      case "filter":    return ["any"];
      case "branch":    return ["any", "signal"];
      case "loop":      return ["data", "signal"];
      case "delay":     return ["any", "signal"];
      case "format":    return ["text"];
      case "parse":     return ["data", "array"];
      case "deduplicate": return ["array", "data"];
      case "sort":      return ["array", "data"];
      default:          return ["any"];
    }
  }

  // connection
  if (type === "connection") {
    const connType = (cfg.connector_type ?? cfg.provider) as string | undefined;
    if (connType === "file" || connType === "drive" || connType === "dropbox") return ["data", "binary"];
    if (connType === "sheets") return ["data", "array"];
    if (connType === "gmail" || connType === "outlook") return ["data", "text"];
    if (connType === "docs" || connType === "confluence") return ["data", "text"];
    return ["data"];
  }

  return ["any"];
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SmartNodePaletteProps {
  /** Currently selected schema node (null when nothing is selected). */
  selectedNode: SchemaNode | null;
  /** Callback when user clicks a node to add it. */
  onAdd: (variant: NodeVariant) => void;
  /** Optional drag-start handler for drag-to-canvas. */
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>, variant: NodeVariant) => void;
  /** Close callback. */
  onClose: () => void;
}

// ─── Fuzzy search ────────────────────────────────────────────────────────────

function fuzzyMatch(query: string, entry: PaletteNodeEntry): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const searchable = [
    entry.label,
    entry.description,
    entry.provider ?? "",
    entry.nodeType,
    entry.subtype ?? "",
    ...(entry.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
  // Simple tokenized fuzzy: every word in the query must appear somewhere
  const words = q.split(/\s+/).filter(Boolean);
  return words.every((w) => searchable.includes(w));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SmartNodePalette({
  selectedNode,
  onAdd,
  onDragStart,
  onClose,
}: SmartNodePaletteProps) {
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(["trigger", "ai", "logic"]),
  );

  // Compute the output port types of the currently selected node
  const selectedOutputTypes = useMemo<PortType[]>(
    () => (selectedNode ? getNodeOutputTypes(selectedNode) : []),
    [selectedNode],
  );

  // Filter + rank nodes
  const rankedNodes = useMemo(() => {
    const query = search.trim();
    const filtered = PALETTE_NODES.filter((entry) => fuzzyMatch(query, entry));

    // If a node is selected, compute compatibility scores
    if (selectedNode && selectedOutputTypes.length > 0) {
      return filtered
        .map((entry) => ({
          entry,
          score: compatibilityScore(selectedOutputTypes, entry.ports.inputs),
        }))
        .sort((a, b) => {
          // Higher score first, then alphabetical
          if (b.score !== a.score) return b.score - a.score;
          return a.entry.label.localeCompare(b.entry.label);
        });
    }

    // No selection — just sort alphabetically within their natural category order
    return filtered.map((entry) => ({ entry, score: 0 }));
  }, [search, selectedNode, selectedOutputTypes]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<NodeCategory, { entry: PaletteNodeEntry; score: number }[]>();
    for (const item of rankedNodes) {
      const list = map.get(item.entry.category);
      if (list) list.push(item);
      else map.set(item.entry.category, [item]);
    }
    return map;
  }, [rankedNodes]);

  function toggleCategory(categoryId: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function handleAdd(entry: PaletteNodeEntry) {
    const variant: NodeVariant =
      entry.nodeType === "trigger"
        ? { type: "trigger", subtype: entry.subtype as NodeVariant extends { type: "trigger" } ? never : never }
        : entry.nodeType === "agent"
          ? { type: "agent" }
          : entry.nodeType === "step"
            ? { type: "step", subtype: entry.subtype as any }
            : entry.nodeType === "connection"
              ? { type: "connection", subtype: entry.subtype as any }
              : entry.nodeType === "note"
                ? { type: "note", color: "yellow" }
                : { type: "group" };

    onAdd(variant);
  }

  const hasQuery = search.trim().length > 0;
  const hasCompatible = rankedNodes.some((r) => r.score > 0);

  return (
    <aside
      className={cn(
        "fixed left-0 bottom-0 z-20 w-72",
        "bg-background border-r border-border shadow-lg",
        "flex flex-col overflow-hidden",
      )}
      style={{ top: 56 }}
    >
      <PanelResizeHandle edge="right" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-purple-500" />
          <span className="text-xs font-semibold">Smart Palette</span>
          {selectedNode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-400 font-medium">
              context-aware
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close palette"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Selected node info */}
      {selectedNode && (
        <div className="px-3 py-2 border-b border-border bg-accent/30 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ArrowRight className="h-3 w-3 text-purple-500" />
            <span>
              Suggesting next nodes for{" "}
              <span className="font-medium text-foreground">
                {selectedNode.label}
              </span>
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {selectedOutputTypes.map((t) => (
              <span
                key={t}
                className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-mono"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <label className="relative block">
          <span className="sr-only">Search nodes</span>
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search nodes..."
            className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
      </div>

      {/* Scrollable categories */}
      <div className="flex-1 overflow-y-auto py-2">
        {grouped.size === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No nodes found.
          </p>
        )}

        {Array.from(grouped.entries()).map(([category, items]) => {
          const meta = CATEGORY_META[category];
          const isExpanded = hasQuery || expandedCategories.has(category);
          // Count compatible nodes in this category
          const compatibleCount = items.filter((i) => i.score > 0).length;

          return (
            <div key={category} className="mb-1">
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-accent/60"
                aria-expanded={isExpanded}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={cn(
                    "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                    isExpanded && "rotate-90",
                  )}
                >
                  <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    meta.color,
                  )}
                >
                  {meta.label}
                </span>
                {compatibleCount > 0 && selectedNode && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400 font-medium">
                    {compatibleCount}
                  </span>
                )}
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </button>

              {/* Node entries */}
              {isExpanded && (
                <div className="px-2 space-y-0.5">
                  {items.map(({ entry, score }) => {
                    const isCompatible = score > 0;
                    const isHighScore = score >= 2;
                    const key = entry.key;

                    return (
                      <button
                        key={key}
                        type="button"
                        draggable={Boolean(onDragStart)}
                        onDragStart={(event) => {
                          if (!onDragStart) return;
                          const variant = entryToVariant(entry);
                          if (variant) onDragStart(event, variant);
                        }}
                        onClick={() => handleAdd(entry)}
                        className={cn(
                          "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left",
                          "hover:bg-accent transition-colors group cursor-grab active:cursor-grabbing",
                          isHighScore && "ring-1 ring-green-500/30 bg-green-500/5",
                          isCompatible && !isHighScore && "ring-1 ring-green-500/15",
                        )}
                        title={isCompatible ? `Compatible — accepts ${entry.ports.inputs.join(", ") || "any"}` : entry.description}
                      >
                        {/* Icon badge */}
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                            meta.bgColor,
                            meta.color,
                          )}
                        >
                          {entry.provider ? (
                            <ProviderIcon provider={entry.provider} />
                          ) : (
                            <PaletteIcon icon={entry.icon} className="h-3.5 w-3.5" />
                          )}
                        </span>

                        {/* Text */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium text-foreground leading-tight truncate">
                              {entry.label}
                            </p>
                            {isHighScore && (
                              <span className="text-[9px] text-green-600 dark:text-green-400 font-medium shrink-0">
                                ★
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">
                            {entry.description}
                          </p>
                        </div>

                        {/* Compatibility indicator */}
                        {isCompatible && selectedNode && (
                          <span className="text-[9px] text-green-600 dark:text-green-400 font-mono shrink-0">
                            {score >= 3 ? "●●" : score >= 2 ? "●" : "○"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground">
          {selectedNode
            ? "★ = best match. Drag or click to add."
            : "Drag a node onto the canvas, or click to add it."}
        </p>
      </div>
    </aside>
  );
}

// ─── Helper: convert palette entry to NodeVariant ────────────────────────────

function entryToVariant(entry: PaletteNodeEntry): NodeVariant | null {
  switch (entry.nodeType) {
    case "trigger":
      return { type: "trigger", subtype: entry.subtype as any };
    case "agent":
      return { type: "agent" };
    case "step":
      return { type: "step", subtype: entry.subtype as any };
    case "connection":
      return { type: "connection", subtype: entry.subtype as any };
    case "note":
      return { type: "note", color: "yellow" };
    case "group":
      return { type: "group" };
    default:
      return null;
  }
}
