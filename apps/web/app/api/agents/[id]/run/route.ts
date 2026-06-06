import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { ensureProcessingAllowed } from "@/lib/compliance";
import { canRun, canView, canRunAgentInWorkspace, getProgramAccess } from "@/lib/workspaces";
import { checkRunLimit } from "@/lib/limits";
import { KEY_DEFAULT_MODELS, KEY_PROVIDER_PRIORITY, PLATFORM_DEFAULT_MODEL } from "@/lib/genesis/request";
import { getRuntimeUrl } from "@/lib/runtime-url";
import { buildRuntimeExecuteHeaders, runtimeDispatchConfigError } from "@/lib/runtime-dispatch";
import { serverLog } from "@/lib/server-log";

// POST /api/agents/[id]/run — run a one-time agent (optionally as a dry run).
// Body: { dry_run?: boolean }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: programId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const processingRestriction = await ensureProcessingAllowed(user.id);
  if (processingRestriction) return processingRestriction;

  const body = (await request.json().catch(() => ({}))) as { dry_run?: unknown };
  const dryRun = body?.dry_run === true;

  const access = await getProgramAccess(programId, user.id);
  if (!canView(access)) return apiError("Agent not found", 404);
  if (!canRun(access)) return apiError("You do not have permission to run this agent.", 403);

  // Agents act on the workspace — enforce the workspace's agent permission.
  if (!(await canRunAgentInWorkspace(access!.workspaceId, user.id))) {
    return apiError("You don't have permission to run agents in this workspace.", 403);
  }

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };
  const { data: prog } = await service
    .from("programs")
    .select("id, program_type, schema_version, agent_state, schema")
    .eq("id", programId)
    .maybeSingle();
  const program = prog as {
    id: string; program_type: string | null; schema_version: number | null;
    agent_state: string | null; schema: Record<string, unknown> | null;
  } | null;
  if (!program) return apiError("Agent not found", 404);
  if (program.program_type !== "agent") return apiError("This program is not an agent.", 400);

  // Agents have no editor step to assign a model/key, so resolve any
  // "__USER_ASSIGNED__" placeholders on agent/agent_task nodes to a real
  // credential now: prefer the user's best BYOK key, else the platform key.
  // Persisted because the runtime loads the schema from the DB (S15).
  const resolveError = await resolveAgentCredentials(service, programId, access!.workspaceId, program.schema);
  if (resolveError) return resolveError;

  // Block only if a run is genuinely still active. Relying on agent_state alone
  // can wedge the agent if a previous run died without reporting completion.
  const { data: activeRun } = await service
    .from("runs")
    .select("id, status")
    .eq("program_id", programId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();
  if (activeRun) return apiError("This agent is already running.", 409);

  // Agents bill like workflows — count against the workspace run allowance.
  const limit = await checkRunLimit(user.id, access!.workspaceId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "RUN_LIMIT_REACHED", message: limit.upgradeMessage ?? "Run limit reached." },
      { status: 403 }
    );
  }

  const { data: runRaw, error: runError } = await service
    .from("runs")
    .insert({
      program_id: programId,
      user_id: user.id,
      workflow_version: program.schema_version ?? null,
      triggered_by: dryRun ? "agent_dry_run" : "agent_manual",
      trigger_source: "agent",
      status: "pending",
      started_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  if (runError || !runRaw) return apiError(runError?.message ?? "Could not create run", 500);
  const runId = (runRaw as { id: string }).id;

  await service
    .from("programs")
    .update({ agent_state: "running", updated_at: new Date().toISOString() } as never)
    .eq("id", programId);

  // The runtime loads schema/user from the run+program rows (S15); it only needs
  // the run id plus the trigger_payload (which carries the dry-run flag).
  const runtimeBody = JSON.stringify({
    run_id: runId,
    trigger_payload: dryRun ? { __dry_run__: true } : {},
  });
  try {
    const res = await fetch(`${getRuntimeUrl()}/execute`, {
      method: "POST",
      headers: buildRuntimeExecuteHeaders(runtimeBody),
      body: runtimeBody,
    });
    if (!res.ok) {
      serverLog({ level: "error", event: "agent.run.dispatch_failed", message: "Agent run dispatch failed.", details: { status: res.status } });
      // Mark the agent failed so the UI doesn't hang on "running".
      await service.from("programs").update({ agent_state: "failed" } as never).eq("id", programId);
      return apiError(`Agent run created but dispatch failed (HTTP ${res.status}).`, 502);
    }
  } catch (err) {
    const configError = runtimeDispatchConfigError(err);
    if (configError) return configError;
    await service.from("programs").update({ agent_state: "failed" } as never).eq("id", programId);
    return apiError(`Agent run created but dispatch failed: ${err instanceof Error ? err.message : "unknown"}`, 502);
  }

  return NextResponse.json({ run_id: runId, dry_run: dryRun });
}

type RunService = ReturnType<typeof createServiceClient> & { from(t: string): any };

/**
 * Replace "__USER_ASSIGNED__" model/api_key_ref on agent/agent_task nodes with a
 * usable credential and persist the schema. Returns an error Response if no
 * credential is available, otherwise null.
 */
async function resolveAgentCredentials(
  service: RunService,
  programId: string,
  workspaceId: string,
  rawSchema: Record<string, unknown> | null
): Promise<Response | null> {
  const schema = (rawSchema ?? {}) as { nodes?: Array<Record<string, any>> };
  const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const isAiNode = (n: Record<string, any>) => n?.type === "agent" || n?.type === "agent_task";
  const needs = nodes.some(
    (n) => isAiNode(n) && n?.config &&
      (n.config.api_key_ref === "__USER_ASSIGNED__" || n.config.model === "__USER_ASSIGNED__")
  );
  if (!needs) return null;

  const { data: keyRows } = await service
    .from("api_keys")
    .select("id, provider")
    .eq("workspace_id", workspaceId)
    .eq("is_valid", true);
  const keys = ((keyRows ?? []) as Array<{ id: string; provider: string }>).sort(
    (a, b) => (KEY_PROVIDER_PRIORITY[a.provider] ?? 99) - (KEY_PROVIDER_PRIORITY[b.provider] ?? 99)
  );
  const best = keys[0];

  let resolvedRef: string;
  let resolvedModel: string;
  if (best) {
    resolvedRef = best.id;
    resolvedModel = KEY_DEFAULT_MODELS[best.provider] ?? PLATFORM_DEFAULT_MODEL;
  } else if (process.env.PLATFORM_OPENROUTER_API_KEY) {
    resolvedRef = "platform";
    resolvedModel = PLATFORM_DEFAULT_MODEL;
  } else {
    return apiError(
      "No API key available to run this agent. Add one in Settings → API Keys.",
      402
    );
  }

  for (const n of nodes) {
    if (isAiNode(n) && n?.config) {
      if (n.config.api_key_ref === "__USER_ASSIGNED__") n.config.api_key_ref = resolvedRef;
      if (n.config.model === "__USER_ASSIGNED__") n.config.model = resolvedModel;
    }
  }

  const { error } = await service
    .from("programs")
    .update({ schema: schema as unknown as Record<string, unknown>, updated_at: new Date().toISOString() } as never)
    .eq("id", programId);
  if (error) return apiError("Could not prepare the agent for running.", 500);
  return null;
}
