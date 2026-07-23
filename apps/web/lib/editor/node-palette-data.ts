/**
 * Smart Node Palette — Static registry of available node types.
 *
 * Each entry carries input/output port types so the palette can rank
 * compatible "next nodes" when the user selects an existing node.
 *
 * Port types use a simple string enum:
 *   "any"     — accepts / produces anything
 *   "data"    — structured JSON / object data
 *   "text"    — plain text / string
 *   "array"   — array / list of items
 *   "trigger" — event / trigger payload
 *   "binary"  — file / binary content
 *   "signal"  — control-flow signal (no data payload)
 */

// ─── Port type helpers ───────────────────────────────────────────────────────

export type PortType =
  | "any"
  | "data"
  | "text"
  | "array"
  | "trigger"
  | "binary"
  | "signal";

export interface PortTypeSpec {
  /** Accepted input port types (empty = accepts all). */
  inputs: PortType[];
  /** Produced output port types (empty = no output). */
  outputs: PortType[];
}

// ─── Node category ───────────────────────────────────────────────────────────

export type NodeCategory =
  | "trigger"
  | "connector"
  | "logic"
  | "ai"
  | "output"
  | "annotation";

// ─── Palette entry ───────────────────────────────────────────────────────────

export interface PaletteNodeEntry {
  /** Unique key — maps to the variant used by makeDefaultNode. */
  key: string;
  /** Schema node type (trigger | agent | step | connection | note | group). */
  nodeType: "trigger" | "agent" | "step" | "connection" | "note" | "group";
  /** Subtype for trigger / step / connection (undefined for agent/note/group). */
  subtype?: string;
  /** Human-readable label. */
  label: string;
  /** One-liner shown in the palette. */
  description: string;
  /** Category for grouping. */
  category: NodeCategory;
  /** Provider key (for connector nodes — used for icon lookup). */
  provider?: string;
  /** Lucide icon name — used to dynamically render the correct icon. */
  icon: string;
  /** Input / output port types for compatibility matching. */
  ports: PortTypeSpec;
  /** Tags for fuzzy search. */
  tags?: string[];
}

// ─── Compatibility ───────────────────────────────────────────────────────────

/**
 * Returns true when a source node's output types overlap with a target
 * node's input types. Used to rank / highlight compatible "next nodes".
 */
export function areTypesCompatible(sourceOutputs: PortType[], targetInputs: PortType[]): boolean {
  if (sourceOutputs.length === 0 || targetInputs.length === 0) return true; // both sides accept anything
  if (targetInputs.includes("any") || sourceOutputs.includes("any")) return true;
  return sourceOutputs.some((o) => targetInputs.includes(o));
}

/**
 * Compatibility score for ranking: higher = more compatible.
 *   3 — exact overlap (non-any)
 *   2 — at least one non-any type matches
 *   1 — any-based compatibility
 *   0 — incompatible
 */
export function compatibilityScore(sourceOutputs: PortType[], targetInputs: PortType[]): number {
  if (sourceOutputs.length === 0 && targetInputs.length === 0) return 1;
  if (sourceOutputs.includes("any") || targetInputs.includes("any")) return 1;
  const overlap = sourceOutputs.filter((o) => targetInputs.includes(o));
  if (overlap.length === 0) return 0;
  return overlap.length >= 2 ? 3 : 2;
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const PALETTE_NODES: PaletteNodeEntry[] = [
  // ── Triggers ──────────────────────────────────────────────────────────────
  {
    key: "trigger-manual",
    nodeType: "trigger",
    subtype: "manual",
    label: "Manual Trigger",
    description: "Run on demand via API or button",
    category: "trigger",
    icon: "Play",
    ports: { inputs: [], outputs: ["trigger"] },
    tags: ["start", "manual", "button", "api"],
  },
  {
    key: "trigger-cron",
    nodeType: "trigger",
    subtype: "cron",
    label: "Cron Schedule",
    description: "Run on a recurring time-based schedule",
    category: "trigger",
    icon: "Clock",
    ports: { inputs: [], outputs: ["trigger"] },
    tags: ["schedule", "timer", "cron", "recurring"],
  },
  {
    key: "trigger-webhook",
    nodeType: "trigger",
    subtype: "webhook",
    label: "Webhook",
    description: "Run when an HTTP request is received",
    category: "trigger",
    icon: "Globe",
    ports: { inputs: [], outputs: ["trigger", "data"] },
    tags: ["http", "webhook", "receive", "incoming"],
  },
  {
    key: "trigger-event",
    nodeType: "trigger",
    subtype: "event",
    label: "Event Trigger",
    description: "Run on a named event from a provider",
    category: "trigger",
    icon: "Zap",
    ports: { inputs: [], outputs: ["trigger", "data"] },
    tags: ["event", "subscribe", "provider"],
  },
  {
    key: "trigger-program-output",
    nodeType: "trigger",
    subtype: "program_output",
    label: "Program Output",
    description: "Chain — fire when another program finishes",
    category: "trigger",
    icon: "GitBranch",
    ports: { inputs: [], outputs: ["trigger", "data"] },
    tags: ["chain", "program", "output", "cascade"],
  },
  {
    key: "trigger-file-watch",
    nodeType: "trigger",
    subtype: "file_watch",
    label: "File Watch",
    description: "Run when a file changes on your desktop device",
    category: "trigger",
    icon: "FolderSearch",
    ports: { inputs: [], outputs: ["trigger", "binary"] },
    tags: ["file", "folder", "watch", "desktop", "change"],
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  {
    key: "agent",
    nodeType: "agent",
    label: "AI Agent",
    description: "LLM-powered agent with tool access",
    category: "ai",
    icon: "BrainCircuit",
    ports: { inputs: ["any"], outputs: ["data", "text"] },
    tags: ["llm", "ai", "agent", "gpt", "prompt", "openai"],
  },

  // ── Logic ─────────────────────────────────────────────────────────────────
  {
    key: "step-transform",
    nodeType: "step",
    subtype: "transform",
    label: "Transform",
    description: "Map / reshape data with a JS expression",
    category: "logic",
    icon: "Shuffle",
    ports: { inputs: ["any"], outputs: ["data"] },
    tags: ["map", "reshape", "javascript", "expression", "data"],
  },
  {
    key: "step-filter",
    nodeType: "step",
    subtype: "filter",
    label: "Filter",
    description: "Pass or stop data on a condition",
    category: "logic",
    icon: "Filter",
    ports: { inputs: ["any"], outputs: ["any"] },
    tags: ["condition", "where", "predicate", "gate"],
  },
  {
    key: "step-branch",
    nodeType: "step",
    subtype: "branch",
    label: "Branch (IF/ELSE)",
    description: "Route to different nodes conditionally",
    category: "logic",
    icon: "GitFork",
    ports: { inputs: ["any"], outputs: ["any", "signal"] },
    tags: ["if", "else", "conditional", "branch", "route"],
  },
  {
    key: "step-loop",
    nodeType: "step",
    subtype: "loop",
    label: "Loop",
    description: "Iterate over every item in an array",
    category: "logic",
    icon: "Repeat",
    ports: { inputs: ["array", "any"], outputs: ["data", "signal"] },
    tags: ["iterate", "each", "for", "loop", "array"],
  },
  {
    key: "step-delay",
    nodeType: "step",
    subtype: "delay",
    label: "Delay",
    description: "Pause execution for N seconds",
    category: "logic",
    icon: "Timer",
    ports: { inputs: ["any", "signal"], outputs: ["any", "signal"] },
    tags: ["wait", "pause", "sleep", "timer", "slow"],
  },
  {
    key: "step-format",
    nodeType: "step",
    subtype: "format",
    label: "Format",
    description: "Interpolate values into a string template",
    category: "logic",
    icon: "AlignLeft",
    ports: { inputs: ["data", "any"], outputs: ["text"] },
    tags: ["template", "interpolate", "string", "format", "text"],
  },
  {
    key: "step-parse",
    nodeType: "step",
    subtype: "parse",
    label: "Parse",
    description: "Parse JSON, CSV, or line-delimited text",
    category: "logic",
    icon: "Braces",
    ports: { inputs: ["text", "binary"], outputs: ["data", "array"] },
    tags: ["json", "csv", "parse", "deserialize", "decode"],
  },
  {
    key: "step-deduplicate",
    nodeType: "step",
    subtype: "deduplicate",
    label: "Deduplicate",
    description: "Remove duplicate items from an array by key",
    category: "logic",
    icon: "Unlink",
    ports: { inputs: ["array", "any"], outputs: ["array", "data"] },
    tags: ["unique", "dedupe", "distinct", "remove duplicates"],
  },
  {
    key: "step-sort",
    nodeType: "step",
    subtype: "sort",
    label: "Sort",
    description: "Sort an array ascending or descending by field",
    category: "logic",
    icon: "ArrowUpDown",
    ports: { inputs: ["array", "any"], outputs: ["array", "data"] },
    tags: ["order", "asc", "desc", "rank", "sort"],
  },

  // ── Connectors (HTTP / Files) ─────────────────────────────────────────────
  {
    key: "conn-http",
    nodeType: "connection",
    subtype: "http",
    label: "HTTP Request",
    description: "Call any REST API endpoint",
    category: "connector",
    provider: "http",
    icon: "Globe",
    ports: { inputs: ["data", "any"], outputs: ["data", "text"] },
    tags: ["rest", "api", "http", "fetch", "request"],
  },
  {
    key: "conn-file",
    nodeType: "connection",
    subtype: "file",
    label: "Local Files",
    description: "Read/write files on your desktop device",
    category: "connector",
    provider: "file",
    icon: "FileText",
    ports: { inputs: ["data", "binary"], outputs: ["data", "binary"] },
    tags: ["file", "local", "read", "write", "desktop"],
  },

  // ── Connectors (OAuth providers) ──────────────────────────────────────────
  {
    key: "conn-gmail",
    nodeType: "connection",
    subtype: "gmail",
    label: "Gmail",
    description: "Send, read, and manage Gmail messages",
    category: "connector",
    provider: "gmail",
    icon: "Mail",
    ports: { inputs: ["data", "text"], outputs: ["data", "text"] },
    tags: ["email", "mail", "gmail", "google", "inbox", "send"],
  },
  {
    key: "conn-slack",
    nodeType: "connection",
    subtype: "slack",
    label: "Slack",
    description: "Post messages and manage channels",
    category: "connector",
    provider: "slack",
    icon: "MessageSquare",
    ports: { inputs: ["data", "text"], outputs: ["data"] },
    tags: ["slack", "message", "channel", "chat", "workspace"],
  },
  {
    key: "conn-notion",
    nodeType: "connection",
    subtype: "notion",
    label: "Notion",
    description: "Read and write Notion pages & databases",
    category: "connector",
    provider: "notion",
    icon: "BookOpen",
    ports: { inputs: ["data", "text"], outputs: ["data"] },
    tags: ["notion", "page", "database", "wiki", "docs"],
  },
  {
    key: "conn-github",
    nodeType: "connection",
    subtype: "github",
    label: "GitHub",
    description: "Create issues, PRs, and push files",
    category: "connector",
    provider: "github",
    icon: "Github",
    ports: { inputs: ["data", "text"], outputs: ["data"] },
    tags: ["github", "repo", "issue", "pr", "pull request", "code"],
  },
  {
    key: "conn-sheets",
    nodeType: "connection",
    subtype: "sheets",
    label: "Google Sheets",
    description: "Read and write spreadsheet data",
    category: "connector",
    provider: "sheets",
    icon: "Table",
    ports: { inputs: ["data", "array"], outputs: ["data", "array"] },
    tags: ["sheets", "spreadsheet", "google", "rows", "cells"],
  },
  {
    key: "conn-calendar",
    nodeType: "connection",
    subtype: "calendar",
    label: "Google Calendar",
    description: "List and create calendar events",
    category: "connector",
    provider: "calendar",
    icon: "CalendarDays",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["calendar", "event", "google", "schedule", "meeting"],
  },
  {
    key: "conn-docs",
    nodeType: "connection",
    subtype: "docs",
    label: "Google Docs",
    description: "Read and write documents",
    category: "connector",
    provider: "docs",
    icon: "FileText",
    ports: { inputs: ["data", "text"], outputs: ["data", "text"] },
    tags: ["docs", "document", "google", "read", "write"],
  },
  {
    key: "conn-drive",
    nodeType: "connection",
    subtype: "drive",
    label: "Google Drive",
    description: "List, share, and manage Drive files",
    category: "connector",
    provider: "drive",
    icon: "HardDrive",
    ports: { inputs: ["data", "binary"], outputs: ["data", "binary"] },
    tags: ["drive", "google", "file", "upload", "download"],
  },
  {
    key: "conn-airtable",
    nodeType: "connection",
    subtype: "airtable",
    label: "Airtable",
    description: "CRUD records in Airtable bases",
    category: "connector",
    provider: "airtable",
    icon: "Database",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["airtable", "database", "records", "base", "crm"],
  },
  {
    key: "conn-hubspot",
    nodeType: "connection",
    subtype: "hubspot",
    label: "HubSpot",
    description: "Manage contacts and deals",
    category: "connector",
    provider: "hubspot",
    icon: "Contact",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["hubspot", "crm", "contact", "deal", "marketing"],
  },
  {
    key: "conn-typeform",
    nodeType: "connection",
    subtype: "typeform",
    label: "Typeform",
    description: "Read forms and responses",
    category: "connector",
    provider: "typeform",
    icon: "ClipboardList",
    ports: { inputs: [], outputs: ["data"] },
    tags: ["typeform", "form", "survey", "response", "input"],
  },
  {
    key: "conn-asana",
    nodeType: "connection",
    subtype: "asana",
    label: "Asana",
    description: "Create and update tasks and projects",
    category: "connector",
    provider: "asana",
    icon: "ListTodo",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["asana", "task", "project", "todo", "pm"],
  },
  {
    key: "conn-outlook",
    nodeType: "connection",
    subtype: "outlook",
    label: "Outlook",
    description: "Send and read Outlook mail",
    category: "connector",
    provider: "outlook",
    icon: "Mail",
    ports: { inputs: ["data", "text"], outputs: ["data", "text"] },
    tags: ["outlook", "email", "microsoft", "mail", "office"],
  },
  {
    key: "conn-shopify",
    nodeType: "connection",
    subtype: "shopify",
    label: "Shopify",
    description: "Manage orders, products, and customers",
    category: "connector",
    provider: "shopify",
    icon: "ShoppingBag",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["shopify", "ecommerce", "order", "product", "store"],
  },
  {
    key: "conn-zoom",
    nodeType: "connection",
    subtype: "zoom",
    label: "Zoom",
    description: "Schedule and manage meetings",
    category: "connector",
    provider: "zoom",
    icon: "Video",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["zoom", "meeting", "video", "conference", "call"],
  },
  {
    key: "conn-sentry",
    nodeType: "connection",
    subtype: "sentry",
    label: "Sentry",
    description: "Track issues and error events",
    category: "connector",
    provider: "sentry",
    icon: "Bug",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["sentry", "error", "tracking", "monitoring", "issues"],
  },
  {
    key: "conn-gitlab",
    nodeType: "connection",
    subtype: "gitlab",
    label: "GitLab",
    description: "Manage repos, issues, and merge requests",
    category: "connector",
    provider: "gitlab",
    icon: "GitBranch",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["gitlab", "repo", "issue", "merge request", "code"],
  },
  {
    key: "conn-confluence",
    nodeType: "connection",
    subtype: "confluence",
    label: "Confluence",
    description: "Read and write Confluence pages",
    category: "connector",
    provider: "confluence",
    icon: "BookOpen",
    ports: { inputs: ["data", "text"], outputs: ["data", "text"] },
    tags: ["confluence", "wiki", "page", "knowledge", "docs"],
  },
  {
    key: "conn-jira",
    nodeType: "connection",
    subtype: "jira",
    label: "Jira",
    description: "Create and update issues",
    category: "connector",
    provider: "jira",
    icon: "Ticket",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["jira", "issue", "bug", "project", "sprint"],
  },
  {
    key: "conn-dropbox",
    nodeType: "connection",
    subtype: "dropbox",
    label: "Dropbox",
    description: "List, upload, and share files",
    category: "connector",
    provider: "dropbox",
    icon: "Cloud",
    ports: { inputs: ["data", "binary"], outputs: ["data", "binary"] },
    tags: ["dropbox", "cloud", "file", "upload", "share"],
  },
  {
    key: "conn-todoist",
    nodeType: "connection",
    subtype: "todoist",
    label: "Todoist",
    description: "Manage tasks and projects",
    category: "connector",
    provider: "todoist",
    icon: "ListTodo",
    ports: { inputs: ["data"], outputs: ["data"] },
    tags: ["todoist", "task", "todo", "project", "productivity"],
  },
  {
    key: "conn-calendly",
    nodeType: "connection",
    subtype: "calendly",
    label: "Calendly",
    description: "Read scheduled events and invitees",
    category: "connector",
    provider: "calendly",
    icon: "CalendarCheck",
    ports: { inputs: [], outputs: ["data"] },
    tags: ["calendly", "scheduling", "meeting", "booking"],
  },
];

// ─── Lookup helpers ──────────────────────────────────────────────────────────

/** Get all entries for a given category. */
export function nodesByCategory(category: NodeCategory): PaletteNodeEntry[] {
  return PALETTE_NODES.filter((n) => n.category === category);
}

/** Get all unique categories present in the registry. */
export const ALL_CATEGORIES: NodeCategory[] = [
  "trigger",
  "connector",
  "logic",
  "ai",
  "output",
  "annotation",
];

/** Category display metadata. */
export const CATEGORY_META: Record<
  NodeCategory,
  { label: string; color: string; bgColor: string }
> = {
  trigger:    { label: "Triggers",    color: "text-green-700 dark:text-green-400",  bgColor: "bg-green-500/15" },
  connector:  { label: "Connectors",  color: "text-slate-700 dark:text-slate-300",  bgColor: "bg-slate-500/15" },
  logic:      { label: "Logic",       color: "text-blue-700 dark:text-blue-400",    bgColor: "bg-blue-500/15" },
  ai:         { label: "AI",          color: "text-purple-700 dark:text-purple-400", bgColor: "bg-purple-500/15" },
  output:     { label: "Output",      color: "text-orange-700 dark:text-orange-400", bgColor: "bg-orange-500/15" },
  annotation: { label: "Annotations", color: "text-amber-700 dark:text-amber-400",  bgColor: "bg-amber-500/15" },
};
