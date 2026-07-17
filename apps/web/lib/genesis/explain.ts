// Genesis Explainability Layer — deterministic, plain-language "why is this node
// here?" text derived entirely from the validated schema. No LLM call: it is
// free, instant, works on every existing program, and is unit-testable.
//
// The goal is activation: users get a generated workflow but don't understand
// why it looks the way it does, so they hesitate to enable it. explainNode gives
// each node a one-line headline and a contextual sentence or two (it reads the
// node's config AND its graph neighbours). getNodeAlternatives offers one-click
// "use X instead" swaps for connector nodes, expressed as a natural-language
// refinement the existing Genesis edit flow can apply.
//
// Pure and client-safe: imports are type-only, so this can be used inside the
// "use client" editor sidebar without pulling in any server code.

import type {
  Node,
  ProgramSchema,
  Edge,
  TriggerConfig,
  StepConfig,
  ConnectionConfig,
  AgentConfig,
  OAuthConnectionConfig,
} from "@flowos/schema";

export interface NodeExplanation {
  /** Short at-a-glance summary of what the node does (3–5 words). */
  headline: string;
  /** One or two plain-language sentences on why the node is in the graph. */
  why: string;
}

export interface NodeAlternative {
  /** Provider slug of the suggested swap, e.g. "slack". */
  provider: string;
  /** Human-readable provider name, e.g. "Slack". */
  label: string;
  /** Natural-language refinement to feed the Genesis edit flow. */
  refinement: string;
}

// ─── Provider display names ────────────────────────────────────────────────
// A small, self-contained map covering the connectors most likely to be
// generated. Anything not listed falls back to a title-cased slug.

const PROVIDER_LABEL: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  thunderbird: "Thunderbird",
  slack: "Slack",
  teams: "Microsoft Teams",
  discord: "Discord",
  googlechat: "Google Chat",
  telegram: "Telegram",
  webex: "Webex",
  rocketchat: "Rocket.Chat",
  notion: "Notion",
  docs: "Google Docs",
  confluence: "Confluence",
  coda: "Coda",
  nuclino: "Nuclino",
  sheets: "Google Sheets",
  airtable: "Airtable",
  smartsheet: "Smartsheet",
  drive: "Google Drive",
  dropbox: "Dropbox",
  box: "Box",
  onedrive: "OneDrive",
  calendar: "Google Calendar",
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  pipedrive: "Pipedrive",
  closecrm: "Close",
  copper: "Copper",
  freshsales: "Freshsales",
  zohocrm: "Zoho CRM",
  insightly: "Insightly",
  keap: "Keap",
  nutshell: "Nutshell",
  asana: "Asana",
  trello: "Trello",
  clickup: "ClickUp",
  linear: "Linear",
  monday: "monday.com",
  todoist: "Todoist",
  jira: "Jira",
  height: "Height",
  wrike: "Wrike",
  basecamp: "Basecamp",
  teamwork: "Teamwork",
  typeform: "Typeform",
  googleforms: "Google Forms",
  jotform: "Jotform",
  tally: "Tally",
  paperform: "Paperform",
  surveymonkey: "SurveyMonkey",
};

export function providerLabel(provider: string): string {
  if (PROVIDER_LABEL[provider]) return PROVIDER_LABEL[provider];
  return provider
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Connector categories (for one-click alternatives) ──────────────────────
// Providers grouped by interchangeable function. When a connector node uses one
// of these, we offer siblings from the same group as swaps. Order within a group
// is the suggestion priority (most common first).

const CONNECTOR_CATEGORIES: Record<string, string[]> = {
  email: ["gmail", "outlook", "thunderbird"],
  chat: ["slack", "teams", "discord", "googlechat", "telegram", "webex", "rocketchat"],
  crm: ["hubspot", "salesforce", "pipedrive", "closecrm", "copper", "freshsales", "zohocrm", "insightly", "keap", "nutshell"],
  tasks: ["asana", "trello", "clickup", "linear", "monday", "todoist", "jira", "height", "wrike", "basecamp", "teamwork"],
  docs: ["notion", "docs", "confluence", "coda", "nuclino"],
  spreadsheets: ["sheets", "airtable", "smartsheet"],
  storage: ["drive", "dropbox", "box", "onedrive"],
  forms: ["typeform", "googleforms", "jotform", "tally", "paperform", "surveymonkey"],
};

const CATEGORY_NOUN: Record<string, string> = {
  email: "email app",
  chat: "chat app",
  crm: "CRM",
  tasks: "task manager",
  docs: "docs tool",
  spreadsheets: "spreadsheet",
  storage: "file storage",
  forms: "form tool",
};

function categoryOf(provider: string): string | null {
  for (const [category, providers] of Object.entries(CONNECTOR_CATEGORIES)) {
    if (providers.includes(provider)) return category;
  }
  return null;
}

// ─── Graph helpers ──────────────────────────────────────────────────────────

function edgesFrom(nodeId: string, edges: Edge[]): Edge[] {
  return edges.filter((e) => e.from === nodeId);
}

function firstDownstreamLabel(nodeId: string, schema: ProgramSchema): string | null {
  const outgoing = edgesFrom(nodeId, schema.edges);
  for (const edge of outgoing) {
    const target = schema.nodes.find((n) => n.id === edge.to);
    if (target && target.type !== "note" && target.type !== "group") {
      return target.label;
    }
  }
  return null;
}

// ─── Text helpers ───────────────────────────────────────────────────────────

function humanize(token: string): string {
  return token.replace(/[_-]+/g, " ").trim();
}

function humanizeSeconds(seconds: number): string {
  if (seconds <= 0) return "briefly";
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  if (seconds < 3600) {
    const m = Math.round(seconds / 60);
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  const h = Math.round((seconds / 3600) * 10) / 10;
  return `${h} hour${h === 1 ? "" : "s"}`;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Turn a cron expression into a plain-language phrase for the common shapes
 * Genesis emits. Falls back to quoting the raw expression when it doesn't match
 * a known pattern — never throws, always returns something readable.
 */
export function describeCron(expression: string, timezone?: string): string {
  const parts = expression.trim().split(/\s+/);
  const tzSuffix = timezone && timezone !== "UTC" ? ` (${timezone})` : timezone === "UTC" ? " UTC" : "";
  const fallback = `on the schedule \`${expression}\`${tzSuffix}`;
  if (parts.length !== 5) return fallback;

  const [min, hour, dom, mon, dow] = parts;

  // Every minute / every N minutes.
  if (min === "*" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return "every minute";
  }
  const stepMatch = /^\*\/(\d+)$/.exec(min);
  if (stepMatch && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `every ${stepMatch[1]} minutes`;
  }
  // Top of every hour.
  if (min === "0" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return "at the top of every hour";
  }

  // Fixed minute + hour patterns.
  const minNum = Number(min);
  const hourNum = Number(hour);
  const fixedTime = Number.isInteger(minNum) && Number.isInteger(hourNum) && min !== "*" && hour !== "*";
  if (fixedTime) {
    const time = `${pad2(hourNum)}:${pad2(minNum)}`;

    // Monthly on a fixed day-of-month.
    if (dom !== "*" && /^\d+$/.test(dom) && mon === "*" && dow === "*") {
      const day = Number(dom);
      const ord =
        day === 1 ? "1st" : day === 2 ? "2nd" : day === 3 ? "3rd" : `${day}th`;
      return `on the ${ord} of every month at ${time}${tzSuffix}`;
    }

    if (dom === "*" && mon === "*") {
      // Weekdays.
      if (dow === "1-5") return `every weekday at ${time}${tzSuffix}`;
      // Every day.
      if (dow === "*") return `every day at ${time}${tzSuffix}`;
      // A single weekday.
      if (/^\d$/.test(dow)) {
        const name = WEEKDAY_NAMES[Number(dow) % 7];
        return `every ${name} at ${time}${tzSuffix}`;
      }
    }
  }

  return fallback;
}

// ─── Per-type explanations ──────────────────────────────────────────────────

function explainTrigger(config: TriggerConfig, schema: ProgramSchema, nodeId: string): NodeExplanation {
  const next = firstDownstreamLabel(nodeId, schema);
  const kicksOff = next ? ` It kicks off “${next}”.` : "";

  switch (config.trigger_type) {
    case "manual":
      return {
        headline: "Runs on demand",
        why: "This workflow only starts when you press Run — nothing happens automatically. That's the safe default while you're still testing; switch to a schedule or event trigger once you trust it.",
      };
    case "cron":
      return {
        headline: "Runs on a schedule",
        why: `Starts automatically ${describeCron(config.expression, config.timezone)}, so you never have to launch it by hand.${kicksOff}`,
      };
    case "webhook":
      return {
        headline: "Runs on a webhook",
        why: `Starts whenever an external service sends a ${config.method} request to this workflow's webhook URL — use it to react to another app in real time.${kicksOff}`,
      };
    case "event":
      return {
        headline: "Runs on an event",
        why: `Starts whenever ${providerLabel(config.source)} reports a “${config.event}” event, so the workflow reacts the moment it happens instead of polling on a timer.${kicksOff}`,
      };
    case "program_output":
      return {
        headline: "Runs after another program",
        why: `Starts once another Corelyx program finishes (on ${config.on_status.join(" or ")}), letting you chain workflows together.${kicksOff}`,
      };
    case "file_watch":
      return {
        headline: "Runs on file changes",
        why: `Starts when files change in a watched folder on your paired desktop. The watching happens locally on your machine — file contents don't leave it until a later step reads them.${kicksOff}`,
      };
    default:
      return { headline: "Trigger", why: "Starts this workflow." };
  }
}

const DESTRUCTIVE_OP = /^(delete|remove|clear|destroy|purge)/;

function explainConnection(node: Node, schema: ProgramSchema): NodeExplanation {
  const config = node.config as ConnectionConfig;

  if (config.connector_type === "http") {
    let host = "";
    try {
      host = new URL(config.url).host;
    } catch {
      host = config.url.replace(/^https?:\/\//, "").split("/")[0] || "an external API";
    }
    return {
      headline: `HTTP request (${config.method})`,
      why: `Makes a ${config.method} request to ${host}. Genesis used a raw HTTP call here because no first-party connector covers this exact action — you'll supply the credentials it needs in the node's settings.`,
    };
  }

  if (config.connector_type === "file") {
    const isWrite = ["write", "append", "move", "copy", "delete", "mkdir"].includes(config.operation);
    return {
      headline: `Local file: ${config.operation}`,
      why: `Runs a ${config.operation} operation on files on your paired desktop, inside a folder you've granted — nothing touches the cloud.${
        isWrite ? " Because it changes files, the run pauses for your approval before it goes ahead." : ""
      }`,
    };
  }

  // OAuth connector.
  const oauth = config as OAuthConnectionConfig;
  const provider = oauth.provider ?? "";
  const label = provider ? providerLabel(provider) : node.connection || "a connected app";
  const operation = oauth.operation;

  if (!operation) {
    return {
      headline: `${label} access`,
      why: `Surfaces your ${label} account's access to the steps that follow — on its own it doesn't perform an action, it just lets later nodes use this connection.`,
    };
  }

  const action = humanize(operation);
  const isDestructive = DESTRUCTIVE_OP.test(operation) || oauth.operation_params?.permanent === true;
  const isWrite = oauth.scope_access === "write" || oauth.scope_access === "read_write";
  const next = firstDownstreamLabel(node.id, schema);

  let why = `Uses your ${label} connection to ${action}.`;
  if (isDestructive) {
    why += " This is a destructive action, so the run always pauses for your approval before it happens.";
  } else if (isWrite) {
    why += " It writes to the connected account, so double-check the target before enabling the workflow.";
  } else if (next) {
    why += ` The data it reads flows into “${next}”.`;
  } else {
    why += " It reads data for the steps that follow to work with.";
  }

  return { headline: `${label}: ${action}`, why };
}

function explainAgent(config: AgentConfig, schema: ProgramSchema, nodeId: string): NodeExplanation {
  const next = firstDownstreamLabel(nodeId, schema);
  const approval = config.requires_approval
    ? " It pauses for your approval before its result is used downstream."
    : "";
  const feeds = next ? ` Its output feeds “${next}”.` : "";
  return {
    headline: "AI reasoning step",
    why: `Uses an AI model to read and understand the content and make a judgement a fixed rule would get wrong — classifying, summarising, extracting fields, or deciding what to do next.${feeds}${approval}`,
  };
}

function explainStep(config: StepConfig, schema: ProgramSchema, nodeId: string): NodeExplanation {
  switch (config.logic_type) {
    case "transform":
      return {
        headline: "Reshapes the data",
        why: "Rewrites the incoming data into the shape the next step expects. It's a local data transformation — no external call.",
      };
    case "filter":
      return {
        headline: "Stops early when empty",
        why: `Only lets the run continue when \`${config.condition}\` is true. It's here so later steps don't run on empty or irrelevant data — for example, so you don't post an empty digest.`,
      };
    case "branch":
      return {
        headline: "Routes to different paths",
        why: `Sends the run down different paths depending on the data (${config.conditions.length} rule${config.conditions.length === 1 ? "" : "s"} plus a default), so each case is handled the right way.`,
      };
    case "loop":
      return {
        headline: "Repeats for each item",
        why: `Runs the following steps once for every item in \`${config.over}\`. Genesis added it because the previous step returns a list, and each item needs handling on its own.`,
      };
    case "delay":
      return {
        headline: "Waits before continuing",
        why: `Pauses ${humanizeSeconds(config.seconds)} before continuing — usually to respect a rate limit or give an external system time to catch up.`,
      };
    case "format":
      return {
        headline: "Builds a text message",
        why: `Assembles a text value from the data using a template (stored as \`${config.output_key}\`), ready for the next step to send or save.`,
      };
    case "parse":
      return {
        headline: "Parses text into data",
        why: `Turns ${config.format.toUpperCase()} text into structured data the next steps can read field by field.`,
      };
    case "deduplicate":
      return {
        headline: "Removes duplicates",
        why: `Drops repeated items (matched on “${config.key}”) so you don't act on the same thing twice.`,
      };
    case "sort":
      return {
        headline: "Sorts the items",
        why: `Orders items by “${config.key}” (${config.order === "asc" ? "ascending" : "descending"}) so the most relevant ones are handled first.`,
      };
    default:
      return { headline: "Step", why: "Processes the data between steps." };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Plain-language explanation of why a node is in the graph. Reads the node's
 * config and its graph neighbours; never throws.
 */
export function explainNode(node: Node, schema: ProgramSchema): NodeExplanation {
  switch (node.type) {
    case "trigger":
      return explainTrigger(node.config, schema, node.id);
    case "connection":
      return explainConnection(node, schema);
    case "agent":
      return explainAgent(node.config, schema, node.id);
    case "agent_task":
      return {
        headline: "Autonomous task",
        why: "A bounded AI task loop: it reasons and calls its allow-listed tools over several turns to reach a goal, while staying inside this approved plan.",
      };
    case "step":
      return explainStep(node.config, schema, node.id);
    case "note":
      return {
        headline: "Sticky note",
        why: "A note for you — it never runs. Genesis left it to flag something you should set up or know before enabling the workflow.",
      };
    case "group":
      return {
        headline: "Visual group",
        why: "A frame that groups related steps together. It doesn't run; it just makes the graph easier to read.",
      };
    default:
      return { headline: "Node", why: "Part of this workflow." };
  }
}

/**
 * One-click "use X instead" swaps for a connector node, drawn from the same
 * functional category (e.g. Gmail → Slack is not offered, but Gmail → Outlook
 * is; Slack → Teams/Discord is). Returns up to `limit` siblings, each with a
 * refinement string the Genesis edit flow can apply. Empty for non-connector
 * nodes, HTTP/file connectors, or providers with no known category.
 */
export function getNodeAlternatives(node: Node, schema: ProgramSchema, limit = 3): NodeAlternative[] {
  if (node.type !== "connection") return [];
  const config = node.config as ConnectionConfig;
  if (config.connector_type === "http" || config.connector_type === "file") return [];

  const provider = (config as OAuthConnectionConfig).provider;
  if (!provider) return [];

  const category = categoryOf(provider);
  if (!category) return [];

  const currentLabel = providerLabel(provider);
  const noun = CATEGORY_NOUN[category] ?? "app";

  return CONNECTOR_CATEGORIES[category]
    .filter((p) => p !== provider)
    .slice(0, limit)
    .map((p) => ({
      provider: p,
      label: providerLabel(p),
      refinement: `Replace the ${currentLabel} step “${node.label}” with the equivalent ${providerLabel(p)} ${noun} step, keeping the rest of the workflow the same.`,
    }));
}
