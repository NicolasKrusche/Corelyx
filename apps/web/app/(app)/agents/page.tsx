import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";
import { AgentsUpsell } from "./_upsell";
import { AgentsView, type AgentVM } from "./agents-view";

export const metadata = {
  title: "Agents",
  robots: { index: false, follow: false },
};

type AgentRow = {
  id: string;
  name: string;
  description: string | null;
  agent_state: string | null;
  agent_saved_template: boolean | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export default async function AgentsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ws = await getActiveWorkspace(user.id);

  // Agents are a Solo+ feature — Free users see the upsell instead of the list.
  const tier = await getUserTier(user.id, ws?.workspaceId ?? null);
  if (!getEntitlements(tier).agents) {
    return <AgentsUpsell />;
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

  // Project DB rows into the serializable view-model the client view renders.
  const agents: AgentVM[] = rows.map((r) => {
    const meta = r.metadata ?? {};
    const lineageId =
      typeof meta.agent_lineage_id === "string" ? meta.agent_lineage_id : r.id;
    const clonedFrom = typeof meta.cloned_from === "string" ? meta.cloned_from : null;
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
    };
  });

  return <AgentsView agents={agents} />;
}
