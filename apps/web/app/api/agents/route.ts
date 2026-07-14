import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";
import type { AgentVM, FlagVM } from "@/app/(app)/agents/agents-view";

type AgentRow = {
  id: string;
  name: string;
  description: string | null;
  agent_state: string | null;
  agent_saved_template: boolean | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

// GET /api/agents — workspace agents + pending review flags for Corelyx Mobile.
// Read-only mirror of the /agents server page's projection and Solo+ gate.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const ws = await getActiveWorkspace(user.id);

  // Agents are a Solo+ feature — Free users get the upsell gate (same as the page).
  const tier = await getUserTier(user.id, ws?.workspaceId ?? null);
  if (!getEntitlements(tier).agents) {
    return NextResponse.json(
      { error: "AGENTS_REQUIRE_UPGRADE", message: "Agents are available on the Solo plan and above." },
      { status: 403 }
    );
  }

  const service = createServiceClient() as ReturnType<
    typeof createServiceClient
  > & { from(t: string): any };

  let rows: AgentRow[] = [];
  if (ws) {
    const { data } = await service
      .from("programs")
      .select(
        "id, name, description, agent_state, agent_saved_template, created_at, metadata:schema->metadata"
      )
      .eq("workspace_id", ws.workspaceId)
      .eq("program_type", "agent")
      .order("created_at", { ascending: false });
    rows = (data ?? []) as AgentRow[];
  }

  // Inbox signals: which agents have a paused question, and which are scheduled.
  const pendingQuestionIds = new Set<string>();
  const scheduledIds = new Set<string>();
  const agentIds = rows.map((a) => a.id);
  if (agentIds.length > 0) {
    const [{ data: qRows }, { data: trigRows }] = await Promise.all([
      service.from("approvals").select("context").eq("user_id", user.id).eq("status", "pending"),
      service
        .from("triggers")
        .select("program_id, type, is_active")
        .in("program_id", agentIds)
        .eq("is_active", true),
    ]);
    const agentIdSet = new Set(agentIds);
    for (const r of (qRows ?? []) as Array<{ context: Record<string, unknown> | null }>) {
      const pid = r.context?.program_id;
      if (r.context?.kind === "question" && typeof pid === "string" && agentIdSet.has(pid)) {
        pendingQuestionIds.add(pid);
      }
    }
    for (const t of (trigRows ?? []) as Array<{ program_id: string; type: string }>) {
      if (t.type !== "manual") scheduledIds.add(t.program_id);
    }
  }

  // Project DB rows into the serializable view-model the mobile app renders.
  const agents: AgentVM[] = rows.map((r) => {
    const meta = r.metadata ?? {};
    const lineageId =
      typeof meta.agent_lineage_id === "string" ? meta.agent_lineage_id : r.id;
    const clonedFrom = typeof meta.cloned_from === "string" ? meta.cloned_from : null;
    const spawnedFrom = typeof meta.spawned_from === "string" ? meta.spawned_from : null;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      state: r.agent_state ?? "draft",
      createdAt: r.created_at,
      scheduled: scheduledIds.has(r.id),
      hasQuestion: pendingQuestionIds.has(r.id),
      savedTemplate: !!r.agent_saved_template,
      lineageId,
      clonedFrom,
      spawnedFrom,
    };
  });

  // Critical-signal flags awaiting review. Degrades gracefully (empty array) if
  // the agent_flags table isn't present yet — same as the page.
  let flags: FlagVM[] = [];
  if (ws) {
    const { data: flagRows } = await service
      .from("agent_flags")
      .select("id, subject, snippet, reason, categories, origin, source_provider, created_at")
      .eq("workspace_id", ws.workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    flags = ((flagRows ?? []) as Array<{
      id: string;
      subject: string | null;
      snippet: string | null;
      reason: string | null;
      categories: string[] | null;
      origin: string | null;
      source_provider: string | null;
      created_at: string;
    }>).map((f) => ({
      id: f.id,
      subject: f.subject,
      snippet: f.snippet,
      reason: f.reason,
      categories: f.categories ?? [],
      origin: f.origin === "agent" ? "agent" : "auto",
      sourceProvider: f.source_provider,
      createdAt: f.created_at,
    }));
  }

  return NextResponse.json({ agents, flags });
}
