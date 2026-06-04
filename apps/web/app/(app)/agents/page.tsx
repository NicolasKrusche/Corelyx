import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, Plus, Clock3 } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
};

const STATE_LABELS: Record<string, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  discarded: "Discarded",
};

const STATE_VARIANT: Record<string, "secondary" | "warning" | "destructive" | "default"> = {
  awaiting_approval: "warning",
  running: "warning",
  completed: "default",
  failed: "destructive",
  discarded: "secondary",
};

export default async function AgentsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ws = await getActiveWorkspace(user.id);
  const service = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };

  let agents: AgentRow[] = [];
  if (ws) {
    const { data } = await service
      .from("programs")
      .select("id, name, description, agent_state, agent_saved_template, created_at")
      .eq("workspace_id", ws.workspaceId)
      .eq("program_type", "agent")
      .order("created_at", { ascending: false });
    agents = (data ?? []) as AgentRow[];
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Agents</h1>
            <Badge variant="secondary" className="text-[10px]">One-time</Badge>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            One-time agents handle a single, well-defined task — describe it once, approve the plan, and
            run it. Unlike workflows, agents don&apos;t repeat; they finish and step aside.
          </p>
        </div>
        <Link href="/agents/new">
          <Button className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" /> New agent
          </Button>
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-2xl border glass-card p-10 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No agents yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Got a big one-off task that isn&apos;t worth a whole workflow? Spin up an agent to plan and run it.
          </p>
          <Link href="/agents/new" className="mt-4 inline-block">
            <Button variant="outline" size="sm">
              <Plus className="mr-1.5 h-4 w-4" /> Create your first agent
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => {
            const state = agent.agent_state ?? "draft";
            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border glass-card px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{agent.name}</p>
                    {agent.agent_saved_template && (
                      <Badge variant="secondary" className="text-[10px]">Saved</Badge>
                    )}
                  </div>
                  {agent.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{agent.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={STATE_VARIANT[state] ?? "secondary"} className="text-[10px]">
                    {STATE_LABELS[state] ?? state}
                  </Badge>
                  <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                    <Clock3 className="h-3 w-3" />
                    {new Date(agent.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
