// Account-introspection / orchestration tools available to agent_task nodes.
//
// This is the single source of truth shared by:
//   - the agent Genesis prompt (so it only emits tool ids that exist),
//   - the runtime tool-loop executor (Phase 3 — maps ids → Corelyx API calls),
//   - the UI (Phase 4 — renders which tools an agent step was granted).
//
// These are what make agents "able to do anything the user can" within their
// permitted workspace: read account state, orchestrate workflows, and make
// changes — each gated by the node's scope_access and approval settings.

export type AgentToolScope = "read" | "write";

export type AgentToolDef = {
  id: string;
  label: string;
  /** One-line description used verbatim in the agent prompt. */
  description: string;
  /** "read" = no side effects; "write" = mutates account state or triggers runs. */
  scope: AgentToolScope;
  /**
   * Write tools that change or delete account state. The runtime requires an
   * approval gate (or scope_access including write) before these run, and the
   * UI flags them in the plan the user approves.
   */
  destructive?: boolean;
};

export const AGENT_TOOLS: AgentToolDef[] = [
  // ── Read / introspection ──────────────────────────────────────────────────
  {
    id: "corelyx.list_programs",
    label: "List programs",
    description:
      "List the user's workflows and agents in this workspace. Filters: program_type, is_active, name contains, not-run-since date.",
    scope: "read",
  },
  {
    id: "corelyx.get_program",
    label: "Get program",
    description: "Fetch one program's schema, metadata, connections, and last-run summary by id.",
    scope: "read",
  },
  {
    id: "corelyx.list_runs",
    label: "List runs",
    description:
      "List execution runs, optionally for one program. Filters: status (success/failed/partial/running), since/until date, limit.",
    scope: "read",
  },
  {
    id: "corelyx.get_run",
    label: "Get run details",
    description: "Fetch one run's status, per-node results, error messages, and telemetry by run id.",
    scope: "read",
  },
  {
    id: "corelyx.list_connections",
    label: "List connections",
    description:
      "List connected apps in this workspace with provider, validity, and token expiry so the agent can spot broken or expiring connections.",
    scope: "read",
  },
  {
    id: "corelyx.get_account_stats",
    label: "Account stats",
    description:
      "Summary of the workspace: program counts by type, run counts by status over a window, connection health, and credit balance.",
    scope: "read",
  },
  {
    id: "corelyx.report_to_user",
    label: "Report to the user",
    description:
      "Relay findings back to the user in a rich report window. Args: title (string), body (GitHub-flavored markdown — use headings, **bold**, bullet lists, and tables for readability), and optional data.metrics (array of {label, value, tone:'good'|'warn'|'bad'}) rendered as graphical stat cards. Call this to present results (e.g. why last week's runs failed) before finishing. Safe to use in dry runs.",
    scope: "read",
  },
  // ── Write / orchestration ─────────────────────────────────────────────────
  {
    id: "corelyx.trigger_program",
    label: "Run a workflow",
    description:
      "Manually trigger an existing workflow and (optionally) wait for it to finish, returning the run result. Use to orchestrate other automations.",
    scope: "write",
  },
  {
    id: "corelyx.set_program_active",
    label: "Enable/disable program",
    description: "Activate or deactivate a workflow by id (e.g. pause stale or failing workflows).",
    scope: "write",
  },
  {
    id: "corelyx.create_workflow",
    label: "Create workflow",
    description:
      "Create a new workflow from a complete program schema the agent has designed. The schema is validated before saving.",
    scope: "write",
    destructive: true,
  },
  {
    id: "corelyx.update_program",
    label: "Update program",
    description:
      "Replace an existing program's schema with an updated one (snapshots a new version first). Use for fixes/edits the user asked the agent to make.",
    scope: "write",
    destructive: true,
  },
];

export const AGENT_TOOL_IDS = AGENT_TOOLS.map((t) => t.id);

/**
 * Tools every agent_task gets regardless of its configured `tools` array.
 * Reporting back to the user is a core agent capability, so we never want a
 * generated agent to be unable to relay its findings.
 */
export const ALWAYS_AVAILABLE_AGENT_TOOL_IDS = ["corelyx.report_to_user"] as const;

const AGENT_TOOL_BY_ID = new Map(AGENT_TOOLS.map((t) => [t.id, t]));

export function getAgentTool(id: string): AgentToolDef | undefined {
  return AGENT_TOOL_BY_ID.get(id);
}

export function isAgentToolId(id: string): boolean {
  return AGENT_TOOL_BY_ID.has(id);
}

/** Tools that mutate or delete account state — surfaced prominently for approval. */
export function isDestructiveAgentTool(id: string): boolean {
  return AGENT_TOOL_BY_ID.get(id)?.destructive === true;
}

/** Compact, prompt-ready listing of every tool grouped by scope. */
export function buildAgentToolReference(): string {
  const read = AGENT_TOOLS.filter((t) => t.scope === "read");
  const write = AGENT_TOOLS.filter((t) => t.scope === "write");
  const fmt = (t: AgentToolDef) =>
    `  ${t.id}${t.destructive ? " [destructive]" : ""}: ${t.description}`;
  return [
    "ACCOUNT TOOLS (available to agent_task nodes via their `tools` array):",
    "READ (no side effects):",
    ...read.map(fmt),
    "WRITE (side effects — only include when scope_access permits; [destructive] tools require an approval gate):",
    ...write.map(fmt),
  ].join("\n");
}
