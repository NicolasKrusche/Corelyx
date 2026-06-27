import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getUserTier } from "@/lib/limits";
import { getEntitlements } from "@/lib/entitlements";
import { AgentsUpsell } from "./_upsell";
import {
  AgentsView,
  type AgentVM,
  type AgentRelationVM,
  type KnowledgeSourceVM,
  type FlagVM,
} from "./agents-view";

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

  // Live reference edges for the Flow view (spawns / cross_check / feeds /
  // reads_source). Degrades gracefully: if the table isn't present yet the
  // select errors, data is null, and the Flow view falls back to the example.
  let relations: AgentRelationVM[] = [];
  let knowledgeSources: KnowledgeSourceVM[] = [];
  if (ws && agents.length > 0) {
    const { data: relRows } = await service
      .from("agent_relations")
      .select(
        "from_program_id, rel_type, target_kind, target_program_id, target_knowledge_id, target_label"
      )
      .eq("workspace_id", ws.workspaceId);
    relations = ((relRows ?? []) as Array<{
      from_program_id: string;
      rel_type: AgentRelationVM["rel"];
      target_kind: AgentRelationVM["targetKind"];
      target_program_id: string | null;
      target_knowledge_id: string | null;
      target_label: string | null;
    }>).map((r) => ({
      from: r.from_program_id,
      rel: r.rel_type,
      targetKind: r.target_kind,
      targetId: r.target_program_id ?? r.target_knowledge_id ?? null,
      targetLabel: r.target_label ?? null,
    }));

    const knowledgeIds = [
      ...new Set(
        relations
          .filter((r) => r.targetKind === "knowledge" && r.targetId)
          .map((r) => r.targetId as string)
      ),
    ];
    if (knowledgeIds.length > 0) {
      const { data: kRows } = await service
        .from("agent_knowledge")
        .select("id, title")
        .in("id", knowledgeIds);
      knowledgeSources = ((kRows ?? []) as Array<{ id: string; title: string | null }>).map((k) => ({
        id: k.id,
        title: k.title ?? "Untitled",
      }));
    }
  }

  // Critical-signal flags awaiting review (deterministic safety screen + agent
  // escalations). Degrades gracefully if the table isn't present yet.
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

  return (
    <AgentsView
      agents={agents}
      relations={relations}
      knowledgeSources={knowledgeSources}
      flags={flags}
    />
  );
}
