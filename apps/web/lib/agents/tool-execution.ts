import { createServiceClient } from "@/lib/api";
import { canRunAgentInWorkspace } from "@/lib/workspaces";
import { getAgentTool } from "@/lib/genesis/agent-tools";
import { searchKnowledgeBase } from "@/lib/agents/knowledge-search";
import { getRuntimeUrl } from "@/lib/runtime-url";
import { buildRuntimeExecuteHeaders } from "@/lib/runtime-dispatch";
import { isNotificationEnabled } from "@/lib/notification-prefs";
import { sendSecurityAlertEmail } from "@/lib/email";
import { ProgramSchemaZ } from "@flowos/schema";

// Executes account-orchestration tools on behalf of an agent_task node. The
// runtime calls /api/internal/agent-tools which delegates here. Two hard rules
// (confirmed product decisions) live in `agentToolGate`:
//   1. Every WRITE tool re-checks canRunAgentInWorkspace on the TARGET workspace
//      at call time — not just where the agent was created.
//   2. In dry-run, write/destructive tools are simulated, never executed.

export type AgentToolContext = {
  /** Workspace the agent program lives in (default target for create_workflow). */
  homeWorkspaceId: string;
  /** When true, write tools are simulated, never executed. */
  dryRun: boolean;
  /** The run executing this agent — used to tie reports to the run. */
  runId?: string;
};

export type AgentToolResult =
  | { ok: true; result: unknown; simulated?: boolean }
  | { ok: false; error: string; simulated?: boolean };

type LooseClient = ReturnType<typeof createServiceClient> & { from(table: string): any };

// ─── The security gate (pure — unit tested) ──────────────────────────────────

export type AgentToolGateInput = {
  toolScope: "read" | "write" | "unknown";
  destructive: boolean;
  dryRun: boolean;
  /** Result of canRunAgentInWorkspace for the resolved target workspace. */
  targetWorkspaceAllowed: boolean;
};

export type AgentToolGateResult =
  | { allow: true }
  | { allow: false; reason: string; simulated?: boolean };

export function agentToolGate(input: AgentToolGateInput): AgentToolGateResult {
  if (input.toolScope === "unknown") {
    return { allow: false, reason: "Unknown tool." };
  }
  // Read tools have no side effects; access is still scoped to the user's own
  // workspaces by the queries themselves.
  if (input.toolScope === "read") return { allow: true };

  // Write tools.
  if (input.dryRun) {
    return {
      allow: false,
      simulated: true,
      reason: "Dry run: this action was simulated, not executed.",
    };
  }
  if (!input.targetWorkspaceAllowed) {
    return {
      allow: false,
      reason: "Not permitted to run agents in the target workspace.",
    };
  }
  return { allow: true };
}

// ─── Execution entrypoint ────────────────────────────────────────────────────

export async function executeAgentTool(input: {
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  context: AgentToolContext;
}): Promise<AgentToolResult> {
  const { userId, tool, args, context } = input;
  const def = getAgentTool(tool);
  if (!def) {
    return { ok: false, error: "Unknown tool." };
  }

  // Connector calls are executed natively by the runtime (it owns the connector
  // layer, OAuth tokens, and dry-run simulation), so they never round-trip here.
  // Guard against accidental dispatch with a clear message.
  if (tool === "corelyx.call_connector") {
    return { ok: false, error: "corelyx.call_connector is executed by the runtime, not the web tool endpoint." };
  }

  const service = createServiceClient() as LooseClient;
  const memberWorkspaceIds = await getUserWorkspaceIds(service, userId);
  if (memberWorkspaceIds.length === 0) {
    return { ok: false, error: "No accessible workspaces for this user." };
  }

  if (def.scope === "write") {
    const targetWorkspaceId = await resolveTargetWorkspace(service, tool, args, context, memberWorkspaceIds);
    if (!targetWorkspaceId) {
      return { ok: false, error: "Target program/workspace not found or not accessible." };
    }
    const targetWorkspaceAllowed = await canRunAgentInWorkspace(targetWorkspaceId, userId);
    const gate = agentToolGate({
      toolScope: "write",
      destructive: def.destructive === true,
      dryRun: context.dryRun,
      targetWorkspaceAllowed,
    });
    if (!gate.allow) {
      return { ok: false, error: gate.reason, simulated: gate.simulated };
    }
  }

  try {
    switch (tool) {
      case "corelyx.list_programs":
        return await listPrograms(service, memberWorkspaceIds, args);
      case "corelyx.get_program":
        return await getProgram(service, memberWorkspaceIds, args);
      case "corelyx.list_runs":
        return await listRuns(service, userId, args);
      case "corelyx.get_run":
        return await getRun(service, userId, args);
      case "corelyx.list_connections":
        return await listConnections(service, memberWorkspaceIds);
      case "corelyx.get_account_stats":
        return await getAccountStats(service, userId, memberWorkspaceIds);
      case "corelyx.search_knowledge":
        return await searchKnowledge(service, userId, memberWorkspaceIds, context, args);
      case "corelyx.report_to_user":
        return await reportToUser(service, userId, context, args);
      case "corelyx.reference_agent":
        return await referenceAgent(service, userId, memberWorkspaceIds, context, args);
      case "corelyx.flag_critical":
        return await flagCritical(service, userId, context, args);
      case "corelyx.read_agent_report":
        return await readAgentReport(service, userId, memberWorkspaceIds, context, args);
      case "corelyx.record_source":
        return await recordSourceTool(service, userId, context, args);
      case "corelyx.spawn_agent":
        return await spawnAgent(service, userId, context, args);
      case "corelyx.trigger_program":
        return await triggerProgram(service, userId, memberWorkspaceIds, args);
      case "corelyx.set_program_active":
        return await setProgramActive(service, memberWorkspaceIds, args);
      case "corelyx.create_workflow":
        return await createWorkflow(service, userId, context, args);
      case "corelyx.update_program":
        return await updateProgram(service, memberWorkspaceIds, args);
      default:
        return { ok: false, error: `Tool ${tool} is recognised but not yet implemented.` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tool execution failed." };
  }
}

// ─── Scoping helpers ─────────────────────────────────────────────────────────

async function getUserWorkspaceIds(service: LooseClient, userId: string): Promise<string[]> {
  const { data } = await service
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("user_id", userId);
  return ((data ?? []) as Array<{ workspace_id: string }>).map((r) => r.workspace_id);
}

/** Resolve which workspace a write tool will act on, for the permission re-check. */
async function resolveTargetWorkspace(
  service: LooseClient,
  tool: string,
  args: Record<string, unknown>,
  context: AgentToolContext,
  memberWorkspaceIds: string[]
): Promise<string | null> {
  // create_workflow / spawn_agent act in the agent's home workspace (the child
  // agent is created alongside its parent).
  if (tool === "corelyx.create_workflow" || tool === "corelyx.spawn_agent") {
    const requested = typeof args.workspace_id === "string" ? args.workspace_id : context.homeWorkspaceId;
    return memberWorkspaceIds.includes(requested) ? requested : null;
  }
  // Program-targeting tools resolve to the target program's workspace.
  const programId = typeof args.program_id === "string" ? args.program_id : null;
  if (!programId) return null;
  const { data } = await service
    .from("programs")
    .select("workspace_id")
    .eq("id", programId)
    .maybeSingle();
  const ws = (data as { workspace_id?: string } | null)?.workspace_id ?? null;
  if (!ws || !memberWorkspaceIds.includes(ws)) return null;
  return ws;
}

function asInt(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Default children an agent may spawn per run when the user hasn't set a cap. */
const DEFAULT_MAX_SPAWNS_PER_RUN = 5;
/** Hard ceiling: a user-set cap can't exceed this, to bound fan-out. */
const MAX_SPAWNS_HARD_CEILING = 20;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

const PROGRAM_DETAIL_SELECT =
  "id, name, description, program_type, is_active, agent_state, execution_mode, schema, schema_version, created_at, updated_at, workspace_id";

// ─── Read tools ──────────────────────────────────────────────────────────────

async function listPrograms(service: LooseClient, workspaceIds: string[], args: Record<string, unknown>): Promise<AgentToolResult> {
  let q = service
    .from("programs")
    .select("id, name, program_type, is_active, agent_state, created_at, updated_at, workspace_id")
    .in("workspace_id", workspaceIds)
    .order("updated_at", { ascending: false })
    .limit(asInt(args.limit, 50, 200));
  if (args.program_type === "workflow" || args.program_type === "agent") q = q.eq("program_type", args.program_type);
  if (typeof args.is_active === "boolean") q = q.eq("is_active", args.is_active);
  if (typeof args.name_contains === "string" && args.name_contains.trim()) q = q.ilike("name", `%${args.name_contains.trim()}%`);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: { programs: data ?? [] } };
}

async function getProgram(service: LooseClient, workspaceIds: string[], args: Record<string, unknown>): Promise<AgentToolResult> {
  const programId = typeof args.program_id === "string" ? args.program_id.trim() : "";
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!programId && !name) {
    return { ok: false, error: "Provide program_id (a UUID) or name." };
  }

  // Fast path: a real UUID — look it up directly.
  if (programId && isUuid(programId)) {
    const { data, error } = await service
      .from("programs")
      .select(PROGRAM_DETAIL_SELECT)
      .eq("id", programId)
      .in("workspace_id", workspaceIds)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Program not found or not accessible." };
    return { ok: true, result: { program: data } };
  }

  // Otherwise resolve by name. This covers the common case where a non-UUID
  // value arrives in program_id (e.g. the user answered an agent question with
  // the program's name) — querying `id = <name>` would otherwise make Postgres
  // raise "invalid input syntax for type uuid", leaking a DB error and trapping
  // the agent in a re-ask loop.
  const lookup = name || programId;
  const escaped = lookup.replace(/[%_]/g, (m) => `\\${m}`);
  // Exact (case-insensitive) match first, then fall back to a contains match.
  let { data, error } = await service
    .from("programs")
    .select(PROGRAM_DETAIL_SELECT)
    .in("workspace_id", workspaceIds)
    .ilike("name", escaped)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) return { ok: false, error: error.message };
  let matches = (data ?? []) as Array<Record<string, unknown>>;
  if (matches.length === 0) {
    ({ data, error } = await service
      .from("programs")
      .select(PROGRAM_DETAIL_SELECT)
      .in("workspace_id", workspaceIds)
      .ilike("name", `%${escaped}%`)
      .order("updated_at", { ascending: false })
      .limit(5));
    if (error) return { ok: false, error: error.message };
    matches = (data ?? []) as Array<Record<string, unknown>>;
  }

  if (matches.length === 0) {
    return { ok: false, error: `No program found matching "${lookup}". Use list_programs to see available programs.` };
  }
  if (matches.length > 1) {
    const candidates = matches.map((p) => `${String(p.name)} (${String(p.id)})`).join(", ");
    return {
      ok: false,
      error: `Multiple programs match "${lookup}": ${candidates}. Call get_program again with the exact program_id.`,
    };
  }
  return { ok: true, result: { program: matches[0] } };
}

async function listRuns(service: LooseClient, userId: string, args: Record<string, unknown>): Promise<AgentToolResult> {
  let q = service
    .from("runs")
    .select("id, program_id, status, triggered_by, started_at, completed_at, error_message, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(asInt(args.limit, 50, 200));
  if (typeof args.program_id === "string") q = q.eq("program_id", args.program_id);
  if (typeof args.status === "string") q = q.eq("status", args.status);
  if (typeof args.since === "string") q = q.gte("created_at", args.since);
  if (typeof args.until === "string") q = q.lte("created_at", args.until);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: { runs: data ?? [] } };
}

async function getRun(service: LooseClient, userId: string, args: Record<string, unknown>): Promise<AgentToolResult> {
  const runId = typeof args.run_id === "string" ? args.run_id : null;
  if (!runId) return { ok: false, error: "run_id is required." };
  const { data: run, error } = await service
    .from("runs")
    .select("id, program_id, status, triggered_by, started_at, completed_at, error_message, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!run) return { ok: false, error: "Run not found or not accessible." };
  const { data: nodes } = await service
    .from("node_executions")
    .select("node_id, status, error_message")
    .eq("run_id", runId);
  return { ok: true, result: { run, node_executions: nodes ?? [] } };
}

async function listConnections(service: LooseClient, workspaceIds: string[]): Promise<AgentToolResult> {
  // NOTE: the connections table has no token-expiry column — the OAuth token
  // (and its expiry) lives in Vault, referenced by vault_secret_id. Connection
  // health is tracked here via is_valid + last_validated_at, so that's what we
  // expose. Selecting a non-existent token_expires_at column previously made this
  // tool error, which stalled agents on ask_user ("provide token expiry").
  const { data, error } = await service
    .from("connections")
    .select("id, name, provider, is_valid, last_validated_at, workspace_id")
    .in("workspace_id", workspaceIds)
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: { connections: data ?? [] } };
}

async function searchKnowledge(
  service: LooseClient,
  userId: string,
  workspaceIds: string[],
  context: AgentToolContext,
  args: Record<string, unknown>
): Promise<AgentToolResult> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { ok: false, error: "query (string) is required." };
  const limit = asInt(args.limit, 3, 10);

  // Semantic search over embedded chunks, keyword fallback when embeddings are
  // unavailable. Shared with the knowledge page's retrieval preview.
  const result = await searchKnowledgeBase(service, workspaceIds, query, limit);
  if ("error" in result) return { ok: false, error: result.error };

  // Record reads_source edges (agent → each knowledge doc it pulled) so the Flow
  // view shows what the agent actually read. Best-effort; ids aren't returned to
  // the model.
  const acting = await resolveActingProgram(service, userId, context.runId);
  if (acting) {
    for (const knowledgeId of result.sourceIds.slice(0, 8)) {
      await recordRelation(service, {
        workspace_id: acting.workspaceId,
        from_program_id: acting.programId,
        rel_type: "reads_source",
        target_kind: "knowledge",
        target_knowledge_id: knowledgeId,
        run_id: context.runId ?? null,
      });
    }
  }

  const { sourceIds: _omit, ...visible } = result;
  return { ok: true, result: visible };
}

async function getAccountStats(service: LooseClient, userId: string, workspaceIds: string[]): Promise<AgentToolResult> {
  const [workflows, agents, activeWorkflows, activeAgents, connections, recentRuns] = await Promise.all([
    service.from("programs").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds).eq("program_type", "workflow"),
    service.from("programs").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds).eq("program_type", "agent"),
    service.from("programs").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds).eq("program_type", "workflow").eq("is_active", true),
    service.from("programs").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds).eq("program_type", "agent").eq("is_active", true),
    service.from("connections").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds),
    service.from("runs").select("status").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
  ]);
  const runRows = (recentRuns.data ?? []) as Array<{ status: string }>;
  const runsByStatus = runRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const activeWorkflowCount = activeWorkflows.count ?? 0;
  const activeAgentCount = activeAgents.count ?? 0;
  return {
    ok: true,
    result: {
      workflow_count: workflows.count ?? 0,
      agent_count: agents.count ?? 0,
      active_workflow_count: activeWorkflowCount,
      active_agent_count: activeAgentCount,
      // Total programs (workflows + agents) currently toggled on / live.
      active_program_count: activeWorkflowCount + activeAgentCount,
      connection_count: connections.count ?? 0,
      recent_runs_by_status: runsByStatus,
      recent_runs_sampled: runRows.length,
    },
  };
}

/**
 * Relay a structured report back to the user. Read-safe (no account mutation),
 * so it runs in dry runs too. The report is tied to the executing run; the run
 * is re-verified to belong to the acting user before anything is stored.
 */
async function reportToUser(
  service: LooseClient,
  userId: string,
  context: AgentToolContext,
  args: Record<string, unknown>
): Promise<AgentToolResult> {
  if (!context.runId) {
    return { ok: false, error: "No run context available to attach the report to." };
  }
  const title = typeof args.title === "string" && args.title.trim() ? args.title.trim().slice(0, 200) : "Report";
  const bodyRaw = typeof args.body === "string" ? args.body : "";
  const body = bodyRaw.trim().slice(0, 20000);
  if (!body) return { ok: false, error: "body (string) is required and cannot be empty." };
  const baseData = args.data && typeof args.data === "object" && !Array.isArray(args.data)
    ? (args.data as Record<string, unknown>)
    : {};
  // The agent's verified self-assessment (success/partial/failed) — stored in the
  // report data so the UI/inbox/email can show a clear "did it work?" signal.
  const outcome = args.outcome === "success" || args.outcome === "partial" || args.outcome === "failed"
    ? args.outcome
    : null;
  const data = outcome ? { ...baseData, outcome } : (Object.keys(baseData).length > 0 ? baseData : null);

  // Re-derive program ownership from the run — never trust client-supplied ids.
  const { data: runRow } = await service
    .from("runs")
    .select("id, program_id, user_id")
    .eq("id", context.runId)
    .maybeSingle();
  const run = runRow as { id: string; program_id: string; user_id: string | null } | null;
  if (!run || run.user_id !== userId) {
    return { ok: false, error: "Run not found or not accessible." };
  }

  const { data: inserted, error } = await service
    .from("agent_reports")
    .insert({
      run_id: run.id,
      program_id: run.program_id,
      user_id: userId,
      title,
      body,
      data,
      dry_run: context.dryRun,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    result: { report_id: (inserted as { id: string }).id, delivered: true },
  };
}

// ─── Write tools ─────────────────────────────────────────────────────────────

async function setProgramActive(service: LooseClient, workspaceIds: string[], args: Record<string, unknown>): Promise<AgentToolResult> {
  const programId = typeof args.program_id === "string" ? args.program_id : null;
  if (!programId) return { ok: false, error: "program_id is required." };
  if (typeof args.is_active !== "boolean") return { ok: false, error: "is_active (boolean) is required." };
  const { data, error } = await service
    .from("programs")
    .update({ is_active: args.is_active, updated_at: new Date().toISOString() } as never)
    .eq("id", programId)
    .in("workspace_id", workspaceIds)
    .select("id, name, is_active")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Program not found or not accessible." };
  return { ok: true, result: { program: data } };
}

async function triggerProgram(service: LooseClient, userId: string, workspaceIds: string[], args: Record<string, unknown>): Promise<AgentToolResult> {
  const programId = typeof args.program_id === "string" ? args.program_id : null;
  if (!programId) return { ok: false, error: "program_id is required." };
  const { data: prog } = await service
    .from("programs")
    .select("id, schema_version, program_type, workspace_id")
    .eq("id", programId)
    .in("workspace_id", workspaceIds)
    .maybeSingle();
  const program = prog as { id: string; schema_version: number | null; program_type: string | null } | null;
  if (!program) return { ok: false, error: "Program not found or not accessible." };
  if (program.program_type === "agent") {
    return { ok: false, error: "Agents cannot be triggered as background workflows." };
  }

  const { data: runRaw, error: runError } = await service
    .from("runs")
    .insert({
      program_id: programId,
      user_id: userId,
      workflow_version: program.schema_version ?? null,
      triggered_by: "agent",
      trigger_source: "agent",
      status: "pending",
      started_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  if (runError || !runRaw) return { ok: false, error: runError?.message ?? "Could not create run." };
  const runId = (runRaw as { id: string }).id;

  // The runtime loads the schema/user from the run+program rows by run_id (S15),
  // so the dispatch body only needs the run id.
  const runtimeBody = JSON.stringify({ run_id: runId });
  try {
    const res = await fetch(`${getRuntimeUrl()}/execute`, {
      method: "POST",
      headers: buildRuntimeExecuteHeaders(runtimeBody),
      body: runtimeBody,
    });
    if (!res.ok) {
      return { ok: false, error: `Run ${runId} created but dispatch failed (HTTP ${res.status}).` };
    }
  } catch (err) {
    return { ok: false, error: `Run ${runId} created but dispatch failed: ${err instanceof Error ? err.message : "unknown"}` };
  }
  return { ok: true, result: { run_id: runId, status: "dispatched" } };
}

async function createWorkflow(service: LooseClient, userId: string, context: AgentToolContext, args: Record<string, unknown>): Promise<AgentToolResult> {
  const parsed = ProgramSchemaZ.safeParse(args.schema);
  if (!parsed.success) {
    return { ok: false, error: `Invalid workflow schema: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join("; ")}` };
  }
  const schema = parsed.data;
  // Agents may only create workflows, never more agents, via this tool.
  schema.program_type = "workflow";
  const workspaceId = typeof args.workspace_id === "string" ? args.workspace_id : context.homeWorkspaceId;
  const { data, error } = await service
    .from("programs")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      name: schema.program_name,
      description: schema.metadata?.description ?? "",
      schema: schema as unknown as Record<string, unknown>,
      execution_mode: schema.execution_mode === "approval_required" ? "supervised" : schema.execution_mode,
      program_type: "workflow",
      is_active: false,
    } as never)
    .select("id, name")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create workflow." };
  return { ok: true, result: { program: data, created: true } };
}

async function updateProgram(service: LooseClient, workspaceIds: string[], args: Record<string, unknown>): Promise<AgentToolResult> {
  const programId = typeof args.program_id === "string" ? args.program_id : null;
  if (!programId) return { ok: false, error: "program_id is required." };
  const parsed = ProgramSchemaZ.safeParse(args.schema);
  if (!parsed.success) {
    return { ok: false, error: `Invalid schema: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join("; ")}` };
  }
  const schema = parsed.data;

  const { data: existing } = await service
    .from("programs")
    .select("id, schema_version, program_type")
    .eq("id", programId)
    .in("workspace_id", workspaceIds)
    .maybeSingle();
  const existingRow = existing as { id: string; schema_version: number | null; program_type: string | null } | null;
  if (!existingRow) return { ok: false, error: "Program not found or not accessible." };
  // Preserve the discriminator — the tool edits content, not the program kind.
  schema.program_type = (existingRow.program_type as "workflow" | "agent") ?? "workflow";

  const nextVersion = (existingRow.schema_version ?? 0) + 1;
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("programs")
    .update({
      name: schema.program_name,
      schema: schema as unknown as Record<string, unknown>,
      execution_mode: schema.execution_mode === "approval_required" ? "supervised" : schema.execution_mode,
      schema_version: nextVersion,
      updated_at: now,
    } as never)
    .eq("id", programId)
    .in("workspace_id", workspaceIds)
    .select("id, name, schema_version")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Update failed." };
  await service.from("program_versions").insert({
    program_id: programId,
    version: nextVersion,
    schema: schema as unknown as Record<string, unknown>,
    change_summary: "Agent edit",
  } as never);
  return { ok: true, result: { program: data, updated: true } };
}

// ─── Agent-relation tools (spawn / cross-check / read report / sources) ───────

/** Insert a relation edge. Best-effort: a dup-key (already-recorded edge) or a
 * transient failure just means the edge isn't (re)drawn — never block the tool. */
async function recordRelation(service: LooseClient, row: Record<string, unknown>): Promise<void> {
  try {
    await service.from("agent_relations").insert(row as never);
  } catch {
    /* ignore */
  }
}

/** The agent that is acting (the parent/owner of this run), derived from the run
 * — never trust a client-supplied program id. Returns its workspace + lineage. */
async function resolveActingProgram(
  service: LooseClient,
  userId: string,
  runId?: string
): Promise<{
  programId: string;
  workspaceId: string;
  lineageId: string;
  capabilities: Record<string, unknown>;
} | null> {
  if (!runId) return null;
  const { data: runRow } = await service
    .from("runs")
    .select("program_id, user_id")
    .eq("id", runId)
    .maybeSingle();
  const run = runRow as { program_id: string; user_id: string | null } | null;
  if (!run || run.user_id !== userId) return null;
  const { data: progRow } = await service
    .from("programs")
    .select("id, workspace_id, metadata:schema->metadata")
    .eq("id", run.program_id)
    .maybeSingle();
  const prog = progRow as { id: string; workspace_id: string; metadata: Record<string, unknown> | null } | null;
  if (!prog) return null;
  const meta = prog.metadata ?? {};
  const lineageId = typeof meta.agent_lineage_id === "string" ? meta.agent_lineage_id : prog.id;
  const capabilities =
    meta.capabilities && typeof meta.capabilities === "object"
      ? (meta.capabilities as Record<string, unknown>)
      : {};
  return { programId: prog.id, workspaceId: prog.workspace_id, lineageId, capabilities };
}

/** Resolve a target AGENT by program_id / agent / name, scoped to the user's
 * workspaces. Mirrors getProgram's UUID-then-name resolution. */
async function resolveAgentByIdOrName(
  service: LooseClient,
  workspaceIds: string[],
  args: Record<string, unknown>
): Promise<{ id: string; name: string; workspaceId: string; lineageId: string } | { error: string }> {
  const raw =
    typeof args.program_id === "string" && args.program_id.trim()
      ? args.program_id.trim()
      : typeof args.agent === "string" && args.agent.trim()
        ? args.agent.trim()
        : typeof args.name === "string"
          ? args.name.trim()
          : "";
  if (!raw) return { error: "Provide the agent's program_id or name." };
  const sel = "id, name, workspace_id, program_type, metadata:schema->metadata";

  let rows: Array<Record<string, any>> = [];
  if (isUuid(raw)) {
    const { data } = await service
      .from("programs")
      .select(sel)
      .eq("id", raw)
      .eq("program_type", "agent")
      .in("workspace_id", workspaceIds)
      .limit(1);
    rows = (data ?? []) as Array<Record<string, any>>;
  }
  if (rows.length === 0) {
    const escaped = raw.replace(/[%_]/g, (m) => `\\${m}`);
    let { data } = await service
      .from("programs")
      .select(sel)
      .eq("program_type", "agent")
      .in("workspace_id", workspaceIds)
      .ilike("name", escaped)
      .limit(5);
    rows = (data ?? []) as Array<Record<string, any>>;
    if (rows.length === 0) {
      ({ data } = await service
        .from("programs")
        .select(sel)
        .eq("program_type", "agent")
        .in("workspace_id", workspaceIds)
        .ilike("name", `%${escaped}%`)
        .limit(5));
      rows = (data ?? []) as Array<Record<string, any>>;
    }
  }
  if (rows.length === 0) return { error: `No agent found matching "${raw}".` };
  if (rows.length > 1) {
    const candidates = rows.map((r) => `${String(r.name)} (${String(r.id)})`).join(", ");
    return { error: `Multiple agents match "${raw}": ${candidates}. Use the exact program_id.` };
  }
  const r = rows[0];
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const lineageId = typeof meta.agent_lineage_id === "string" ? meta.agent_lineage_id : (r.id as string);
  return { id: r.id as string, name: r.name as string, workspaceId: r.workspace_id as string, lineageId };
}

/** True when two agents are directly related: a spawn edge either direction, or
 * the same lineage (re-runs of one another). Bounds what read_agent_report sees. */
async function areAgentsRelated(
  service: LooseClient,
  acting: { programId: string; lineageId: string },
  target: { id: string; lineageId: string }
): Promise<boolean> {
  if (acting.lineageId && acting.lineageId === target.lineageId) return true;
  const { data: spawnedByMe } = await service
    .from("agent_relations")
    .select("id")
    .eq("rel_type", "spawns")
    .eq("from_program_id", acting.programId)
    .eq("target_program_id", target.id)
    .limit(1);
  if (((spawnedByMe ?? []) as unknown[]).length > 0) return true;
  const { data: spawnedMe } = await service
    .from("agent_relations")
    .select("id")
    .eq("rel_type", "spawns")
    .eq("from_program_id", target.id)
    .eq("target_program_id", acting.programId)
    .limit(1);
  return ((spawnedMe ?? []) as unknown[]).length > 0;
}

/** Record a peer cross-check link and return the peer's latest report excerpt. */
async function referenceAgent(
  service: LooseClient,
  userId: string,
  workspaceIds: string[],
  context: AgentToolContext,
  args: Record<string, unknown>
): Promise<AgentToolResult> {
  const acting = await resolveActingProgram(service, userId, context.runId);
  if (!acting) return { ok: false, error: "No run context to attribute the reference to." };
  const target = await resolveAgentByIdOrName(service, workspaceIds, args);
  if ("error" in target) return { ok: false, error: target.error };
  if (target.id === acting.programId) return { ok: false, error: "An agent cannot cross-check itself." };

  const note = typeof args.note === "string" ? args.note.slice(0, 500) : null;
  await recordRelation(service, {
    workspace_id: acting.workspaceId,
    from_program_id: acting.programId,
    rel_type: "cross_check",
    target_kind: "agent",
    target_program_id: target.id,
    label: note,
    run_id: context.runId ?? null,
  });

  const { data: rep } = await service
    .from("agent_reports")
    .select("title, body, created_at")
    .eq("program_id", target.id)
    .eq("dry_run", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const report = rep as { title: string | null; body: string | null; created_at: string } | null;
  return {
    ok: true,
    result: {
      agent: { id: target.id, name: target.name },
      latest_report: report
        ? { title: report.title ?? "Report", excerpt: (report.body ?? "").slice(0, 2000), created_at: report.created_at }
        : null,
      cross_checked: true,
    },
  };
}

/** Read the report(s) of a related agent (one you spawned / that spawned you /
 * a re-run), recording the feeds edge (their output feeds you). */
async function readAgentReport(
  service: LooseClient,
  userId: string,
  workspaceIds: string[],
  context: AgentToolContext,
  args: Record<string, unknown>
): Promise<AgentToolResult> {
  const acting = await resolveActingProgram(service, userId, context.runId);
  if (!acting) return { ok: false, error: "No run context available." };
  const target = await resolveAgentByIdOrName(service, workspaceIds, args);
  if ("error" in target) return { ok: false, error: target.error };
  if (target.id === acting.programId) return { ok: false, error: "Use report_to_user for your own report." };

  const related = await areAgentsRelated(service, acting, target);
  if (!related) {
    return {
      ok: false,
      error: `You can only read reports of agents you spawned, that spawned you, or re-runs of the same agent. "${target.name}" is not related to you.`,
    };
  }

  const { data: reps } = await service
    .from("agent_reports")
    .select("title, body, created_at")
    .eq("program_id", target.id)
    .eq("dry_run", false)
    .order("created_at", { ascending: false })
    .limit(3);
  const reports = ((reps ?? []) as Array<{ title: string | null; body: string | null; created_at: string }>)
    .map((r) => ({ title: r.title ?? "Report", body: (r.body ?? "").slice(0, 4000), created_at: r.created_at }))
    .filter((r) => r.body.trim().length > 0);
  if (reports.length === 0) {
    return { ok: true, result: { agent: { id: target.id, name: target.name }, reports: [], note: "That agent has no completed report yet." } };
  }

  await recordRelation(service, {
    workspace_id: acting.workspaceId,
    from_program_id: target.id,
    rel_type: "feeds",
    target_kind: "agent",
    target_program_id: acting.programId,
    run_id: context.runId ?? null,
  });
  return { ok: true, result: { agent: { id: target.id, name: target.name }, reports } };
}

/** Escalate a critical message into the user's "Flagged for review" inbox. */
async function flagCritical(
  service: LooseClient,
  userId: string,
  context: AgentToolContext,
  args: Record<string, unknown>
): Promise<AgentToolResult> {
  const acting = await resolveActingProgram(service, userId, context.runId);
  if (!acting) return { ok: false, error: "No run context to attach the flag to." };
  const reason = typeof args.reason === "string" ? args.reason.trim().slice(0, 1000) : "";
  if (!reason) return { ok: false, error: "reason (why this is critical) is required." };
  const subject =
    typeof args.subject === "string" && args.subject.trim() ? args.subject.trim().slice(0, 200) : "Flagged message";
  const snippet = typeof args.snippet === "string" ? args.snippet.slice(0, 1000) : null;
  const categories = Array.isArray(args.categories)
    ? args.categories.filter((c): c is string => typeof c === "string").slice(0, 8)
    : [];
  const sourceRef = typeof args.source_ref === "string" ? args.source_ref.slice(0, 200) : null;
  const sourceProvider = typeof args.source_provider === "string" ? args.source_provider.slice(0, 60) : null;
  // origin distinguishes the deterministic auto-screen from an agent escalation.
  const origin = args.origin === "auto" ? "auto" : "agent";

  const { data, error } = await service
    .from("agent_flags")
    .insert({
      workspace_id: acting.workspaceId,
      program_id: acting.programId,
      run_id: context.runId ?? null,
      user_id: userId,
      source_provider: sourceProvider,
      source_ref: sourceRef,
      subject,
      snippet,
      reason,
      categories,
      origin,
      status: "pending",
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Alert the user by email (gated by their security_alerts preference). Best-
  // effort — a mail failure must not fail the flag itself.
  try {
    if (await isNotificationEnabled(userId, "security_alerts")) {
      const { data: authData } = await (service as unknown as {
        auth: { admin: { getUserById(id: string): Promise<{ data: { user: { email?: string | null } | null } }> } };
      }).auth.admin.getUserById(userId);
      const email = authData?.user?.email ?? null;
      if (email) {
        await sendSecurityAlertEmail({
          to: email,
          subject: `URGENT: a message was flagged for review`,
          summary:
            "An agent flagged a potentially safety-critical message instead of triaging it away. Review it in Corelyx before it's lost.",
          items: [{ title: subject, body: [reason, snippet ? `“${snippet}”` : ""].filter(Boolean).join("\n\n") }],
        });
      }
    }
  } catch {
    /* notification is best-effort */
  }

  return {
    ok: true,
    result: { flag_id: (data as { id: string }).id, flagged: true, note: "Flagged for the user's review and alerted." },
  };
}

/** Internal: record a connector reads_source edge (called by the runtime after a
 * native connector read). Never errors the originating connector call. */
async function recordSourceTool(
  service: LooseClient,
  userId: string,
  context: AgentToolContext,
  args: Record<string, unknown>
): Promise<AgentToolResult> {
  const acting = await resolveActingProgram(service, userId, context.runId);
  const kind = typeof args.kind === "string" ? args.kind : "connector";
  const name = typeof args.name === "string" ? args.name.trim().slice(0, 120) : "";
  if (!acting || kind !== "connector" || !name) return { ok: true, result: { recorded: false } };
  await recordRelation(service, {
    workspace_id: acting.workspaceId,
    from_program_id: acting.programId,
    rel_type: "reads_source",
    target_kind: "connector",
    target_label: name,
    run_id: context.runId ?? null,
  });
  return { ok: true, result: { recorded: true } };
}

/** Spawn a child agent as a DRAFT in the parent's workspace (the user reviews +
 * approves it before it runs) and record the spawns edge. */
async function spawnAgent(
  service: LooseClient,
  userId: string,
  context: AgentToolContext,
  args: Record<string, unknown>
): Promise<AgentToolResult> {
  const acting = await resolveActingProgram(service, userId, context.runId);
  if (!acting) return { ok: false, error: "No run context: cannot attribute the spawned agent to a parent." };

  // Per-agent spawn policy (set by the user in Permissions): allowed at all, and
  // how many children per run. Defaults preserve prior behaviour.
  const caps = acting.capabilities;
  if (caps.allow_spawning === false) {
    return { ok: false, error: "Spawning sub-agents is disabled for this agent by the user." };
  }
  const cap =
    typeof caps.max_spawns === "number" && Number.isFinite(caps.max_spawns)
      ? Math.max(0, Math.min(Math.floor(caps.max_spawns), MAX_SPAWNS_HARD_CEILING))
      : DEFAULT_MAX_SPAWNS_PER_RUN;
  if (cap <= 0) {
    return { ok: false, error: "Spawning sub-agents is disabled for this agent (max set to 0)." };
  }

  const objective =
    typeof args.objective === "string" && args.objective.trim()
      ? args.objective.trim()
      : typeof args.task === "string"
        ? args.task.trim()
        : "";
  if (!objective) return { ok: false, error: "objective (string) is required — describe the child agent's goal." };
  const name = (typeof args.name === "string" && args.name.trim() ? args.name.trim() : objective.slice(0, 60)).slice(0, 120);
  const reason = typeof args.reason === "string" ? args.reason.slice(0, 500) : null;

  const { count } = await service
    .from("agent_relations")
    .select("id", { count: "exact", head: true })
    .eq("from_program_id", acting.programId)
    .eq("rel_type", "spawns")
    .eq("run_id", context.runId ?? "");
  if ((count ?? 0) >= cap) {
    return { ok: false, error: `Spawn limit reached (${cap} per run). Handle the rest yourself or report what you have.` };
  }

  const seedSchema = {
    program_name: name,
    program_type: "agent",
    metadata: {
      description: objective,
      agent_lineage_id: acting.lineageId,
      spawned_from: acting.programId,
      spawn_objective: objective,
      ...(reason ? { spawn_reason: reason } : {}),
    },
    nodes: [],
    edges: [],
  };
  const { data, error } = await service
    .from("programs")
    .insert({
      user_id: userId,
      workspace_id: acting.workspaceId,
      name,
      description: objective.slice(0, 500),
      schema: seedSchema as unknown as Record<string, unknown>,
      program_type: "agent",
      agent_state: "draft",
      is_active: false,
    } as never)
    .select("id, name")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create the child agent." };
  const child = data as { id: string; name: string };

  // Editor membership so it surfaces for the user (mirrors cloneAgentProgram).
  await recordRelation(service, {
    workspace_id: acting.workspaceId,
    from_program_id: acting.programId,
    rel_type: "spawns",
    target_kind: "agent",
    target_program_id: child.id,
    label: reason,
    run_id: context.runId ?? null,
  });
  try {
    await service.from("program_memberships").insert({ program_id: child.id, user_id: userId, role: "editor" } as never);
  } catch {
    /* membership is best-effort; the program is still visible via workspace scope */
  }

  return {
    ok: true,
    result: {
      child: { id: child.id, name: child.name },
      status: "draft",
      note: "Created as a draft in the user's Agents list. The user reviews and approves it before it runs — it does not run automatically.",
    },
  };
}
