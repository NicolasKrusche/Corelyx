import { createServiceClient } from "@/lib/api";
import { canRunAgentInWorkspace } from "@/lib/workspaces";
import { getAgentTool } from "@/lib/genesis/agent-tools";
import { rankKnowledge } from "@/lib/agents/knowledge";
import { getRuntimeUrl } from "@/lib/runtime-url";
import { buildRuntimeExecuteHeaders } from "@/lib/runtime-dispatch";
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
        return await searchKnowledge(service, memberWorkspaceIds, args);
      case "corelyx.report_to_user":
        return await reportToUser(service, userId, context, args);
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
  // create_workflow acts in the agent's home workspace (or an explicit one).
  if (tool === "corelyx.create_workflow") {
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
  const programId = typeof args.program_id === "string" ? args.program_id : null;
  if (!programId) return { ok: false, error: "program_id is required." };
  const { data, error } = await service
    .from("programs")
    .select("id, name, description, program_type, is_active, agent_state, execution_mode, schema, schema_version, created_at, updated_at, workspace_id")
    .eq("id", programId)
    .in("workspace_id", workspaceIds)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Program not found or not accessible." };
  return { ok: true, result: { program: data } };
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

async function searchKnowledge(service: LooseClient, workspaceIds: string[], args: Record<string, unknown>): Promise<AgentToolResult> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { ok: false, error: "query (string) is required." };
  const limit = asInt(args.limit, 3, 10);

  const { data, error } = await service
    .from("agent_knowledge")
    .select("id, title, content")
    .in("workspace_id", workspaceIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };

  const docs = ((data ?? []) as Array<{ id: string; title: string | null; content: string | null }>).map((d) => ({
    id: d.id,
    title: d.title ?? "Untitled",
    content: d.content ?? "",
  }));
  const hits = rankKnowledge(query, docs, limit).map((h) => ({ title: h.title, excerpt: h.excerpt }));
  return { ok: true, result: { results: hits, searched: docs.length } };
}

async function getAccountStats(service: LooseClient, userId: string, workspaceIds: string[]): Promise<AgentToolResult> {
  const [workflows, agents, connections, recentRuns] = await Promise.all([
    service.from("programs").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds).eq("program_type", "workflow"),
    service.from("programs").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds).eq("program_type", "agent"),
    service.from("connections").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds),
    service.from("runs").select("status").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
  ]);
  const runRows = (recentRuns.data ?? []) as Array<{ status: string }>;
  const runsByStatus = runRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    ok: true,
    result: {
      workflow_count: workflows.count ?? 0,
      agent_count: agents.count ?? 0,
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
