import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Box,
  Braces,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  FileJson,
  GitBranch,
  History,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  Workflow,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RunPanel } from "./run-panel";
import { ExecutionControls } from "./execution-controls";
import { PublishPanel } from "./publish-panel";
import { SharePanel } from "./share-panel";
import { DeleteProgramButton } from "@/components/programs/delete-program-button";
import type { Json } from "@flowos/db";
import { createServiceClient } from "@/lib/api";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";

type SchemaNode = { id: string; label: string; description: string; type: string };

function parseSchema(raw: Json) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { nodes: [], edges: [], triggers: [], genesisModel: null };
  }
  const schema = raw as Record<string, Json>;
  const nodes = Array.isArray(schema.nodes) ? (schema.nodes as unknown as SchemaNode[]) : [];
  const edges = Array.isArray(schema.edges) ? schema.edges : [];
  const triggers = Array.isArray(schema.triggers) ? schema.triggers : [];
  const metadata = schema.metadata && typeof schema.metadata === "object" && !Array.isArray(schema.metadata)
    ? (schema.metadata as Record<string, Json>)
    : null;
  const genesisModel = metadata && typeof metadata.genesis_model === "string" ? metadata.genesis_model : null;
  return { nodes, edges, triggers, genesisModel };
}

function isAiGenerated(genesisModel: string | null): boolean {
  if (!genesisModel) return false;
  return genesisModel !== "manual" && genesisModel !== "template";
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeTime(value: string | null) {
  if (!value) return "no history";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) return `updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `updated ${hours}h ago`;
  return `updated ${Math.round(hours / 24)}d ago`;
}

function shortProgramId(id: string) {
  return `prg_${id.slice(0, 4)}.${id.slice(-4)}`;
}

function NodeGlyph({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  if (normalized.includes("trigger")) return <Zap className="h-4 w-4" />;
  if (normalized.includes("agent")) return <Bot className="h-4 w-4" />;
  if (normalized.includes("connection")) return <Network className="h-4 w-4" />;
  return <Circle className="h-4 w-4" />;
}

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) return notFound();
  const userCanEdit = canEdit(access);

  const { data, error } = await supabase
    .from("programs")
    .select("id, user_id, name, description, execution_mode, conflict_policy, is_active, schema, schema_version, last_run_at, created_at, updated_at, is_public, tags, fork_count, published_at, public_author_name, visibility, workspace_id")
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  type ProgramRow = {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    execution_mode: string;
    conflict_policy: string;
    is_active: boolean;
    schema: Json;
    schema_version: number | null;
    last_run_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    is_public: boolean;
    tags: string[];
    fork_count: number;
    published_at: string | null;
    public_author_name: string | null;
    visibility: string;
    workspace_id: string;
  };

  const program = data as ProgramRow;
  const { nodes, edges, genesisModel } = parseSchema(program.schema);
  const aiGenerated = isAiGenerated(genesisModel);
  const serviceClient = createServiceClient();

  const [
    triggerRowsResult,
    linkedConnsResult,
    completedRunsResult,
    totalRunsResult,
    failedRunsResult,
    creatorResult,
  ] = await Promise.all([
    serviceClient.from("triggers").select("id, type, is_active").eq("program_id", id),
    serviceClient.from("program_connections").select("connection_id").eq("program_id", id),
    serviceClient.from("runs").select("id", { count: "exact", head: true }).eq("program_id", id).eq("status", "completed"),
    serviceClient.from("runs").select("id", { count: "exact", head: true }).eq("program_id", id),
    serviceClient.from("runs").select("id", { count: "exact", head: true }).eq("program_id", id).eq("status", "failed"),
    serviceClient.from("profiles").select("display_name").eq("id", program.user_id).maybeSingle(),
  ]);

  const triggerRows = triggerRowsResult.data ?? [];
  const dbTriggerCount = triggerRows.length;
  const activeTriggerCount = triggerRows.filter((t: { is_active: boolean }) => t.is_active).length;
  const connectionIds = (linkedConnsResult.data ?? []).map((r: { connection_id: string }) => r.connection_id);

  let conflictingProgramCount = 0;
  if (connectionIds.length > 0) {
    const { data: sharedLinks } = await serviceClient
      .from("program_connections")
      .select("program_id")
      .in("connection_id", connectionIds)
      .neq("program_id", id);
    conflictingProgramCount = new Set((sharedLinks ?? []).map((r: { program_id: string }) => r.program_id)).size;
  }

  const completedRuns = completedRunsResult.count ?? 0;
  const totalRuns = totalRunsResult.count ?? 0;
  const failedRuns = failedRunsResult.count ?? 0;
  const creatorName = (creatorResult.data as { display_name?: string | null } | null)?.display_name ?? "Nicolas";
  const successRate = totalRuns === 0 ? "-" : `${Math.round((completedRuns / totalRuns) * 100)}%`;
  const actionNodeCount = Math.max(0, nodes.length - activeTriggerCount);
  const firstNode = nodes[0];

  const stats = [
    { label: "Nodes", value: nodes.length, sub: `${activeTriggerCount || 1} trigger · ${actionNodeCount} actions`, icon: Box },
    { label: "Edges", value: edges.length, sub: edges.length === 0 ? "no connections" : `${edges.length} connections`, icon: GitBranch },
    { label: "Triggers", value: activeTriggerCount, sub: dbTriggerCount === 0 ? "none configured" : `${dbTriggerCount} configured`, icon: Zap, warn: activeTriggerCount === 0 },
    { label: "Schema", value: `v${program.schema_version ?? 1}`, sub: relativeTime(program.updated_at), icon: Braces },
    { label: "Last run", value: program.last_run_at ? formatDate(program.last_run_at) : "Never", sub: program.last_run_at ? "latest execution" : "no history", icon: Clock3, small: true },
    { label: "Success rate", value: successRate, sub: `/ ${totalRuns} runs`, icon: CheckCircle2, small: true },
  ];

  return (
    <div className="w-full space-y-4 pb-10">
      <div className="space-y-5 border-b border-border pb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Programs
          </Link>
          <span>/</span>
          <span className="font-medium text-foreground">{program.name}</span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${program.is_active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              <h1 className="truncate text-3xl font-semibold tracking-normal">{program.name}</h1>
              <Badge variant="secondary">{program.is_active ? "Active" : "Inactive"}</Badge>
              {aiGenerated && (
                <Badge variant="outline" className="border-indigo-300 bg-indigo-500/10 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-400">
                  <Sparkles className="mr-1 h-3 w-3" />
                  AI-generated
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{program.description || "blank program"}</span>
              <span>·</span>
              <span>workflow</span>
              <span>·</span>
              <span>v{program.schema_version ?? 1} schema</span>
              <span>·</span>
              <span>created {formatDate(program.created_at)}</span>
              <span>·</span>
              <span className="font-mono">{shortProgramId(program.id)}</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href={`/programs/${id}/runs`}>
                <RefreshCw className="h-4 w-4" />
                Runs
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href={`/programs/${id}/triggers`}>
                <Zap className="h-4 w-4" />
                Triggers
              </Link>
            </Button>
            {userCanEdit && (
              <>
                <Button asChild variant="outline" size="sm" className="h-9">
                  <Link href={`/programs/${program.id}/settings`}>
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </Button>
                <DeleteProgramButton programId={program.id} programName={program.name} />
                <Button asChild size="sm" className="h-9 bg-indigo-600 px-4 text-white hover:bg-indigo-700">
                  <Link href={`/programs/${program.id}/editor`}>
                    <ExternalLink className="h-4 w-4" />
                    Open editor
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <section className="grid overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:grid-cols-6">
        {stats.map(({ label, value, sub, icon: Icon, warn, small }) => (
          <div key={label} className="border-b border-border p-5 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </p>
            <p className={`mt-2 font-semibold text-foreground ${small ? "text-base" : "text-2xl"}`}>{value}</p>
            <p className={`mt-1 text-xs ${warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{sub}</p>
          </div>
        ))}
      </section>

      {aiGenerated && !program.is_active && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-300 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-500/40 dark:text-indigo-100">
          <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Review this AI-generated workflow before activation.</span>{" "}
            <span className="text-muted-foreground">Output can be incorrect or incomplete.</span>{" "}
            {genesisModel && genesisModel !== "manual" && genesisModel !== "template" && (
              <span className="text-muted-foreground">Model <span className="rounded bg-background/70 px-1 font-mono text-xs">{genesisModel}</span></span>
            )}
          </p>
          <button type="button" className="text-sm text-foreground">Dismiss</button>
          <Link href={`/programs/${program.id}/editor`} className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{"Review ->"}</Link>
        </div>
      )}

      {conflictingProgramCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">{conflictingProgramCount} other programs share connections with this workflow.</span>{" "}
            <span className="text-muted-foreground">Concurrent run policy: </span>
            <span className="rounded bg-background/70 px-1 font-mono text-xs">{program.conflict_policy}</span>
          </p>
          <button type="button" className="text-sm text-foreground">Snooze</button>
          <Link href={`/programs/${id}/conflicts`} className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{"View conflicts ->"}</Link>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-4">
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Workflow topology</h2>
                  <Badge variant="outline" className="rounded-md">{nodes.length} node</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Nodes in execution order with their current role in the graph.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                  View graph
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid md:grid-cols-[200px_minmax(0,1fr)]">
              <div className="relative border-b border-border bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] bg-[length:12px_12px] p-8 md:border-b-0 md:border-r">
                <div className="mx-auto flex w-fit items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-indigo-600" />
                  <NodeGlyph type={firstNode?.type ?? "trigger"} />
                  {firstNode?.label ?? "Manual start"}
                </div>
                <div className="mx-auto my-3 h-9 w-px border-l border-dashed border-muted-foreground/50" />
                <div className="mx-auto w-fit rounded-md border border-dashed border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                  <Plus className="mr-1 inline h-3.5 w-3.5" />
                  Add next step
                </div>
              </div>

              <div>
                {nodes.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No nodes yet.</div>
                ) : (
                  nodes.map((node, i) => (
                    <div key={`${node.id}-${i}`} className="flex items-center gap-4 border-b border-border px-6 py-5 last:border-b-0">
                      <span className="text-xs text-muted-foreground">#{i + 1}</span>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-300 bg-indigo-500/10 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-400">
                        <NodeGlyph type={node.type} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{node.label}</p>
                        <p className="text-sm text-muted-foreground">{node.description || "No description."}</p>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{node.type === "trigger" ? "trigger.manual" : node.type}</span>
                      <Badge variant="outline" className="border-indigo-300 bg-indigo-500/10 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-400">{node.type}</Badge>
                    </div>
                  ))
                )}
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No further steps. Add a node to begin building the flow.
                  <div className="mt-4">
                    <Button asChild variant="outline">
                      <Link href={`/programs/${program.id}/editor`}>
                        <Plus className="h-4 w-4" />
                        Add step
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {userCanEdit && (
            <ExecutionControls
              programId={program.id}
              executionMode={program.execution_mode ?? "supervised"}
              conflictPolicy={program.conflict_policy ?? "queue"}
            />
          )}

          <RunPanel programId={program.id} />

          {userCanEdit && (
            <PublishPanel
              programId={program.id}
              initialState={{
                is_public: program.is_public ?? false,
                tags: program.tags ?? [],
                fork_count: program.fork_count ?? 0,
                published_at: program.published_at ?? null,
                public_author_name: program.public_author_name ?? null,
              }}
              hasSuccessfulRun={completedRuns > 0}
            />
          )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Operations</h2>
              <span className="text-xs text-muted-foreground">last 7d</span>
            </div>
            <div className="divide-y divide-border">
              {[
                { label: "Last run", value: program.last_run_at ? formatDate(program.last_run_at) : "Never", icon: Clock3 },
                { label: "Updated", value: formatDate(program.updated_at), icon: CalendarDays },
                { label: "Completed runs", value: completedRuns, icon: CheckCircle2 },
                { label: "Failed runs", value: failedRuns, icon: AlertTriangle },
                { label: "Created by", value: creatorName, icon: UserRound },
                { label: "Program ID", value: shortProgramId(program.id), icon: Copy, mono: true },
              ].map(({ label, value, icon: Icon, mono }) => (
                <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                  <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
                </div>
              ))}
            </div>
            <div className="divide-y divide-border border-t border-border">
              {[
                { label: "View run history", href: `/programs/${id}/runs`, icon: History },
                { label: "Manage triggers", href: `/programs/${id}/triggers`, icon: Zap },
                { label: "Conflict settings", href: `/programs/${id}/conflicts`, icon: AlertTriangle },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href} className="flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50">
                  <span className="inline-flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>

          <SharePanel programId={program.id} />

          <details className="rounded-lg border border-border bg-card shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Code2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Raw schema</span>
                <span className="block text-xs text-muted-foreground">View JSON · download · copy</span>
              </span>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </summary>
            <pre className="max-h-[420px] overflow-auto border-t border-border bg-muted p-4 text-xs leading-5">
              {JSON.stringify(program.schema, null, 2)}
            </pre>
          </details>

          <Button variant="outline" asChild className="w-full justify-start">
            <Link href="/dashboard">
              <FileJson className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
