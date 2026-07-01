import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canView, getProgramAccess } from "@/lib/workspaces";
import { collectAgentAudit } from "@/lib/compliance/agent-audit";

// GET /api/agents/[id]/audit — downloadable JSON audit of every action this agent
// took across all its runs (tool calls, outcomes, reports). Backs the governance
// story: an exportable, reasoning-linked record of what the agent did (EU AI Act
// Art. 12/14-style logging). Tool arguments are never stored, so none leak here.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: programId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(programId, user.id);
  if (!canView(access)) return apiError("Agent not found", 404);

  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };

  const { data: progRow } = await service
    .from("programs")
    .select("id, name, program_type")
    .eq("id", programId)
    .maybeSingle();
  const program = progRow as { id: string; name: string; program_type: string | null } | null;
  if (!program || program.program_type !== "agent") return apiError("Agent not found", 404);

  const auditData = await collectAgentAudit(service, { id: program.id, name: program.name });

  const audit = {
    agent: auditData.agent,
    exported_at: new Date().toISOString(),
    exported_by: user.id,
    run_count: auditData.run_count,
    runs: auditData.runs,
  };

  const filename = `agent-${program.id}-audit.json`;
  return new NextResponse(JSON.stringify(audit, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
