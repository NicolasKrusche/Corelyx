import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Braces,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock3,
  FileJson,
  GitBranch,
  Globe2,
  History,
  Lock,
  Network,
  Play,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// EU AI Act Art. 50 transparency: AI-generated outputs must be labeled as such.
// "manual" = user built from scratch; "template" = imported from gallery; anything else = LLM Genesis.
function isAiGenerated(genesisModel: string | null): boolean {
  if (!genesisModel) return false;
  return genesisModel !== "manual" && genesisModel !== "template";
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readableMode(mode: string) {
  return mode.replace(/_/g, " ");
}

function NodeGlyph({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  if (normalized.includes("trigger")) return <Zap className="h-4 w-4" />;
  if (normalized.includes("agent")) return <Bot className="h-4 w-4" />;
  if (normalized.includes("connection")) return <Network className="h-4 w-4" />;
  return <Circle className="h-4 w-4" />;
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ${active ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" : "bg-slate-400"}`}
      aria-hidden="true"
    />
  );
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
    .select("id, name, description, execution_mode, conflict_policy, is_active, schema, schema_version, last_run_at, updated_at, is_public, tags, fork_count, published_at, public_author_name, visibility, workspace_id")
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  type ProgramRow = {
    id: string;
    name: string;
    description: string | null;
    execution_mode: string;
    conflict_policy: string;
    is_active: boolean;
    schema: Json;
    schema_version: number | null;
    last_run_at: string | null;
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
  const { data: triggerRows } = await serviceClient
    .from("triggers")
    .select("id, type, is_active")
    .eq("program_id", id);

  const dbTriggerCount = (triggerRows ?? []).length;
  const activeTriggerCount = (triggerRows ?? []).filter(
    (t: { is_active: boolean }) => t.is_active
  ).length;

  const { data: linkedConns } = await serviceClient
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", id);

  const connectionIds = (linkedConns ?? []).map(
    (r: { connection_id: string }) => r.connection_id
  );
  let conflictingProgramCount = 0;
  if (connectionIds.length > 0) {
    const { data: sharedLinks } = await serviceClient
      .from("program_connections")
      .select("program_id")
      .in("connection_id", connectionIds)
      .neq("program_id", id);
    const uniq = new Set((sharedLinks ?? []).map((r: { program_id: string }) => r.program_id));
    conflictingProgramCount = uniq.size;
  }

  const { count: successfulRunCount } = await serviceClient
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("program_id", id)
    .eq("status", "completed");

  const NODE_BADGE: Record<string, "default" | "secondary" | "outline"> = {
    trigger: "default",
    agent: "secondary",
    step: "outline",
    connection: "outline",
  };

  const stats = [
    { label: "Nodes", value: nodes.length, icon: Workflow },
    { label: "Edges", value: edges.length, icon: GitBranch },
    { label: "Triggers", value: dbTriggerCount, icon: Zap, sub: activeTriggerCount > 0 ? `${activeTriggerCount} active` : "None active", href: `/programs/${id}/triggers` },
    { label: "Schema", value: `v${program.schema_version ?? 1}`, icon: Braces },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1 pb-10">
      <div className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Programs
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-3xl font-semibold tracking-normal text-foreground">{program.name}</h1>
            <Badge variant={program.is_active ? "success" : "secondary"} className="gap-1.5">
              <StatusDot active={program.is_active} />
              {program.is_active ? "Active" : "Inactive"}
            </Badge>
            {aiGenerated && (
              <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300">
                <Sparkles className="mr-1 h-3 w-3" />
                AI-generated
              </Badge>
            )}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {program.description || "No description yet. Open the editor to document what this workflow does."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1">
              <Play className="h-3.5 w-3.5" />
              {readableMode(program.execution_mode)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {program.conflict_policy}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1">
              {program.visibility === "restricted" ? <Lock className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
              {program.visibility}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href={`/programs/${id}/runs`}>
              <History className="h-4 w-4" />
              Runs
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/programs/${id}/triggers`}>
              <Zap className="h-4 w-4" />
              Triggers
            </Link>
          </Button>
          {userCanEdit && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/programs/${program.id}/settings`}>
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/programs/${program.id}/editor`}>
                  <Workflow className="h-4 w-4" />
                  Open Editor
                </Link>
              </Button>
              <DeleteProgramButton programId={program.id} programName={program.name} />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, sub, href }) => {
          const content = (
            <div className="flex min-h-24 items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
                {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
            </div>
          );

          return href ? (
            <Link key={label} href={href} className="block transition-opacity hover:opacity-85">
              {content}
            </Link>
          ) : (
            <div key={label}>{content}</div>
          );
        })}
      </div>

      {(aiGenerated && !program.is_active) || conflictingProgramCount > 0 ? (
        <div className="grid gap-3">
          {aiGenerated && !program.is_active && (
            <div className="flex items-start gap-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-900 dark:text-violet-100">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Review this AI-generated workflow before activation.</p>
                <p className="mt-1 text-violet-800/80 dark:text-violet-100/75">
                  Check every node, parameter, and connection. AI output can be incorrect or incomplete.
                  {genesisModel && genesisModel !== "manual" && genesisModel !== "template" && (
                    <span className="ml-1 font-mono text-xs">model: {genesisModel}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {conflictingProgramCount > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">
                  {conflictingProgramCount} other program{conflictingProgramCount > 1 ? "s" : ""} share connections with this workflow.
                </p>
                <p className="mt-1 text-amber-800/80 dark:text-amber-100/75">
                  Current concurrent run policy is <span className="font-semibold capitalize">{program.conflict_policy}</span>.{" "}
                  <Link href={`/programs/${id}/conflicts`} className="underline underline-offset-2">
                    View conflicts
                  </Link>
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0 border-b border-border/70 pb-4">
              <div>
                <CardTitle className="text-base">Workflow topology</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Nodes in execution order, with their current role in the graph.</p>
              </div>
              <Badge variant="outline">{nodes.length} total</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {nodes.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No nodes yet.</div>
              ) : (
                <div className="divide-y divide-border">
                  {nodes.map((node, i) => (
                    <div key={`${node.id}-${i}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <NodeGlyph type={node.type} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{node.label}</p>
                          <span className="text-xs text-muted-foreground">#{i + 1}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{node.description || "No description."}</p>
                      </div>
                      <Badge variant={NODE_BADGE[node.type] ?? "outline"} className="w-fit capitalize">
                        {node.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
              hasSuccessfulRun={(successfulRunCount ?? 0) > 0}
            />
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-base">Operations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="h-4 w-4" />
                    Last run
                  </span>
                  <span className="text-sm font-medium text-foreground">{formatDate(program.last_run_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                    Updated
                  </span>
                  <span className="text-sm font-medium text-foreground">{formatDate(program.updated_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                    Completed runs
                  </span>
                  <span className="text-sm font-medium text-foreground">{successfulRunCount ?? 0}</span>
                </div>
              </div>

              <div className="grid gap-2 border-t border-border/70 pt-4">
                <Button asChild variant="outline" className="justify-start">
                  <Link href={`/programs/${id}/runs`}>
                    <History className="h-4 w-4" />
                    View run history
                  </Link>
                </Button>
                <Button asChild variant="outline" className="justify-start">
                  <Link href={`/programs/${id}/triggers`}>
                    <Zap className="h-4 w-4" />
                    Manage triggers
                  </Link>
                </Button>
                {conflictingProgramCount > 0 && (
                  <Button asChild variant="outline" className="justify-start">
                    <Link href={`/programs/${id}/conflicts`}>
                      <AlertTriangle className="h-4 w-4" />
                      Conflict settings
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <SharePanel programId={program.id} />

          <details className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
            <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              <FileJson className="h-4 w-4" />
              Raw schema
            </summary>
            <pre className="mt-4 max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
              {JSON.stringify(program.schema, null, 2)}
            </pre>
          </details>

          <Button variant="outline" asChild className="w-full justify-start">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
