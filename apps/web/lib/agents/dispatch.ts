import type { createServiceClient } from "@/lib/api";
import { checkAgentAccess, checkRunLimit } from "@/lib/limits";
import { gatherPriorReports } from "@/lib/agents/lineage";
import { buildClonedAgentSchema } from "@/lib/agents/lineage";
import { KEY_DEFAULT_MODELS, KEY_PROVIDER_PRIORITY, PLATFORM_DEFAULT_MODEL } from "@/lib/genesis/request";
import { getRuntimeUrl } from "@/lib/runtime-url";
import { buildRuntimeExecuteHeaders } from "@/lib/runtime-dispatch";
import { serverLog } from "@/lib/server-log";

type Service = ReturnType<typeof createServiceClient> & { from(t: string): any };

type AgentCredential = { ref: string; model: string };

export type AgentDispatchResult =
  | { ok: true; runId: string }
  | { ok: false; error: string; status: number };

/**
 * Build ordered credential candidates for an agent's AI nodes (user keys by
 * provider priority, then the platform key), baking the first into any
 * "__USER_ASSIGNED__" placeholders and persisting. Pure of HTTP concerns so it
 * can run from routes, cron, and webhooks alike.
 */
async function resolveAgentCredentials(
  service: Service,
  programId: string,
  workspaceId: string,
  rawSchema: Record<string, unknown> | null
): Promise<{ error: string | null; candidates: AgentCredential[] }> {
  const schema = (rawSchema ?? {}) as { nodes?: Array<Record<string, any>> };
  const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const isAiNode = (n: Record<string, any>) => n?.type === "agent" || n?.type === "agent_task";
  if (!nodes.some(isAiNode)) return { error: null, candidates: [] };

  const { data: keyRows } = await service
    .from("api_keys")
    .select("id, provider")
    .eq("workspace_id", workspaceId)
    .eq("is_valid", true);
  const keys = ((keyRows ?? []) as Array<{ id: string; provider: string }>).sort(
    (a, b) => (KEY_PROVIDER_PRIORITY[a.provider] ?? 99) - (KEY_PROVIDER_PRIORITY[b.provider] ?? 99)
  );

  const candidates: AgentCredential[] = keys.map((k) => ({
    ref: k.id,
    model: KEY_DEFAULT_MODELS[k.provider] ?? PLATFORM_DEFAULT_MODEL,
  }));
  if (process.env.PLATFORM_OPENROUTER_API_KEY) {
    candidates.push({ ref: "platform", model: PLATFORM_DEFAULT_MODEL });
  }
  if (candidates.length === 0) {
    return { error: "No API key available to run this agent. Add one in Settings → API Keys.", candidates: [] };
  }

  const first = candidates[0]!;
  let changed = false;
  for (const n of nodes) {
    if (isAiNode(n) && n?.config) {
      if (n.config.api_key_ref === "__USER_ASSIGNED__") { n.config.api_key_ref = first.ref; changed = true; }
      if (n.config.model === "__USER_ASSIGNED__") { n.config.model = first.model; changed = true; }
    }
  }
  if (changed) {
    const { error } = await service
      .from("programs")
      .update({ schema: schema as unknown as Record<string, unknown>, updated_at: new Date().toISOString() } as never)
      .eq("id", programId);
    if (error) return { error: "Could not prepare the agent for running.", candidates };
  }
  return { error: null, candidates };
}

/**
 * Create a run for an agent program and dispatch it to the runtime. Shared by
 * the manual run route and the trigger-fire paths. Handles credentials, the
 * active-run guard, the run-limit check, cross-run memory, and runtime dispatch.
 *
 * Caller is responsible for upstream gating (auth, agent entitlement, workspace
 * permission, completed-state check). `triggerExtra` is merged into the runtime
 * trigger_payload (e.g. a webhook/event payload the agent should see).
 */
export async function dispatchAgentRun(
  service: Service,
  opts: {
    programId: string;
    userId: string;
    workspaceId: string;
    triggeredBy: string;
    dryRun?: boolean;
    triggerExtra?: Record<string, unknown>;
  }
): Promise<AgentDispatchResult> {
  const { programId, userId, workspaceId, triggeredBy } = opts;
  const dryRun = opts.dryRun === true;

  const { data: prog } = await service
    .from("programs")
    .select("id, program_type, schema_version, schema")
    .eq("id", programId)
    .maybeSingle();
  const program = prog as {
    id: string; program_type: string | null; schema_version: number | null; schema: Record<string, unknown> | null;
  } | null;
  if (!program) return { ok: false, error: "Agent not found.", status: 404 };
  if (program.program_type !== "agent") return { ok: false, error: "This program is not an agent.", status: 400 };

  const cred = await resolveAgentCredentials(service, programId, workspaceId, program.schema);
  if (cred.error) return { ok: false, error: cred.error, status: 402 };

  const { data: activeRun } = await service
    .from("runs")
    .select("id")
    .eq("program_id", programId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();
  if (activeRun) return { ok: false, error: "This agent is already running.", status: 409 };

  const limit = await checkRunLimit(userId, workspaceId);
  if (!limit.allowed) {
    return { ok: false, error: limit.upgradeMessage ?? "Run limit reached.", status: 403 };
  }

  const { data: runRaw, error: runError } = await service
    .from("runs")
    .insert({
      program_id: programId,
      user_id: userId,
      workflow_version: program.schema_version ?? null,
      triggered_by: triggeredBy,
      trigger_source: "agent",
      status: "pending",
      started_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  if (runError || !runRaw) return { ok: false, error: runError?.message ?? "Could not create run.", status: 500 };
  const runId = (runRaw as { id: string }).id;

  await service
    .from("programs")
    .update({ agent_state: "running", updated_at: new Date().toISOString() } as never)
    .eq("id", programId);

  const priorReports = await gatherPriorReports(service, workspaceId, programId, program.schema, runId);

  const runtimeBody = JSON.stringify({
    run_id: runId,
    trigger_payload: {
      ...(dryRun ? { __dry_run__: true } : {}),
      ...(cred.candidates.length > 0 ? { __agent_credentials__: cred.candidates } : {}),
      ...(priorReports.length > 0 ? { __prior_reports__: priorReports } : {}),
      ...(opts.triggerExtra ?? {}),
    },
  });
  try {
    const res = await fetch(`${getRuntimeUrl()}/execute`, {
      method: "POST",
      headers: buildRuntimeExecuteHeaders(runtimeBody),
      body: runtimeBody,
    });
    if (!res.ok) {
      serverLog({ level: "error", event: "agent.run.dispatch_failed", message: "Agent run dispatch failed.", details: { status: res.status, triggeredBy } });
      await service.from("programs").update({ agent_state: "failed" } as never).eq("id", programId);
      return { ok: false, error: `Agent run created but dispatch failed (HTTP ${res.status}).`, status: 502 };
    }
  } catch (err) {
    await service.from("programs").update({ agent_state: "failed" } as never).eq("id", programId);
    return { ok: false, error: `Agent run created but dispatch failed: ${err instanceof Error ? err.message : "unknown"}`, status: 502 };
  }

  return { ok: true, runId };
}

/**
 * Clone an agent program into a fresh one-time agent (awaiting_approval) with
 * lineage stamped, copying connection links and editor membership. Shared by the
 * manual "Run again" clone route and the trigger-fire paths (each fire is a fresh
 * lineage run, which is what keeps a standing agent distinct from a workflow).
 */
export async function cloneAgentProgram(
  service: Service,
  source: { id: string; name: string; description: string | null; schema: Record<string, unknown> | null; execution_mode: string | null },
  userId: string,
  workspaceId: string
): Promise<{ ok: true; program: { id: string; name: string } } | { ok: false; error: string }> {
  const schema = buildClonedAgentSchema(source.schema, source.id, crypto.randomUUID());

  const { data: rawProgram, error: insertError } = await service
    .from("programs")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      name: source.name,
      description: source.description ?? "",
      schema: schema as unknown as Record<string, unknown>,
      execution_mode: source.execution_mode ?? "supervised",
      program_type: "agent",
      agent_state: "awaiting_approval",
      is_active: false,
    } as never)
    .select("id, name")
    .single();
  const program = rawProgram as { id: string; name: string } | null;
  if (insertError || !program) return { ok: false, error: insertError?.message ?? "Could not create the agent." };

  const { data: srcConns } = await service
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", source.id);
  const connRows = (srcConns ?? []) as Array<{ connection_id: string }>;

  await Promise.all([
    service.from("program_memberships").insert({
      program_id: program.id,
      user_id: userId,
      role: "editor",
      created_by: userId,
    } as never),
    connRows.length > 0
      ? service.from("program_connections").insert(
          connRows.map((c) => ({ program_id: program.id, connection_id: c.connection_id })) as never
        )
      : Promise.resolve({ error: null }),
  ]);

  return { ok: true, program };
}

/**
 * Fire a standing agent from a trigger. The agent re-runs IN PLACE — a fresh run
 * on the same program, reasoning from scratch with memory of its own past runs.
 * This is what keeps a standing agent distinct from a workflow (it re-reasons each
 * fire) while avoiding the program-row explosion a clone-per-fire would cause.
 * Returns the new run id or an error. Caller handles trigger-type entitlement +
 * processing-restriction gating; an already-running agent skips the fire (409).
 */
export async function fireAgentTrigger(
  service: Service,
  source: { id: string; user_id: string; workspace_id: string },
  triggeredBy: string,
  triggerExtra?: Record<string, unknown>
): Promise<AgentDispatchResult> {
  // Agents are Solo+ — a standing agent must stop firing if the owner downgrades.
  const agentAccess = await checkAgentAccess(source.user_id, source.workspace_id);
  if (!agentAccess.allowed) {
    return { ok: false, error: agentAccess.upgradeMessage ?? "Agents require an upgrade.", status: 403 };
  }

  return dispatchAgentRun(service, {
    programId: source.id,
    userId: source.user_id,
    workspaceId: source.workspace_id,
    triggeredBy,
    triggerExtra,
  });
}
