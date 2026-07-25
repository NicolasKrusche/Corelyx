"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { PROVIDER_ICON_URL } from "@/lib/provider-icons";
import { PanelResizeHandle } from "@/components/editor/PanelResizeHandle";
import {
  loadConnectorManifest,
  searchOperations,
  type ConnectorManifest,
  type SearchResult,
} from "@/lib/genesis/connector-manifest";

// ─── Variant type — exported so EditorShell + Toolbar can share it ────────────

export type TriggerSubtype = "manual" | "cron" | "webhook" | "event" | "program_output" | "file_watch";
export type StepSubtype = "transform" | "filter" | "branch" | "delay" | "loop" | "format" | "parse" | "deduplicate" | "sort";
export type ConnectionSubtype =
  | "http"
  | "file"
  | "gmail" | "notion" | "slack" | "github" | "sheets"
  | "calendar" | "docs" | "drive" | "airtable" | "hubspot"
  | "typeform" | "asana" | "outlook"
  | "shopify" | "zoom" | "sentry" | "gitlab" | "confluence"
  | "jira" | "dropbox" | "todoist" | "calendly"
  // Community marketplace connectors
  | "zendesk" | "stripe" | "notion-db";

export type NoteColor = "yellow" | "blue" | "pink" | "green";

export type NodeVariant =
  | { type: "trigger"; subtype: TriggerSubtype }
  | { type: "agent" }
  | { type: "step"; subtype: StepSubtype }
  | { type: "connection"; subtype: ConnectionSubtype }
  | { type: "note"; color: NoteColor }
  | { type: "group" };

// ─── Catalog ──────────────────────────────────────────────────────────────────

interface NodeTemplate {
  variant: NodeVariant;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface Category {
  id: string;
  label: string;
  color: string;        // Tailwind text color
  bgColor: string;      // Tailwind bg for badge
  templates: NodeTemplate[];
}

function TrigIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm.5 2.5h-1v4l3 1.8.5-.87-2.5-1.5V5.5z" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
      <circle cx="8" cy="6" r="3" />
      <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" strokeLinecap="round" />
    </svg>
  );
}

function StepIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
      <path d="M7 4.5h2M9 4.5V7a2 2 0 002 2h.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HttpIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
      <path d="M2 8h12M8 2l4 6-4 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
      <path d="M9 1.5H4a1 1 0 00-1 1v11a1 1 0 001 1h8a1 1 0 001-1V5.5L9 1.5z" strokeLinejoin="round" />
      <path d="M9 1.5v4h4" strokeLinejoin="round" />
    </svg>
  );
}

function FolderWatchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
      <path d="M2 4a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 4v8a1 1 0 001 1h4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11.5" cy="11.5" r="2.5" />
      <path d="M13.4 13.4L15 15" strokeLinecap="round" />
    </svg>
  );
}

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

const CATEGORIES: Category[] = [
  {
    id: "triggers",
    label: "Triggers",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-500/15",
    templates: [
      {
        variant: { type: "trigger", subtype: "manual" },
        label: "Manual",
        description: "Run on demand via API or button",
        icon: <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M4 2.5l9 5.5-9 5.5V2.5z" /></svg>,
      },
      {
        variant: { type: "trigger", subtype: "cron" },
        label: "Cron schedule",
        description: "Run on a time-based schedule",
        icon: <TrigIcon />,
      },
      {
        variant: { type: "trigger", subtype: "webhook" },
        label: "Webhook",
        description: "Run when an HTTP request is received",
        icon: <HttpIcon />,
      },
      {
        variant: { type: "trigger", subtype: "event" },
        label: "Event",
        description: "Run on a named event from a provider",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <path d="M8 2v4l3 1.5" strokeLinecap="round" /><circle cx="8" cy="8" r="6" />
          </svg>
        ),
      },
      {
        variant: { type: "trigger", subtype: "program_output" },
        label: "Program output",
        description: "Chain — fire when another program finishes",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        variant: { type: "trigger", subtype: "file_watch" },
        label: "File watch",
        description: "Run when a file changes in a folder on your desktop device",
        icon: <FolderWatchIcon />,
      },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-500/15",
    templates: [
      {
        variant: { type: "agent" },
        label: "AI Agent",
        description: "LLM-powered agent with tool access",
        icon: <AgentIcon />,
      },
    ],
  },
  {
    id: "logic",
    label: "Logic",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-500/15",
    templates: [
      {
        variant: { type: "step", subtype: "transform" },
        label: "Transform",
        description: "Map / reshape data with a JS expression",
        icon: <StepIcon />,
      },
      {
        variant: { type: "step", subtype: "filter" },
        label: "Filter",
        description: "Pass or stop data on a condition",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <path d="M2 4h12M5 8h6M8 12h0" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        variant: { type: "step", subtype: "branch" },
        label: "Branch",
        description: "Route to different nodes conditionally",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <path d="M8 3v4M5 10l3-3 3 3M5 13h6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        variant: { type: "step", subtype: "loop" },
        label: "Loop",
        description: "Iterate over every item in an array",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <path d="M3 8a5 5 0 0110 0" strokeLinecap="round" />
            <path d="M13 8a5 5 0 01-10 0" strokeLinecap="round" strokeDasharray="2 2" />
            <path d="M12 5l1 3 2-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        variant: { type: "step", subtype: "delay" },
        label: "Delay",
        description: "Pause execution for N seconds",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        variant: { type: "step", subtype: "format" },
        label: "Format",
        description: "Interpolate values into a string template",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <path d="M3 5h10M3 8h7M3 11h5" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        variant: { type: "step", subtype: "parse" },
        label: "Parse",
        description: "Parse JSON, CSV, or line-delimited text",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <path d="M5 3l-3 5 3 5M11 3l3 5-3 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        variant: { type: "step", subtype: "deduplicate" },
        label: "Deduplicate",
        description: "Remove duplicate items from an array by key",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <rect x="2" y="5" width="8" height="8" rx="1" />
            <path d="M6 5V4a1 1 0 011-1h6a1 1 0 011 1v7a1 1 0 01-1 1h-1" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        variant: { type: "step", subtype: "sort" },
        label: "Sort",
        description: "Sort an array ascending or descending by field",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <path d="M4 3v10M4 13l-2-2M4 13l2-2M12 3v10M12 3l-2 2M12 3l2 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "connections",
    label: "Connections",
    color: "text-slate-700 dark:text-slate-300",
    bgColor: "bg-slate-500/15",
    templates: [
      {
        variant: { type: "connection", subtype: "http" },
        label: "HTTP Request",
        description: "Call any REST API endpoint",
        icon: <HttpIcon />,
      },
      {
        variant: { type: "connection", subtype: "file" },
        label: "Local Files",
        description: "Read/write files on your desktop device, inside granted folders",
        icon: <FileIcon />,
      },
      {
        variant: { type: "connection", subtype: "gmail" },
        label: "Gmail",
        description: "Send, read, and manage Gmail messages",
        icon: <ProviderIcon provider="gmail" />,
      },
      {
        variant: { type: "connection", subtype: "notion" },
        label: "Notion",
        description: "Read and write Notion pages & databases",
        icon: <ProviderIcon provider="notion" />,
      },
      {
        variant: { type: "connection", subtype: "slack" },
        label: "Slack",
        description: "Post messages and manage channels",
        icon: <ProviderIcon provider="slack" />,
      },
      {
        variant: { type: "connection", subtype: "github" },
        label: "GitHub",
        description: "Create issues, PRs, and push files",
        icon: <ProviderIcon provider="github" />,
      },
      {
        variant: { type: "connection", subtype: "sheets" },
        label: "Google Sheets",
        description: "Read and write spreadsheet data",
        icon: <ProviderIcon provider="sheets" />,
      },
      {
        variant: { type: "connection", subtype: "calendar" },
        label: "Google Calendar",
        description: "List and create calendar events",
        icon: <ProviderIcon provider="calendar" />,
      },
      {
        variant: { type: "connection", subtype: "docs" },
        label: "Google Docs",
        description: "Read and write documents",
        icon: <ProviderIcon provider="docs" />,
      },
      {
        variant: { type: "connection", subtype: "drive" },
        label: "Google Drive",
        description: "List, share, and manage Drive files",
        icon: <ProviderIcon provider="drive" />,
      },
      {
        variant: { type: "connection", subtype: "airtable" },
        label: "Airtable",
        description: "CRUD records in Airtable bases",
        icon: <ProviderIcon provider="airtable" />,
      },
      {
        variant: { type: "connection", subtype: "hubspot" },
        label: "HubSpot",
        description: "Manage contacts and deals",
        icon: <ProviderIcon provider="hubspot" />,
      },
      {
        variant: { type: "connection", subtype: "typeform" },
        label: "Typeform",
        description: "Read forms and responses",
        icon: <ProviderIcon provider="typeform" />,
      },
      {
        variant: { type: "connection", subtype: "asana" },
        label: "Asana",
        description: "Create and update tasks and projects",
        icon: <ProviderIcon provider="asana" />,
      },
      {
        variant: { type: "connection", subtype: "outlook" },
        label: "Outlook",
        description: "Send and read Outlook mail",
        icon: <ProviderIcon provider="outlook" />,
      },
      {
        variant: { type: "connection", subtype: "shopify" },
        label: "Shopify",
        description: "Manage orders, products, and customers",
        icon: <ProviderIcon provider="shopify" />,
      },
      {
        variant: { type: "connection", subtype: "zoom" },
        label: "Zoom",
        description: "Schedule and manage meetings",
        icon: <ProviderIcon provider="zoom" />,
      },
      {
        variant: { type: "connection", subtype: "sentry" },
        label: "Sentry",
        description: "Track issues and error events",
        icon: <ProviderIcon provider="sentry" />,
      },
      {
        variant: { type: "connection", subtype: "gitlab" },
        label: "GitLab",
        description: "Manage repos, issues, and merge requests",
        icon: <ProviderIcon provider="gitlab" />,
      },
      {
        variant: { type: "connection", subtype: "confluence" },
        label: "Confluence",
        description: "Read and write Confluence pages",
        icon: <ProviderIcon provider="confluence" />,
      },
      {
        variant: { type: "connection", subtype: "jira" },
        label: "Jira",
        description: "Create and update issues",
        icon: <ProviderIcon provider="jira" />,
      },
      {
        variant: { type: "connection", subtype: "dropbox" },
        label: "Dropbox",
        description: "List, upload, and share files",
        icon: <ProviderIcon provider="dropbox" />,
      },
      {
        variant: { type: "connection", subtype: "todoist" },
        label: "Todoist",
        description: "Manage tasks and projects",
        icon: <ProviderIcon provider="todoist" />,
      },
      {
        variant: { type: "connection", subtype: "calendly" },
        label: "Calendly",
        description: "Read scheduled events and invitees",
        icon: <ProviderIcon provider="calendly" />,
      },
    ],
  },
  {
    id: "annotations",
    label: "Annotations",
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-500/15",
    templates: [
      {
        variant: { type: "note", color: "yellow" } as NodeVariant,
        label: "Sticky note",
        description: "Add a visual comment or annotation to the canvas",
        icon: (
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 opacity-80">
            <path d="M2 3a1 1 0 011-1h8l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3zm9 0v2h2l-2-2zM5 7h6v1H5V7zm0 2.5h4v1H5v-1z" />
          </svg>
        ),
      },
      {
        variant: { type: "group" } as NodeVariant,
        label: "Group",
        description: "Draw a labeled group to visually cluster related nodes",
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
            <rect x="2" y="2" width="12" height="12" rx="2" strokeDasharray="3 2" />
            <path d="M6 6h4M6 10h4" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
];

// ─── NodePalettePanel ─────────────────────────────────────────────────────────

interface NodePalettePanelProps {
  onAdd: (variant: NodeVariant) => void;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>, variant: NodeVariant) => void;
  onClose: () => void;
  enableAdvancedEditor?: boolean;
}

export function NodePalettePanel({ onAdd, onDragStart, onClose, enableAdvancedEditor = false }: NodePalettePanelProps) {
  const [search, setSearch] = React.useState("");
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(() => new Set());
  const [manifest, setManifest] = React.useState<ConnectorManifest | null>(null);
  const [operationResults, setOperationResults] = React.useState<SearchResult[]>([]);

  // Load manifest on mount
  React.useEffect(() => {
    loadConnectorManifest().then(setManifest);
  }, []);

  const visibleCategories = enableAdvancedEditor
    ? CATEGORIES
    : CATEGORIES.filter((cat) => cat.id !== "annotations");
  const normalizedSearch = search.trim().toLowerCase();

  // Search operations from manifest when typing (debounced)
  React.useEffect(() => {
    if (!manifest || !normalizedSearch || normalizedSearch.length < 2) {
      setOperationResults([]);
      return;
    }

    void (async () => {
      const results = await searchOperations(normalizedSearch, 10);
      setOperationResults(results);
    })();
  }, [manifest, normalizedSearch]);

  const filteredCategories = visibleCategories
    .map((cat) => ({
      ...cat,
      templates: cat.templates.filter((tpl) =>
        !normalizedSearch || `${tpl.label} ${tpl.description}`.toLowerCase().includes(normalizedSearch)
      ),
    }))
    .filter((cat) => cat.templates.length > 0);

  function toggleCategory(categoryId: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "fixed left-0 bottom-0 z-20 w-60",
        "bg-background border-r border-border shadow-lg",
        "flex flex-col overflow-hidden",
      )}
      style={{ top: 56 }}
    >
      <PanelResizeHandle edge="right" />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-xs font-semibold">Add node</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close palette"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="shrink-0 border-b border-border px-3 py-2">
        <label className="relative block">
          <span className="sr-only">Search nodes</span>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3 3" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search nodes..."
            className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </label>
      </div>

      {/* Scrollable categories */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Operation search results from manifest */}
        {operationResults.length > 0 && (
          <div className="mb-2 border-b border-border pb-2">
            <div className="px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                Operations
              </span>
            </div>
            <div className="px-2 space-y-0.5">
              {operationResults.map((result) => (
                <button
                  key={`${result.provider}-${result.operation}`}
                  type="button"
                  onClick={() => {
                    onAdd({
                      type: "connection",
                      subtype: result.provider as ConnectionSubtype,
                    });
                    onClose();
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left",
                    "hover:bg-accent transition-colors group cursor-pointer"
                  )}
                >
                  {/* Icon badge */}
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                      "bg-purple-500/15 text-purple-700 dark:text-purple-400"
                    )}
                  >
                    <ProviderIcon provider={result.provider} />
                  </span>

                  {/* Text */}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground leading-tight truncate">
                      {result.provider}: {result.operation}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">
                      {result.description ?? `Tier ${result.tier} operation`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredCategories.map((cat) => {
          const isExpanded = Boolean(normalizedSearch) || expandedCategories.has(cat.id);
          return (
          <div key={cat.id} className="mb-1">
            {/* Category header */}
            <button
              type="button"
              onClick={() => toggleCategory(cat.id)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-accent/60"
              aria-expanded={isExpanded}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
              >
                <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className={cn("text-[10px] font-semibold uppercase tracking-wider", cat.color)}>
                {cat.label}
              </span>
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{cat.templates.length}</span>
            </button>

            {/* Templates */}
            {isExpanded && <div className="px-2 space-y-0.5">
              {cat.templates.map((tpl) => {
                const key =
                  tpl.variant.type === "trigger" ? `trigger-${tpl.variant.subtype}`
                  : tpl.variant.type === "step" ? `step-${tpl.variant.subtype}`
                  : tpl.variant.type === "connection" ? `conn-${tpl.variant.subtype}`
                  : tpl.variant.type === "note" ? `note-${tpl.variant.color}`
                  : tpl.variant.type === "group" ? "group"
                  : "agent";

                return (
                  <button
                    key={key}
                    type="button"
                    draggable={Boolean(onDragStart)}
                    onDragStart={(event) => onDragStart?.(event, tpl.variant)}
                    onClick={() => { onAdd(tpl.variant); onClose(); }}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left",
                      "hover:bg-accent transition-colors group cursor-grab active:cursor-grabbing"
                    )}
                  >
                    {/* Icon badge */}
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        cat.bgColor,
                        cat.color,
                      )}
                    >
                      {tpl.icon}
                    </span>

                    {/* Text */}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground leading-tight truncate">
                        {tpl.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                        {tpl.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>}
          </div>
        )})}
        {filteredCategories.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No nodes found.
          </p>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground">
          Drag a node onto the canvas, or click to add it.
        </p>
      </div>
    </aside>
  );
}
