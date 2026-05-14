import { redirect, notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import Link from "next/link";
import { ArrowLeft, Circle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Program Access — Admin" };

type Run = { id: string; status: string; triggered_by: string; started_at: string | null; completed_at: string | null; created_at: string };
type SchemaNode = { id: string; type?: string; data?: { label?: string; config?: { name?: string } } };

const STATUS_COLOR: Record<string, string> = {
  completed: "text-green-500",
  success:   "text-green-500",
  failed:    "text-red-500",
  running:   "text-yellow-500",
  cancelled: "text-muted-foreground",
  pending:   "text-muted-foreground",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function AdminGrantPage({
  params,
}: {
  params: Promise<{ grantId: string }>;
}) {
  const { grantId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  const service = createServiceClient();

  const { data: grant } = await service
    .from("support_access_grants")
    .select("id, user_id, program_id, expires_at, revoked_at, ticket_id, programs(id, name, description, schema, execution_mode, is_active)")
    .eq("id", grantId)
    .single();

  if (!grant) notFound();

  const g = grant as {
    id: string;
    user_id: string;
    program_id: string;
    expires_at: string;
    revoked_at: string | null;
    ticket_id: string | null;
    programs: { id: string; name: string; description: string | null; schema: { nodes?: SchemaNode[] } | null; execution_mode: string; is_active: boolean } | null;
  };

  if (g.revoked_at || new Date(g.expires_at) < new Date()) {
    return (
      <div className="space-y-4">
        <Link href="/admin/support" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Support
        </Link>
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          This access grant has expired or been revoked.
        </p>
      </div>
    );
  }

  const program = g.programs;
  if (!program) notFound();

  const { data: runs } = await service
    .from("runs")
    .select("id, status, triggered_by, started_at, completed_at, created_at")
    .eq("program_id", g.program_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const nodes: SchemaNode[] = program.schema?.nodes ?? [];
  const expiresIn = Math.ceil((new Date(g.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={g.ticket_id ? `/admin/support` : `/admin/support`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Support
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{program.name}</h1>
          {program.description && <p className="mt-1 text-sm text-muted-foreground">{program.description}</p>}
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${program.is_active ? "bg-green-500/15 text-green-700" : "bg-secondary text-muted-foreground"}`}>
            {program.is_active ? "Active" : "Inactive"}
          </span>
          <p className="mt-1 text-[11px] text-muted-foreground">Access expires in {expiresIn}d</p>
          <p className="text-[11px] text-muted-foreground">User: {g.user_id.slice(0, 8)}…</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Nodes */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Workflow nodes ({nodes.length})</p>
          {nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No nodes in schema.</p>
          ) : (
            <div className="space-y-1.5">
              {nodes.map((node) => (
                <div key={node.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <Circle className="h-2 w-2 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{node.data?.label ?? node.data?.config?.name ?? node.id}</span>
                  {node.type && <span className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{node.type}</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent runs */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent runs</p>
          {!runs || runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="space-y-1.5">
              {(runs as Run[]).map((run) => (
                <div key={run.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <span className={`font-medium capitalize ${STATUS_COLOR[run.status] ?? "text-foreground"}`}>{run.status}</span>
                  <span className="text-muted-foreground truncate">{run.triggered_by}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{timeAgo(run.created_at)}</span>
                </div>
              ))}
            </div>
          )}

          <form action={`/api/admin/grants/${grantId}/trigger`} method="POST" className="mt-4">
            <button
              type="submit"
              className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Trigger test run
            </button>
          </form>
        </section>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Access granted by user. Expires {new Date(g.expires_at).toLocaleDateString()}. All actions are logged.
      </p>
    </div>
  );
}
