import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getValidInternalServiceClaims, diagnoseInternalServiceToken } from "@/lib/internal-auth";
import { executeAgentTool, type AgentToolContext } from "@/lib/agents/tool-execution";
import { serverLog } from "@/lib/server-log";

// POST /api/internal/agent-tools
// Called by the Python runtime while executing an agent_task tool-loop.
// Header: x-internal-service-token (audience "next:agent-tools"), subject = user_id.
// Body: { tool: string, args: object, context: { home_workspace_id, dry_run } }
//
// Security: the token subject identifies the acting user. Write tools re-check
// canRunAgentInWorkspace on the resolved TARGET workspace, and dry-run simulates
// (never executes) write tools — both enforced in executeAgentTool.
export async function POST(request: Request) {
  const binding = { method: "POST", path: new URL(request.url).pathname };
  const claims = getValidInternalServiceClaims(request.headers, "next:agent-tools", binding);
  if (!claims?.sub) {
    // Report WHICH check failed so a 401 here is diagnosable from the logs alone
    // (secret mismatch vs path rewrite vs clock skew). Never logs token/secret.
    const diag = diagnoseInternalServiceToken(request.headers, "next:agent-tools", binding);
    serverLog({
      level: "error",
      event: "agent.tools.auth_rejected",
      message: "Internal agent-tools token rejected.",
      details: { reason: diag.reason, ...diag.detail },
    });
    return apiError("Unauthorized", 401);
  }
  const userId = claims.sub;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const tool = record.tool;
  if (typeof tool !== "string" || !tool) {
    return apiError("tool (string) is required", 400);
  }
  const args =
    record.args && typeof record.args === "object" && !Array.isArray(record.args)
      ? (record.args as Record<string, unknown>)
      : {};
  const rawContext = (record.context ?? {}) as Record<string, unknown>;
  const homeWorkspaceId = typeof rawContext.home_workspace_id === "string" ? rawContext.home_workspace_id : "";
  if (!homeWorkspaceId) {
    return apiError("context.home_workspace_id is required", 400);
  }
  const context: AgentToolContext = {
    homeWorkspaceId,
    dryRun: rawContext.dry_run === true,
    runId: typeof rawContext.run_id === "string" ? rawContext.run_id : undefined,
  };

  const outcome = await executeAgentTool({ userId, tool, args, context });

  if (!outcome.ok) {
    // 200 with ok:false — the runtime feeds tool errors back into the loop so the
    // agent can adapt, rather than aborting the whole run on a recoverable error.
    return NextResponse.json({
      ok: false,
      error: outcome.error,
      ...(outcome.simulated ? { simulated: true } : {}),
    });
  }
  return NextResponse.json({
    ok: true,
    result: outcome.result,
    ...(outcome.simulated ? { simulated: true } : {}),
  });
}
